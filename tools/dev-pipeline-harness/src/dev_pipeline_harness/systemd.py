"""Small, injectable wrapper around systemd --user transient units."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


class SystemdError(RuntimeError):
    pass


_UNIT_RE = re.compile(r"^dev-pipeline-turn-S-[0-9]{4}-T-[0-9]{4}$")


def validate_unit_name(unit_name: str) -> str:
    if not _UNIT_RE.fullmatch(unit_name):
        raise SystemdError("invalid transient unit name")
    return unit_name


@dataclass(frozen=True)
class UnitSpec:
    unit_name: str
    working_directory: Path
    command: tuple[str, ...]


class SystemdUserClient:
    def __init__(self, *, runner=subprocess.run):
        self._runner = runner

    def start(self, spec: UnitSpec) -> None:
        validate_unit_name(spec.unit_name)
        if not spec.command or any(not isinstance(arg, str) or not arg for arg in spec.command):
            raise SystemdError("transient command is empty")
        if not spec.working_directory.is_absolute():
            raise SystemdError("transient working directory must be absolute")
        command = [
            "systemd-run",
            "--user",
            f"--unit={spec.unit_name}",
            "--collect",
            f"--property=WorkingDirectory={spec.working_directory}",
            "--property=KillMode=control-group",
            "--property=UMask=0077",
            "--property=TimeoutStopSec=30",
            "--no-block",
            *spec.command,
        ]
        try:
            result = self._runner(
                command,
                cwd=spec.working_directory,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            raise SystemdError("systemd could not start transient unit") from exc
        if getattr(result, "returncode", 0) != 0:
            raise SystemdError("systemd could not start transient unit")

    def is_active(self, unit_name: str) -> bool:
        validate_unit_name(unit_name)
        result = subprocess.run(
            ["systemctl", "--user", "is-active", "--quiet", unit_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return result.returncode == 0

    def unit_state(self, unit_name: str) -> str:
        validate_unit_name(unit_name)
        result = subprocess.run(
            ["systemctl", "--user", "show", unit_name, "--property=LoadState,ActiveState", "--no-pager"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            text=True,
        )
        if result.returncode != 0:
            return "missing"
        values = {}
        for line in result.stdout.splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                values[key] = value
        if values.get("LoadState") == "not-found":
            return "missing"
        return values.get("ActiveState", "unknown")

    def stop(self, unit_name: str) -> None:
        validate_unit_name(unit_name)
        result = subprocess.run(
            ["systemctl", "--user", "stop", unit_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode != 0 and self.is_active(unit_name):
            raise SystemdError("systemd could not stop transient unit")


class FakeSystemdUserClient:
    """Deterministic unit registry used by runner/coordinator tests."""

    def __init__(self):
        self.started: list[UnitSpec] = []
        self.stopped: list[str] = []
        self.active: set[str] = set()

    def start(self, spec: UnitSpec) -> None:
        validate_unit_name(spec.unit_name)
        self.started.append(spec)
        self.active.add(spec.unit_name)

    def is_active(self, unit_name: str) -> bool:
        validate_unit_name(unit_name)
        return unit_name in self.active

    def unit_state(self, unit_name: str) -> str:
        validate_unit_name(unit_name)
        return "active" if unit_name in self.active else "missing"

    def stop(self, unit_name: str) -> None:
        validate_unit_name(unit_name)
        self.stopped.append(unit_name)
        self.active.discard(unit_name)
