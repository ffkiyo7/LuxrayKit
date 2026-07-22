"""Parse and enforce the Markdown TASK contract."""

from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


class InvalidTask(ValueError):
    pass


@dataclass(frozen=True)
class TaskSpec:
    path: Path
    objective: str
    allowed_files: tuple[str, ...]
    forbidden_zones: str
    interfaces: str
    definition_of_done: str
    verification_commands: tuple[str, ...]

    def allows_path(self, path: str) -> bool:
        normalized = path.replace("\\", "/")
        if normalized.startswith("/") or ".." in PurePosixPath(normalized).parts:
            return False
        while normalized.startswith("./"):
            normalized = normalized[2:]
        return any(fnmatch.fnmatchcase(normalized, pattern) for pattern in self.allowed_files)

    def validate_changed_paths(self, paths: list[str] | tuple[str, ...]) -> None:
        invalid = [path for path in paths if not self.allows_path(path)]
        if invalid:
            raise InvalidTask("changed files fall outside the TASK allowlist")

    def prompt_constraints(self, *, worktree: Path, branch: str) -> str:
        files = "\n".join(f"- `{path}`" for path in self.allowed_files)
        commands = "\n".join(f"- `{command}`" for command in self.verification_commands)
        return (
            f"Worktree: `{worktree}`\n"
            f"Branch: `{branch}`\n\n"
            f"Objective:\n{self.objective}\n\n"
            f"Allowed files only:\n{files}\n\n"
            f"Forbidden zones:\n{self.forbidden_zones}\n\n"
            f"Interfaces/constraints:\n{self.interfaces}\n\n"
            f"Definition of done:\n{self.definition_of_done}\n\n"
            f"Verification commands:\n{commands}\n\n"
            "Do not edit, reset, clean, push main, expose secrets, or expand this scope."
        )


_ALIASES = {
    "objective": {"目标", "objective", "goal"},
    "allowed": {"允许改动", "允许修改文件", "allowed files", "allowed changes"},
    "forbidden": {"禁区", "禁止事项", "forbidden", "forbidden zones", "不可做"},
    "interfaces": {"接口", "实施要求", "interfaces", "constraints", "implementation requirements"},
    "dod": {"dod", "definition of done", "完成定义", "完成条件"},
    "verification": {"验证命令", "验收命令", "verification commands", "verification"},
}


def _heading_key(text: str) -> str:
    text = re.sub(r"^\s*#+\s*", "", text).strip().rstrip(":")
    return text.casefold()


def _sections(text: str) -> dict[str, str]:
    lines = text.splitlines()
    found: dict[str, list[str]] = {}
    current: str | None = None
    for line in lines:
        if re.match(r"^\s*#{1,6}\s+", line):
            key = _heading_key(line)
            current = next((name for name, aliases in _ALIASES.items() if key in {a.casefold() for a in aliases}), None)
            if current:
                found.setdefault(current, [])
            continue
        if current:
            found[current].append(line)
    return {key: "\n".join(value).strip() for key, value in found.items()}


def _parse_allowed(body: str) -> tuple[str, ...]:
    values: list[str] = []
    in_fence = False
    for line in body.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        item = line.strip().lstrip("-* ").strip().strip("`")
        if not item or item.startswith("#"):
            continue
        if item.startswith("|"):
            continue
        # Avoid interpreting prose as a filename.  TASKs may use a table, a
        # fenced block, or one path per bullet.
        if "/" not in item and "\\" not in item and not in_fence:
            continue
        item = item.split("  #", 1)[0].strip().strip("`")
        if item:
            values.append(item)
    if not values:
        raise InvalidTask("TASK is missing an allowed-files list")
    normalized: list[str] = []
    for value in values:
        value = value.replace("\\", "/")
        if value.startswith("/") or ".." in PurePosixPath(value).parts:
            raise InvalidTask("TASK allowlist contains an unsafe path")
        normalized.append(value)
    return tuple(dict.fromkeys(normalized))


def _verification_commands(body: str) -> tuple[str, ...]:
    commands: list[str] = []
    in_fence = False
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if not stripped or stripped.startswith("#"):
            continue
        if in_fence:
            commands.append(stripped)
        elif stripped.startswith(("- ", "* ")):
            value = stripped[2:].strip().strip("`")
            if value:
                commands.append(value)
    if not commands:
        raise InvalidTask("TASK is missing verification commands")
    return tuple(commands)


def parse_task(path: Path) -> TaskSpec:
    path = Path(path)
    if not path.is_absolute():
        raise InvalidTask("TASK path must be absolute")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise InvalidTask("TASK file cannot be read") from exc
    sections = _sections(text)
    required = ("objective", "allowed", "forbidden", "interfaces", "dod", "verification")
    missing = [name for name in required if not sections.get(name)]
    if missing:
        raise InvalidTask("TASK is missing required sections")
    return TaskSpec(
        path=path,
        objective=sections["objective"],
        allowed_files=_parse_allowed(sections["allowed"]),
        forbidden_zones=sections["forbidden"],
        interfaces=sections["interfaces"],
        definition_of_done=sections["dod"],
        verification_commands=_verification_commands(sections["verification"]),
    )
