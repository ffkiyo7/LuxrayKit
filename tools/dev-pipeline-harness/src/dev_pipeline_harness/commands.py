"""Strict, non-shell parsing for owner Thread controls."""

from __future__ import annotations

from dataclasses import dataclass


class CommandParseError(ValueError):
    pass


@dataclass(frozen=True)
class ControlCommand:
    name: str
    args: tuple[str, ...]


_COMMANDS = {
    "status",
    "model",
    "effort",
    "provider",
    "stop",
    "approve",
    "reject",
    "resume",
    "accept",
}


def parse_control(text: str) -> ControlCommand | None:
    text = text.strip()
    if not text.startswith("!"):
        return None
    parts = text.split()
    name = parts[0][1:].lower()
    args = tuple(parts[1:])
    if name not in _COMMANDS:
        raise CommandParseError("unknown control command; use !status, !model, !effort, !provider, !stop, !approve, !reject, !resume, or !accept")
    if name in {"status", "stop"} and args:
        raise CommandParseError(f"!{name} takes no arguments")
    if name in {"model", "effort", "provider", "approve", "resume"} and len(args) != 1:
        raise CommandParseError(f"!{name} requires exactly one argument")
    if name == "provider" and args[0].lower() not in {"codex", "claude"}:
        raise CommandParseError("!provider accepts codex or claude")
    if name == "resume" and (len(args[0]) != 6 or not args[0].startswith("S-") or not args[0][2:].isdigit()):
        raise CommandParseError("!resume requires an S-#### session id")
    if name == "accept":
        if len(args) != 2 or not args[0].isdigit() or len(args[1]) != 40 or any(char not in "0123456789abcdefABCDEF" for char in args[1]):
            raise CommandParseError("!accept requires a PR number and full 40-character head SHA")
    if name == "reject" and not args:
        raise CommandParseError("!reject requires feedback")
    return ControlCommand(name=name, args=args)


def command_help() -> str:
    return "可用命令：!status · !stop · !approve <PLAN-id> · !reject <反馈> · !resume <S-####> · !accept <PR#> <full-head-SHA>；模型和推理强度仅在新 Thread 的配置卡中一次性固定。"
