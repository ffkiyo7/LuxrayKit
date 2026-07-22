"""One-turn subprocess runner.

The runner owns the provider subprocess, not the Discord coordinator.  It
writes a durable result before finalizing SQLite state so a service restart can
reconcile an interrupted coordinator without running the same attempt again.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
from pathlib import Path
from typing import Callable, Mapping, Sequence

from .filesystem import StateLayout
from .locks import FileLock
from .models import TurnState
from .redaction import Redactor
from .state import StateStore
from .transcript import TranscriptPaths, TranscriptWriter


class RunnerError(RuntimeError):
    pass


_SAFE_ENV_NAMES = {
    "HOME",
    "PATH",
    "LANG",
    "LC_ALL",
    "TERM",
    "NO_COLOR",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
}


def build_child_environment(extra: Mapping[str, str] | None = None) -> dict[str, str]:
    """Copy only non-secret process context into a provider subprocess."""

    result = {key: value for key, value in os.environ.items() if key in _SAFE_ENV_NAMES}
    for key, value in (extra or {}).items():
        if key.upper() != key or any(marker in key.upper() for marker in ("TOKEN", "SECRET", "PASSWORD", "API_KEY")):
            raise RunnerError("refusing unsafe child environment key")
        if not key.startswith("HARNESS_"):
            raise RunnerError("child environment key is not explicitly allowlisted")
        result[key] = value
    result.setdefault("PATH", "/home/ubuntu/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    return result


class TurnRunner:
    def __init__(
        self,
        *,
        state: StateStore,
        layout: StateLayout,
        redactor: Redactor | None = None,
        lock_timeout: float | None = None,
    ):
        self.state = state
        self.layout = layout.ensure()
        self.redactor = redactor or Redactor()
        self.lock_timeout = lock_timeout

    def _paths(self, session_id: str, turn_id: str) -> TranscriptPaths:
        session_dir = self.layout.session_dir(session_id)
        suffix = turn_id.removeprefix("T-")
        return TranscriptPaths(
            raw=session_dir / f"turn-{suffix}.raw.jsonl",
            sanitized=session_dir / f"turn-{suffix}.discord.log",
            result=session_dir / f"turn-{suffix}.result.json",
        )

    def run(
        self,
        turn_id: str,
        argv: Sequence[str],
        *,
        cwd: Path,
        extra_env: Mapping[str, str] | None = None,
        line_handler: Callable[[str, str], None] | None = None,
    ):
        if not argv or any(not isinstance(arg, str) or not arg for arg in argv):
            raise RunnerError("provider command is empty")
        if not Path(cwd).is_absolute():
            raise RunnerError("provider cwd must be absolute")
        return asyncio.run(self._run(turn_id, tuple(argv), Path(cwd), extra_env or {}, line_handler))

    async def _run(
        self,
        turn_id: str,
        argv: tuple[str, ...],
        cwd: Path,
        extra_env: Mapping[str, str],
        line_handler: Callable[[str, str], None] | None,
    ):
        loop = asyncio.get_running_loop()
        task = asyncio.current_task()
        installed_signals: list[signal.Signals] = []
        if task is not None:
            for signum in (signal.SIGTERM, signal.SIGINT):
                try:
                    loop.add_signal_handler(signum, task.cancel)
                    installed_signals.append(signum)
                except (NotImplementedError, RuntimeError):
                    pass
        try:
            return await self._run_body(turn_id, argv, cwd, extra_env, line_handler)
        finally:
            for signum in installed_signals:
                try:
                    loop.remove_signal_handler(signum)
                except (NotImplementedError, RuntimeError):
                    pass

    async def _run_body(
        self,
        turn_id: str,
        argv: tuple[str, ...],
        cwd: Path,
        extra_env: Mapping[str, str],
        line_handler: Callable[[str, str], None] | None,
    ):
        turn = self.state.get_turn(turn_id)
        session = self.state.get_provider_session(turn.provider_session_id)
        harness_session = self.state.get_session(session.harness_session_id)
        if cwd.resolve() != harness_session.worktree.resolve():
            raise RunnerError("provider cwd does not match recorded session worktree")
        paths = self._paths(harness_session.id, turn.id)
        writer = TranscriptWriter(paths, self.redactor)
        self.state.update_turn_paths(
            turn.id,
            raw_path=paths.raw,
            sanitized_path=paths.sanitized,
            result_path=paths.result,
        )
        self.state.ensure_event_cursor(turn.id)
        worktree_lock_path = self.layout.worktree_lock_path(harness_session.worktree)
        exit_code: int | None = None
        final_state = TurnState.FAILED
        error_summary: str | None = None
        process: asyncio.subprocess.Process | None = None
        try:
            with FileLock(self.layout.global_runner_lock_path, timeout=self.lock_timeout):
                with FileLock(worktree_lock_path, timeout=self.lock_timeout):
                    self.state.mark_turn_running(turn.id)
                    env = build_child_environment(extra_env)
                    try:
                        process = await asyncio.create_subprocess_exec(
                            *argv,
                            cwd=str(cwd),
                            env=env,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        assert process.stdout is not None
                        assert process.stderr is not None

                        async def consume(stream, name: str) -> None:
                            while True:
                                line = await stream.readline()
                                if not line:
                                    break
                                text = line.decode("utf-8", errors="replace").rstrip("\r\n")
                                writer.append(stream=name, line=text)
                                if line_handler is not None:
                                    line_handler(name, text)

                        await asyncio.gather(
                            consume(process.stdout, "stdout"),
                            consume(process.stderr, "stderr"),
                            process.wait(),
                        )
                        exit_code = process.returncode
                        if exit_code == 0:
                            final_state = TurnState.SUCCEEDED
                        elif exit_code is not None and exit_code < 0:
                            final_state = TurnState.INTERRUPTED
                            error_summary = "provider process was interrupted"
                        else:
                            final_state = TurnState.FAILED
                            error_summary = f"provider exited with code {exit_code}"
                    except asyncio.CancelledError:
                        if process is not None and process.returncode is None:
                            process.terminate()
                            await process.wait()
                        final_state = TurnState.INTERRUPTED
                        error_summary = "runner task was cancelled"
                        raise
                    except OSError:
                        final_state = TurnState.FAILED
                        error_summary = "provider process could not be started"
        except asyncio.CancelledError:
            # The durable result is still written below before the exception is
            # re-raised to the transient unit.
            pass
        except Exception:
            final_state = TurnState.FAILED
            error_summary = "runner failed before provider completion"

        result = {
            "turn_id": turn.id,
            "state": final_state.value,
            "exit_code": exit_code,
            "unit_name": turn.unit_name,
            "error_summary": self.redactor.redact(error_summary) if error_summary else None,
            "raw_path": str(paths.raw),
            "sanitized_path": str(paths.sanitized),
            "result_path": str(paths.result),
        }
        writer.write_result(result)
        self.state.finalize_turn(
            turn.id,
            state=final_state,
            exit_code=exit_code,
            raw_path=paths.raw,
            sanitized_path=paths.sanitized,
            result_path=paths.result,
            error_summary=result["error_summary"],
        )
        return result


def run_turn_from_cli(turn_id: str, argv: Sequence[str], cwd: Path, state_dir: Path) -> dict:
    with StateStore(state_dir / "harness.sqlite3") as state:
        runner = TurnRunner(state=state, layout=StateLayout.from_state_dir(state_dir))
        return runner.run(turn_id, argv, cwd=cwd)
