"""CLI for doctor, bot, reconcile, transient turns and wrapper install."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .config import Config
from .doctor import install_codex_wrapper, load_env_file, run_doctor


def _default_env_path() -> Path:
    return Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "dev-pipeline-harness" / "env"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dev-pipeline-harness")
    sub = parser.add_subparsers(dest="command", required=True)
    doctor = sub.add_parser("doctor")
    doctor.add_argument("--env-file", type=Path, default=_default_env_path())
    bot = sub.add_parser("bot")
    bot.add_argument("--env-file", type=Path, default=_default_env_path())
    reconcile = sub.add_parser("reconcile")
    reconcile.add_argument("--env-file", type=Path, default=_default_env_path())
    runner = sub.add_parser("runner")
    runner.add_argument("--env-file", type=Path, default=_default_env_path())
    runner.add_argument("--turn-id", required=True)
    wrapper = sub.add_parser("install-wrapper")
    wrapper.add_argument("--target", type=Path, required=True)
    wrapper.add_argument("--launcher", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "doctor":
        passed, checks = run_doctor(env_path=args.env_file)
        for check in checks:
            print(f"[{ 'ok' if check.passed else 'fail' }] {check.name}: {check.detail}")
        return 0 if passed else 1
    if args.command == "install-wrapper":
        install_codex_wrapper(target=args.target, launcher=args.launcher)
        print("Codex wrapper installed")
        return 0

    values = load_env_file(args.env_file)
    config = Config.from_env(values)
    from .filesystem import StateLayout
    from .scheduler import Coordinator
    from .state import StateStore

    if args.command == "runner":
        from .runner_cli import run_recorded_turn

        run_recorded_turn(turn_id=args.turn_id, env_path=args.env_file)
        return 0
    with StateStore(StateLayout.from_state_dir(config.state_dir).db_path) as state:
        coordinator = Coordinator(
            state=state,
            layout=StateLayout.from_state_dir(config.state_dir),
            runner_env_path=args.env_file,
        )
        if args.command == "reconcile":
            coordinator.reconcile()
            return 0
        if args.command == "bot":
            from .discord_bot import DiscordHarnessBot, DiscordHarnessService

            layout = StateLayout.from_state_dir(config.state_dir)
            service = DiscordHarnessService(
                config=config,
                state=state,
                layout=layout,
                coordinator=coordinator,
            )
            bot = DiscordHarnessBot(service=service)
            if not config.discord_token:
                raise RuntimeError("DISCORD_TOKEN is required")
            bot.run(config.discord_token)
            return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
