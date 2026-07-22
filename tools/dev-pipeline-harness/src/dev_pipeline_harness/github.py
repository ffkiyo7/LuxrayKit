"""Mockable GitHub/gh facts and explicit SHA-guarded merge."""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from typing import Protocol


class GitHubError(RuntimeError):
    pass


@dataclass(frozen=True)
class PullRequestFacts:
    number: int
    is_draft: bool
    head_branch: str
    head_sha: str
    url: str
    state: str = "OPEN"


@dataclass(frozen=True)
class ChecksFacts:
    green: bool
    summaries: tuple[str, ...] = ()


class GitHubClient(Protocol):
    def create_draft_pr(self, *, branch: str, title: str, body: str) -> PullRequestFacts: ...
    def get_pr(self, number: int) -> PullRequestFacts: ...
    def get_checks(self, number: int) -> ChecksFacts: ...
    def merge(self, *, number: int, match_head_commit: str) -> None: ...


class GhClient:
    def __init__(self, *, executable: str = "gh", cwd=None):
        self.executable = executable
        self.cwd = cwd

    def _run(self, args: list[str]) -> str:
        result = self._run_result(args, check=True)
        return result.stdout.strip()

    def _run_result(self, args: list[str], *, check: bool) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(
                [self.executable, *args],
                cwd=self.cwd,
                check=check,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env={
                    "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                    "HOME": os.environ.get("HOME", str(os.path.expanduser("~"))),
                    "GH_PAGER": "cat",
                    "GIT_PAGER": "cat",
                },
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            raise GitHubError("GitHub command failed") from exc
        return result

    @staticmethod
    def _facts(payload: dict) -> PullRequestFacts:
        try:
            return PullRequestFacts(
                number=int(payload["number"]),
                is_draft=bool(payload["isDraft"]),
                head_branch=str(payload["headRefName"]),
                head_sha=str(payload["headRefOid"]),
                url=str(payload.get("url", "")),
                state=str(payload.get("state", "OPEN")),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise GitHubError("GitHub returned incomplete PR facts") from exc

    def create_draft_pr(self, *, branch: str, title: str, body: str) -> PullRequestFacts:
        if not re.fullmatch(r"pipeline/S-[0-9]{4}", branch):
            raise GitHubError("refusing to create a PR from a non-pipeline branch")
        self._run(["pr", "create", "--draft", "--base", "main", "--head", branch, "--title", title, "--body", body])
        # Re-read server facts rather than trusting the create command output.
        raw = self._run(["pr", "list", "--head", branch, "--state", "open", "--json", "number,isDraft,headRefName,headRefOid,url,state"])
        rows = json.loads(raw)
        if not isinstance(rows, list) or len(rows) != 1:
            raise GitHubError("could not identify the newly-created PR")
        return self._facts(rows[0])

    def get_pr(self, number: int) -> PullRequestFacts:
        raw = self._run(["pr", "view", str(number), "--json", "number,isDraft,headRefName,headRefOid,url,state"])
        return self._facts(json.loads(raw))

    def get_checks(self, number: int) -> ChecksFacts:
        # gh 2.45.0 (the VPS version) has no --json mode for `pr checks`.
        # Its exit code is the authoritative aggregate status; retain only a
        # bounded, non-secret text summary for the state card/audit trail.
        result = self._run_result(["pr", "checks", str(number)], check=False)
        output = (result.stdout or "").strip()
        lines = tuple(line[:300] for line in output.splitlines() if line.strip())
        if not lines:
            return ChecksFacts(False, ("no CI checks reported",))
        if any("no checks" in line.casefold() for line in lines):
            return ChecksFacts(False, lines)
        return ChecksFacts(result.returncode == 0, lines)

    def merge(self, *, number: int, match_head_commit: str) -> None:
        if not re.fullmatch(r"[0-9a-fA-F]{40}", match_head_commit):
            raise GitHubError("merge requires a full head SHA")
        self._run(["pr", "merge", str(number), "--squash", "--match-head-commit", match_head_commit])
