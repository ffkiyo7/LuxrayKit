"""Transient-unit entrypoint: resolve one recorded turn to a provider argv."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

from .adapters import ClaudeAdapter, CodexAdapter
from .adapters.sessions import ProviderSessionController
from .config import Config
from .doctor import load_env_file
from .filesystem import StateLayout
from .models import Provider
from .redaction import Redactor
from .runner import TurnRunner, build_child_environment
from .state import StateStore


def _default_env_path() -> Path:
    return Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "dev-pipeline-harness" / "env"


def run_recorded_turn(*, turn_id: str, env_path: Path) -> dict:
    values = load_env_file(env_path)
    config = Config.from_env(values)
    layout = StateLayout.from_state_dir(config.state_dir)
    redactor = Redactor({config.discord_token} if config.discord_token else set())
    with StateStore(layout.db_path) as state:
        turn = state.get_turn(turn_id)
        provider_session = state.get_provider_session(turn.provider_session_id)
        harness_session = state.get_session(provider_session.harness_session_id)
        if not turn.input_path or not turn.input_path.is_file():
            raise RuntimeError("turn input pack is missing")
        prompt = turn.input_path.read_text(encoding="utf-8")
        if provider_session.provider is Provider.CODEX:
            if not config.codex_bin:
                raise RuntimeError("CODEX_BIN is not configured")
            adapter = CodexAdapter(
                config.codex_bin,
                allowed_models=config.codex_allowed_models,
                allowed_efforts=config.codex_allowed_efforts,
                redactor=redactor,
            )
        else:
            if not config.claude_bin:
                raise RuntimeError("CLAUDE_BIN is not configured")
            adapter = ClaudeAdapter(
                config.claude_bin,
                allowed_models=config.claude_allowed_models,
                allowed_efforts=config.claude_allowed_efforts,
                redactor=redactor,
            )
        if provider_session.provider_session_id:
            argv = adapter.resume_command(
                model=turn.configured_model,
                provider_session_id=provider_session.provider_session_id,
                prompt=prompt,
                effort=turn.configured_effort,
            )
            command_type = "resume"
        else:
            argv = adapter.new_command(
                model=turn.configured_model,
                prompt=prompt,
                effort=turn.configured_effort,
            )
            command_type = "new"
        try:
            version_result = subprocess.run(
                adapter.version_command(),
                cwd=harness_session.worktree,
                env=build_child_environment(),
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError("provider version check failed") from exc
        if version_result.returncode != 0 or not version_result.stdout.strip():
            raise RuntimeError("provider version check failed")
        cli_version = redactor.redact(version_result.stdout.strip())[:200]
        state.record_audit(
            actor="runner",
            action="provider-start",
            harness_session_id=harness_session.id,
            turn_id=turn.id,
            unit_name=turn.unit_name,
            details_json=json.dumps(
                {
                    "provider": provider_session.provider.value,
                    "cli_version": cli_version,
                    "cwd": str(harness_session.worktree),
                    "command_type": command_type,
                    "requested_model": turn.requested_model,
                    "configured_model": turn.configured_model,
                    "requested_effort": turn.requested_effort,
                    "configured_effort": turn.configured_effort,
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
        )
        controller = ProviderSessionController(
            state=state,
            layout=layout,
            allowlists={
                Provider.CODEX: config.codex_allowed_models,
                Provider.CLAUDE: config.claude_allowed_models,
            },
            effort_allowlists={
                Provider.CODEX: config.codex_allowed_efforts,
                Provider.CLAUDE: config.claude_allowed_efforts,
            },
        )

        def handle_line(stream: str, line: str) -> None:
            if stream != "stdout":
                return
            for event in adapter.parse_line(line):
                controller.record_event(turn.id, event)

        runner = TurnRunner(state=state, layout=layout, redactor=redactor)
        return runner.run(
            turn.id,
            argv,
            cwd=harness_session.worktree,
            line_handler=handle_line,
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m dev_pipeline_harness.runner_cli")
    parser.add_argument("--turn-id", required=True)
    parser.add_argument("--env-file", type=Path, default=_default_env_path())
    args = parser.parse_args(argv)
    result = run_recorded_turn(turn_id=args.turn_id, env_path=args.env_file)
    return 0 if result["state"] == "succeeded" else 1


if __name__ == "__main__":
    raise SystemExit(main())
