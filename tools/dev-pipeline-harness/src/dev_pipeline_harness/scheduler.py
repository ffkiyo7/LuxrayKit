"""Single-concurrency coordinator and restart reconciliation."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Callable, Sequence

from .filesystem import StateLayout
from .models import Turn, TurnState
from .state import StateStore
from .systemd import SystemdError, SystemdUserClient, UnitSpec
from .transcript import load_result


class CoordinatorError(RuntimeError):
    pass


RunnerCommandBuilder = Callable[[Turn], Sequence[str]]


class Coordinator:
    def __init__(
        self,
        *,
        state: StateStore,
        layout: StateLayout,
        systemd=None,
        command_builder: RunnerCommandBuilder | None = None,
        runner_env_path: Path | None = None,
    ):
        self.state = state
        self.layout = layout.ensure()
        self.systemd = systemd or SystemdUserClient()
        self.runner_env_path = Path(runner_env_path).expanduser().resolve() if runner_env_path else None
        self.command_builder = command_builder or self._default_command

    def _default_command(self, turn: Turn) -> Sequence[str]:
        command = [sys.executable, "-m", "dev_pipeline_harness.runner_cli", "--turn-id", turn.id]
        if self.runner_env_path is not None:
            command.extend(["--env-file", str(self.runner_env_path)])
        return command

    def start_next(self) -> Turn | None:
        turn = self.state.claim_next()
        if turn is None:
            return None
        session = self.state.get_provider_session(turn.provider_session_id)
        harness_session = self.state.get_session(session.harness_session_id)
        spec = UnitSpec(
            unit_name=turn.unit_name or f"dev-pipeline-turn-{harness_session.id}-{turn.id}",
            working_directory=harness_session.worktree,
            command=tuple(self.command_builder(turn)),
        )
        try:
            self.systemd.start(spec)
        except SystemdError:
            self.state.finalize_turn(turn.id, state=TurnState.FAILED, exit_code=None, error_summary="transient unit failed to start")
            raise
        return self.state.get_turn(turn.id)

    def stop(self, turn_id: str) -> None:
        turn = self.state.get_turn(turn_id)
        if turn.unit_name:
            self.systemd.stop(turn.unit_name)

    def reconcile(self) -> list[Turn]:
        reconciled: list[Turn] = []
        for turn in self.state.list_active_turns():
            unit_state = "missing"
            if turn.unit_name:
                unit_state = self.systemd.unit_state(turn.unit_name)
            if unit_state in {"active", "activating", "deactivating", "reloading"}:
                reconciled.append(turn)
                continue
            result_path = turn.result_path
            if result_path and result_path.exists():
                try:
                    result = load_result(result_path)
                    final_state = TurnState(str(result.get("state", "")))
                    if not final_state.terminal:
                        raise ValueError("result is not terminal")
                    updated = self.state.finalize_turn(
                        turn.id,
                        state=final_state,
                        exit_code=result.get("exit_code"),
                        raw_path=Path(result["raw_path"]) if result.get("raw_path") else turn.raw_path,
                        sanitized_path=Path(result["sanitized_path"]) if result.get("sanitized_path") else turn.sanitized_path,
                        result_path=result_path,
                        error_summary=result.get("error_summary"),
                    )
                    reconciled.append(updated)
                    continue
                except (OSError, ValueError, KeyError, TypeError):
                    pass
            updated = self.state.finalize_turn(
                turn.id,
                state=TurnState.INTERRUPTED,
                exit_code=None,
                raw_path=turn.raw_path,
                sanitized_path=turn.sanitized_path,
                result_path=turn.result_path,
                error_summary="transient unit ended without a terminal result",
            )
            reconciled.append(updated)
        return reconciled
