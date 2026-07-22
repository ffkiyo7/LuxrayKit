"""Controlled local Hermes executor.

The Hermes HTTP API is intentionally not an implementation path for code
tasks because it cannot carry a trustworthy cwd/worktree field.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .pipeline.task_parser import TaskSpec
from .redaction import Redactor


class HermesExecutionError(RuntimeError):
    pass


@dataclass(frozen=True)
class HermesCommand:
    argv: tuple[str, ...]
    cwd: Path


class HermesExecutor:
    def __init__(self, *, executable: Path = Path("/home/ubuntu/.local/bin/hermes"), redactor: Redactor | None = None):
        self.executable = Path(executable)
        self.redactor = redactor or Redactor()
        if not self.executable.is_absolute():
            raise HermesExecutionError("Hermes executable must be an absolute path")

    def build_command(self, *, task: TaskSpec, worktree: Path, branch: str) -> HermesCommand:
        if not worktree.is_absolute():
            raise HermesExecutionError("Hermes worktree must be absolute")
        prompt = (
            "Execute exactly this approved TASK in the current working directory.\n\n"
            + task.prompt_constraints(worktree=worktree, branch=branch)
        )
        return HermesCommand(
            argv=(str(self.executable), "-z", prompt),
            cwd=worktree,
        )

    def run(self, command: HermesCommand, *, env: dict[str, str] | None = None) -> int:
        if not command.cwd.is_absolute():
            raise HermesExecutionError("Hermes cwd must be absolute")
        if (
            not command.argv
            or any(not isinstance(arg, str) or not arg for arg in command.argv)
            or Path(command.argv[0]).resolve() != self.executable.resolve()
            or len(command.argv) < 3
            or command.argv[1] != "-z"
        ):
            raise HermesExecutionError("Hermes code execution must use hermes -z")
        import subprocess

        safe_env = {
            "PATH": "/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(Path.home()),
        }
        for key, value in (env or {}).items():
            if not key.startswith("HARNESS_"):
                raise HermesExecutionError("refusing non-allowlisted Hermes environment")
            safe_env[key] = value
        try:
            result = subprocess.run(
                list(command.argv),
                cwd=command.cwd,
                env=safe_env,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except OSError as exc:
            raise HermesExecutionError("Hermes process could not be started") from exc
        return result.returncode


class HermesHTTPExecutor:
    def run(self, *_args, **_kwargs):
        raise HermesExecutionError("HTTP Hermes runs are forbidden for code tasks because cwd is not enforced")
