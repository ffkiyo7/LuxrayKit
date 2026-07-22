"""Deterministic PLAN/TASK/review/PR/CI/preview/accept gates."""

from __future__ import annotations

import hashlib
import json
import re
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from ..github import ChecksFacts, GitHubClient, GitHubError, PullRequestFacts
from ..models import SessionStatus
from ..preview import PreviewHealthChecker
from ..redaction import Redactor
from ..runner import build_child_environment
from ..state import InvalidTransition, NotFoundError, StateError, StateStore
from .task_parser import InvalidTask, TaskSpec, parse_task


class GateError(RuntimeError):
    pass


@dataclass(frozen=True)
class VerificationResult:
    command: tuple[str, ...]
    passed: bool
    summary: str


@dataclass(frozen=True)
class AcceptFacts:
    pr: PullRequestFacts
    checks: ChecksFacts
    preview_healthy: bool


class PipelineController:
    def __init__(
        self,
        *,
        state: StateStore,
        preview_checker: PreviewHealthChecker | None = None,
        command_runner=subprocess.run,
        redactor: Redactor | None = None,
    ):
        self.state = state
        self.preview_checker = preview_checker or PreviewHealthChecker()
        self.command_runner = command_runner
        self.redactor = redactor or Redactor()

    def register_plan(self, *, session_id: str, plan_path: Path, base_sha: str) -> None:
        session = self.state.get_session(session_id)
        if not re.fullmatch(r"[0-9a-fA-F]{40}", base_sha):
            raise GateError("PLAN base SHA must be a full 40-character commit SHA")
        plan_path = Path(plan_path).resolve()
        try:
            plan_path.relative_to(session.worktree.resolve())
        except ValueError as exc:
            raise GateError("PLAN must be inside the session worktree") from exc
        if plan_path.suffix != ".md" or not plan_path.exists():
            raise GateError("PLAN must be an existing Markdown file")
        plan_hash = hashlib.sha256(plan_path.read_bytes()).hexdigest()
        try:
            self.state.create_pipeline_run(
                session_id,
                plan_path=plan_path,
                plan_hash=plan_hash,
                base_sha=base_sha,
            )
        except StateError as exc:
            try:
                self.state.get_pipeline_run(session_id)
            except NotFoundError:
                raise GateError("pipeline record is missing") from exc
            self.state.update_pipeline_run(
                session_id,
                plan_path=plan_path,
                plan_hash=plan_hash,
                base_sha=base_sha,
            )

    def validate_task(self, *, session_id: str, task_path: Path) -> TaskSpec:
        session = self.state.get_session(session_id)
        task_path = Path(task_path).resolve()
        try:
            task_path.relative_to(session.worktree.resolve())
        except ValueError as exc:
            raise GateError("TASK must be inside the session worktree") from exc
        try:
            return parse_task(task_path)
        except InvalidTask as exc:
            raise GateError(str(exc)) from exc

    def changed_paths(self, *, worktree: Path) -> tuple[str, ...]:
        paths: set[str] = set()
        try:
            for command in (
                ["git", "-C", str(worktree), "diff", "--name-only", "HEAD"],
                ["git", "-C", str(worktree), "ls-files", "--others", "--exclude-standard"],
            ):
                result = self.command_runner(
                    command,
                    cwd=worktree,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=build_child_environment(),
                )
                paths.update(path for path in result.stdout.splitlines() if path.strip())
        except (OSError, subprocess.CalledProcessError) as exc:
            raise GateError("could not inspect worktree diff") from exc
        return tuple(sorted(paths))

    def verify_task_scope(self, *, task: TaskSpec, changed_paths: Sequence[str]) -> None:
        try:
            task.validate_changed_paths(list(changed_paths))
        except InvalidTask as exc:
            raise GateError(str(exc)) from exc

    def run_verification(
        self,
        *,
        worktree: Path,
        commands: Sequence[Sequence[str] | str],
    ) -> tuple[VerificationResult, ...]:
        results: list[VerificationResult] = []
        for command in commands:
            if isinstance(command, str):
                try:
                    argv = tuple(shlex.split(command))
                except ValueError as exc:
                    raise GateError("verification command has invalid quoting") from exc
            else:
                argv = tuple(command)
            if not argv or any(not isinstance(arg, str) or not arg for arg in argv):
                raise GateError("verification command must be an argv list")
            if any(token in {";", "&&", "||", "|", ">", ">>", "<"} or "$(" in token or "`" in token for token in argv):
                raise GateError("verification commands may not contain shell operators")
            try:
                completed = self.command_runner(
                    list(argv),
                    cwd=worktree,
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=build_child_environment(),
                )
            except OSError as exc:
                results.append(VerificationResult(argv, False, "command could not be started"))
                continue
            summary = self.redactor.redact((completed.stdout + "\n" + completed.stderr).strip())
            summary = summary[-1000:] if summary else ""
            results.append(VerificationResult(argv, completed.returncode == 0, summary))
        return tuple(results)

    def record_review(self, *, session_id: str, passed: bool, summary: str) -> SessionStatus:
        pipeline = self.state.get_pipeline_run(session_id)
        session = self.state.get_session(session_id)
        if passed and session.status is not SessionStatus.REVIEW_PENDING:
            raise GateError("review can pass only from review_pending")
        if not passed and session.status not in {SessionStatus.REVIEW_PENDING, SessionStatus.TASK_RUNNING}:
            raise GateError("review failure can only return to task/review state")
        round_number = pipeline.review_round + 1
        self.state.update_pipeline_run(session_id, review_round=round_number)
        if passed:
            self.state.record_audit(
                actor="strong-model",
                action="review-passed",
                harness_session_id=session_id,
                details_json=json.dumps(
                    {"round": round_number, "summary": self.redactor.redact(summary)[:2000]},
                    ensure_ascii=False,
                ),
            )
            return session.status
        self.state.record_audit(
            actor="strong-model",
            action="review-failed",
            harness_session_id=session_id,
            details_json=json.dumps(
                {"round": round_number, "summary": self.redactor.redact(summary)[:2000]},
                ensure_ascii=False,
            ),
        )
        if round_number >= 2:
            if session.status is not SessionStatus.NEEDS_OWNER:
                try:
                    self.state.transition_session(session_id, SessionStatus.NEEDS_OWNER)
                except InvalidTransition as exc:
                    raise GateError("failed review requires owner intervention") from exc
            return SessionStatus.NEEDS_OWNER
        if session.status is SessionStatus.REVIEW_PENDING:
            self.state.transition_session(session_id, SessionStatus.TASK_RUNNING)
        return SessionStatus.TASK_RUNNING

    def open_draft_pr(
        self,
        *,
        session_id: str,
        github: GitHubClient,
        title: str,
        body: str,
        head_sha: str,
    ) -> PullRequestFacts:
        session = self.state.get_session(session_id)
        pipeline = self.state.get_pipeline_run(session_id)
        if not re.fullmatch(r"[0-9a-fA-F]{40}", head_sha):
            raise GateError("PR head SHA must be a full 40-character commit SHA")
        if session.status is not SessionStatus.REVIEW_PENDING:
            raise GateError("PR can open only after review_pending")
        if not re.fullmatch(r"pipeline/S-[0-9]{4}", session.branch):
            raise GateError("PR branch is outside the pipeline namespace")
        if not pipeline.plan_path or not pipeline.plan_path.is_file():
            raise GateError("recorded PLAN is missing")
        if pipeline.plan_hash:
            current_plan_hash = hashlib.sha256(pipeline.plan_path.read_bytes()).hexdigest()
            if current_plan_hash != pipeline.plan_hash:
                raise GateError("recorded PLAN changed after approval")
        try:
            branch_result = self.command_runner(
                ["git", "-C", str(session.worktree), "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=session.worktree,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=build_child_environment(),
            )
            head_result = self.command_runner(
                ["git", "-C", str(session.worktree), "rev-parse", "HEAD"],
                cwd=session.worktree,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=build_child_environment(),
            )
            clean_result = self.command_runner(
                ["git", "-C", str(session.worktree), "status", "--porcelain"],
                cwd=session.worktree,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=build_child_environment(),
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            raise GateError("could not verify worktree before opening PR") from exc
        if branch_result.stdout.strip() != session.branch:
            raise GateError("worktree branch does not match the Harness session")
        if head_result.stdout.strip().lower() != head_sha.lower():
            raise GateError("worktree HEAD does not match the proposed PR head SHA")
        if clean_result.stdout.strip():
            raise GateError("worktree must be clean before opening a PR")
        try:
            facts = github.create_draft_pr(
                branch=session.branch,
                title=self.redactor.redact(title)[:300],
                body=self.redactor.redact(body),
            )
        except GitHubError as exc:
            raise GateError("could not create draft PR") from exc
        if not facts.is_draft or facts.state.upper() != "OPEN" or facts.head_branch != session.branch or facts.head_sha.lower() != head_sha.lower():
            raise GateError("new PR facts did not match the recorded head")
        self.state.update_pipeline_run(session_id, pr_number=facts.number, head_sha=head_sha)
        self.state.transition_session(session_id, SessionStatus.PR_OPEN)
        self.state.record_audit(
            actor="harness",
            action="draft-pr-opened",
            harness_session_id=session_id,
            details_json=json.dumps(
                {"pr_number": facts.number, "head_sha": facts.head_sha},
                ensure_ascii=False,
            ),
        )
        return facts

    def record_ci(self, *, session_id: str, github: GitHubClient) -> ChecksFacts:
        pipeline = self.state.get_pipeline_run(session_id)
        if pipeline.pr_number is None:
            raise GateError("CI cannot be recorded without a PR")
        facts = github.get_checks(pipeline.pr_number)
        if not facts.green:
            raise GateError("CI is not green")
        self.state.update_pipeline_run(session_id, ci_state="passed")
        self.state.transition_session(session_id, SessionStatus.CI_PASSED)
        self.state.record_audit(
            actor="harness",
            action="ci-passed",
            harness_session_id=session_id,
            details_json=json.dumps({"summaries": facts.summaries}, ensure_ascii=False),
        )
        return facts

    def record_preview(self, *, session_id: str, url: str) -> None:
        pipeline = self.state.get_pipeline_run(session_id)
        if not pipeline.pr_number:
            raise GateError("preview cannot be recorded without a PR")
        facts = self.preview_checker.check(url)
        if not facts.healthy:
            raise GateError("preview health gate failed")
        self.state.update_pipeline_run(session_id, preview_url=url)
        self.state.transition_session(session_id, SessionStatus.PREVIEW_READY)
        self.state.record_audit(
            actor="harness",
            action="preview-ready",
            harness_session_id=session_id,
            details_json=json.dumps({"preview_url": self.redactor.redact(url)}, ensure_ascii=False),
        )

    def accept(
        self,
        *,
        session_id: str,
        caller_id: str,
        owner_id: str,
        pr_number: int,
        full_head_sha: str,
        github: GitHubClient,
    ) -> AcceptFacts:
        if str(caller_id) != str(owner_id):
            raise GateError("only the configured owner may accept a PR")
        if not re.fullmatch(r"[0-9a-fA-F]{40}", full_head_sha):
            raise GateError("accept requires the full head SHA")
        session = self.state.get_session(session_id)
        pipeline = self.state.get_pipeline_run(session_id)
        if session.status is not SessionStatus.PREVIEW_READY:
            raise GateError("session is not preview_ready")
        if pipeline.pr_number != pr_number:
            raise GateError("PR number does not match pipeline state")
        facts = github.get_pr(pr_number)
        if (
            not facts.is_draft
            or facts.state.upper() != "OPEN"
            or facts.head_branch != session.branch
            or facts.head_sha.lower() != full_head_sha.lower()
        ):
            raise GateError("live PR facts do not match owner-provided draft/head SHA")
        checks = github.get_checks(pr_number)
        if not checks.green:
            raise GateError("CI is not green at accept time")
        if not pipeline.preview_url:
            raise GateError("preview URL is missing")
        preview = self.preview_checker.check(pipeline.preview_url)
        if not preview.healthy:
            raise GateError("preview is not healthy at accept time")
        # Perform the external merge before moving durable state to accepted.
        # A failed merge must leave the session retryable instead of making a
        # second accept impossible from an already-accepted state.
        github.merge(number=pr_number, match_head_commit=full_head_sha)
        self.state.update_pipeline_run(
            session_id,
            accepted_by=str(caller_id),
            accepted_head_sha=full_head_sha,
        )
        self.state.transition_session(session_id, SessionStatus.ACCEPTED)
        self.state.transition_session(session_id, SessionStatus.MERGED)
        self.state.record_audit(
            actor=str(caller_id),
            action="owner-accept-merged",
            harness_session_id=session_id,
            details_json=json.dumps(
                {"pr_number": pr_number, "head_sha": full_head_sha},
                ensure_ascii=False,
            ),
        )
        return AcceptFacts(facts, checks, True)

    def reject(self, *, session_id: str, caller_id: str, owner_id: str, feedback: str) -> None:
        if str(caller_id) != str(owner_id):
            raise GateError("only the configured owner may reject")
        if not feedback.strip():
            raise GateError("reject feedback is required")
        session = self.state.get_session(session_id)
        if session.status not in {SessionStatus.PR_OPEN, SessionStatus.CI_PASSED, SessionStatus.PREVIEW_READY}:
            raise GateError("session has no reviewable pipeline state")
        self.state.record_audit(
            actor=str(caller_id),
            action="owner-reject",
            harness_session_id=session_id,
            details_json=json.dumps(
                {"feedback": self.redactor.redact(feedback)[:2000]},
                ensure_ascii=False,
            ),
        )
        self.state.transition_session(session_id, SessionStatus.REVIEW_PENDING)
