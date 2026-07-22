from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dev_pipeline_harness.github import ChecksFacts, GhClient, PullRequestFacts
from dev_pipeline_harness.pipeline.gates import GateError, PipelineController
from dev_pipeline_harness.pipeline.task_parser import InvalidTask, parse_task
from dev_pipeline_harness.preview import PreviewFacts
from dev_pipeline_harness.state import StateStore
from dev_pipeline_harness.models import Provider, SessionStatus, TurnState
from dev_pipeline_harness.filesystem import StateLayout


class FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakePreview:
    def check(self, url):
        return PreviewFacts(url, True, 200, "ok")


class FakeGitHub:
    def __init__(self, sha):
        self.sha = sha
        self.merge_calls = []
        self.pr = PullRequestFacts(7, True, "pipeline/S-0001", sha, "https://github.invalid/pr/7")

    def create_draft_pr(self, *, branch, title, body):
        self.pr = PullRequestFacts(7, True, branch, self.sha, "https://github.invalid/pr/7")
        return self.pr

    def get_pr(self, number):
        return self.pr

    def get_checks(self, number):
        return ChecksFacts(True, ("ci: SUCCESS/SUCCESS",))

    def merge(self, *, number, match_head_commit):
        self.merge_calls.append((number, match_head_commit))


class ParserTests(unittest.TestCase):
    def test_task_requires_all_sections_and_enforces_paths(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            path = Path(directory) / "TASK.md"
            path.write_text(
                """# TASK\n\n## 目标\n写一个安全修复。\n\n## 允许改动\n```text\nsrc/a.py\ntests/**\n```\n\n## 禁区\n不要改部署。\n\n## 接口\n保持函数签名。\n\n## DoD\n测试通过。\n\n## 验证命令\n```text\npython -m unittest\n```\n""",
                encoding="utf-8",
            )
            task = parse_task(path)
            self.assertTrue(task.allows_path("src/a.py"))
            self.assertTrue(task.allows_path("tests/test_a.py"))
            self.assertFalse(task.allows_path("../secrets.txt"))
            with self.assertRaises(InvalidTask):
                task.validate_changed_paths(["ops/service"])
            prompt = task.prompt_constraints(worktree=Path("/tmp/worktree"), branch="pipeline/S-0001")
            self.assertIn("Allowed files only", prompt)

    def test_task_without_interface_or_verification_is_rejected(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            path = Path(directory) / "TASK.md"
            path.write_text("# TASK\n\n## 目标\nDo it.\n", encoding="utf-8")
            with self.assertRaises(InvalidTask):
                parse_task(path)


class GitHubClientTests(unittest.TestCase):
    def test_checks_uses_supported_text_command_and_exit_code(self):
        completed = subprocess.CompletedProcess(
            ["gh"], 0, stdout="build\tpass\n", stderr=""
        )
        with patch("dev_pipeline_harness.github.subprocess.run", return_value=completed) as run:
            facts = GhClient().get_checks(7)
        self.assertTrue(facts.green)
        self.assertEqual(facts.summaries, ("build\tpass",))
        self.assertEqual(run.call_args.args[0], ["gh", "pr", "checks", "7"])

    def test_failed_checks_are_not_green(self):
        completed = subprocess.CompletedProcess(
            ["gh"], 1, stdout="build\tfail\n", stderr=""
        )
        with patch("dev_pipeline_harness.github.subprocess.run", return_value=completed):
            facts = GhClient().get_checks(7)
        self.assertFalse(facts.green)
        self.assertEqual(facts.summaries, ("build\tfail",))


class GateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        root = Path(self.temp.name)
        self.root = root
        self.layout = StateLayout.from_state_dir(root / "state").ensure()
        self.state = StateStore(self.layout.db_path)
        worktree = root / "worktree"
        worktree.mkdir()
        subprocess.run(["git", "init", "-b", "pipeline/S-0001", str(worktree)], check=True, stdout=subprocess.DEVNULL)
        (worktree / "README.md").write_text("clean\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(worktree), "add", "README.md"], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(
            [
                "git",
                "-C",
                str(worktree),
                "-c",
                "user.name=Harness Test",
                "-c",
                "user.email=harness@example.invalid",
                "commit",
                "-m",
                "initial",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        self.session = self.state.create_session(
            source_message_id="source-1",
            repo=root / "repo",
            worktree=worktree,
            branch="pipeline/S-0001",
        )
        provider = self.state.create_provider_session(
            harness_session_id=self.session.id,
            provider=Provider.CODEX,
            default_model="model-a",
        )
        turn = self.state.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="model-a",
            configured_model="model-a",
        )
        self.state.enqueue_turn(turn.id)
        self.state.claim_next()
        self.state.finalize_turn(turn.id, state=TurnState.SUCCEEDED, exit_code=0)
        self.state.transition_session(self.session.id, SessionStatus.PLAN_APPROVED)
        self.state.transition_session(self.session.id, SessionStatus.TASK_RUNNING)
        self.state.transition_session(self.session.id, SessionStatus.REVIEW_PENDING)
        self.plan = worktree / "docs" / "plans" / "PLAN.md"
        self.plan.parent.mkdir(parents=True)
        self.plan.write_text("# plan\n", encoding="utf-8")
        self.controller = PipelineController(state=self.state, preview_checker=FakePreview())
        self.controller.register_plan(session_id=self.session.id, plan_path=self.plan, base_sha="b" * 40)
        subprocess.run(["git", "-C", str(worktree), "add", "docs/plans/PLAN.md"], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(
            [
                "git",
                "-C",
                str(worktree),
                "-c",
                "user.name=Harness Test",
                "-c",
                "user.email=harness@example.invalid",
                "commit",
                "-m",
                "plan",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        self.sha = subprocess.run(
            ["git", "-C", str(worktree), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            text=True,
        ).stdout.strip()
        self.github = FakeGitHub(self.sha)

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def test_wrong_sha_ci_or_preview_cannot_merge(self):
        self.controller.record_review(session_id=self.session.id, passed=True, summary="ok")
        self.controller.open_draft_pr(
            session_id=self.session.id,
            github=self.github,
            title="docs: dogfood",
            body="safe",
            head_sha=self.sha,
        )
        with self.assertRaises(GateError):
            self.controller.accept(
                session_id=self.session.id,
                caller_id="owner",
                owner_id="owner",
                pr_number=7,
                full_head_sha="b" * 40,
                github=self.github,
            )
        self.assertEqual(self.github.merge_calls, [])
        self.controller.record_ci(session_id=self.session.id, github=self.github)
        self.controller.record_preview(session_id=self.session.id, url="https://preview.invalid")
        self.assertEqual(self.state.get_session(self.session.id).status, SessionStatus.PREVIEW_READY)
        with self.assertRaises(GateError):
            self.controller.accept(
                session_id=self.session.id,
                caller_id="not-owner",
                owner_id="owner",
                pr_number=7,
                full_head_sha=self.sha,
                github=self.github,
            )
        with self.assertRaises(GateError):
            self.controller.accept(
                session_id=self.session.id,
                caller_id="owner",
                owner_id="owner",
                pr_number=7,
                full_head_sha="b" * 40,
                github=self.github,
            )
        self.assertEqual(self.github.merge_calls, [])

    def test_verification_strings_are_tokenized_without_a_shell(self):
        result = self.controller.run_verification(
            worktree=self.root / "worktree",
            commands=[f"{sys.executable} -c 'print(1)'"],
        )
        self.assertTrue(result[0].passed)
        self.assertEqual(result[0].command[:2], (sys.executable, "-c"))
        with self.assertRaises(GateError):
            self.controller.run_verification(worktree=self.root / "worktree", commands=["echo ok && touch bad"])

    def test_green_facts_and_full_sha_are_required_for_the_only_merge_call(self):
        self.controller.record_review(session_id=self.session.id, passed=True, summary="ok")
        self.controller.open_draft_pr(
            session_id=self.session.id,
            github=self.github,
            title="docs: dogfood",
            body="safe",
            head_sha=self.sha,
        )
        self.controller.record_ci(session_id=self.session.id, github=self.github)
        self.controller.record_preview(session_id=self.session.id, url="https://preview.invalid")
        facts = self.controller.accept(
            session_id=self.session.id,
            caller_id="owner",
            owner_id="owner",
            pr_number=7,
            full_head_sha=self.sha,
            github=self.github,
        )
        self.assertTrue(facts.preview_healthy)
        self.assertEqual(self.github.merge_calls, [(7, self.sha)])
        self.assertEqual(self.state.get_session(self.session.id).status, SessionStatus.MERGED)


if __name__ == "__main__":
    unittest.main()
