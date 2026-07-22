"""Non-secret VPS readiness checks for the user service."""

from __future__ import annotations

import os
import shutil
import shlex
import stat
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from .config import Config, ConfigError
from .filesystem import StateLayout
from .state import StateStore


@dataclass(frozen=True)
class DoctorCheck:
    name: str
    passed: bool
    detail: str


def load_env_file(path: Path) -> dict[str, str]:
    """Parse the deliberately small dotenv contract without sourcing a shell."""

    path = Path(path)
    values: dict[str, str] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" not in stripped:
                raise ConfigError("private env contains a malformed line")
            key, value = stripped.split("=", 1)
            key = key.strip()
            if not key or any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_" for char in key):
                raise ConfigError("private env contains an invalid field name")
            values[key] = value.strip().strip('"').strip("'")
    return values


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def _run(args: list[str], *, cwd: Path | None = None) -> tuple[bool, str]:
    inherited = {
        key: os.environ[key]
        for key in ("XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XDG_CONFIG_HOME", "XDG_DATA_HOME")
        if os.environ.get(key)
    }
    try:
        result = subprocess.run(
            args,
            cwd=cwd,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={
                "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                "HOME": os.environ.get("HOME", str(Path.home())),
                "LANG": "C",
                **inherited,
            },
        )
    except OSError:
        return False, "executable unavailable"
    return result.returncode == 0, "ok" if result.returncode == 0 else "command failed"


def _check_executable(path: Path, *, label: str) -> DoctorCheck:
    if not path.is_absolute() or not path.is_file() or not os.access(path, os.X_OK):
        return DoctorCheck(label, False, "absolute executable is missing or not executable")
    ok, _detail = _run([str(path), "--version"])
    return DoctorCheck(label, ok, "version check passed" if ok else "version check failed")


def _check_login(path: Path, *, label: str) -> DoctorCheck:
    # These commands are read-only.  Their output is intentionally discarded;
    # auth details and account identifiers must never enter doctor logs.
    status_args = ("login", "status") if label == "Codex" else ("auth", "status")
    ok, _detail = _run([str(path), *status_args])
    return DoctorCheck(f"{label} auth", ok, "login check passed" if ok else "login status could not be verified")


def run_doctor(*, env_path: Path) -> tuple[bool, tuple[DoctorCheck, ...]]:
    checks: list[DoctorCheck] = []
    env_path = Path(env_path).expanduser()
    parent = env_path.parent
    if env_path.is_symlink() or not env_path.is_file():
        checks.append(DoctorCheck("private env", False, "env file is missing"))
        return False, tuple(checks)
    checks.append(DoctorCheck("private env", _mode(env_path) == 0o600, "owner-only permissions required"))
    checks.append(DoctorCheck("private env directory", parent.is_dir() and _mode(parent) == 0o700, "owner-only directory required"))
    try:
        values = load_env_file(env_path)
        config = Config.from_env(values)
        checks.append(DoctorCheck("configuration", True, "required fields and paths are valid"))
    except (OSError, ConfigError) as exc:
        checks.append(DoctorCheck("configuration", False, str(exc)))
        return False, tuple(checks)

    checks.append(
        DoctorCheck(
            "model allowlists",
            bool(config.codex_allowed_models and config.claude_allowed_models),
            "both provider allowlists are non-empty" if config.codex_allowed_models and config.claude_allowed_models else "both provider allowlists are required",
        )
    )
    for path, label in ((config.codex_bin, "Codex executable"), (config.claude_bin, "Claude executable")):
        checks.append(_check_executable(path, label=label) if path else DoctorCheck(label, False, "absolute path is required"))
    if config.codex_bin:
        checks.append(_check_login(config.codex_bin, label="Codex"))
    if config.claude_bin:
        checks.append(_check_login(config.claude_bin, label="Claude"))

    repo = config.harness_repo.resolve()
    maintenance = (repo.parent / "LuxrayKit-maintenance").resolve()
    root = config.worktree_root.resolve()
    inside_forbidden = False
    for forbidden in (repo, maintenance):
        try:
            root.relative_to(forbidden)
            inside_forbidden = True
        except ValueError:
            pass
    checks.append(DoctorCheck("worktree isolation", not inside_forbidden and root != repo, "worktree root is isolated" if not inside_forbidden and root != repo else "worktree root overlaps a protected checkout"))
    checks.append(DoctorCheck("harness repo", repo.is_dir(), "repository exists" if repo.is_dir() else "repository is missing"))
    root.mkdir(parents=True, exist_ok=True)
    checks.append(DoctorCheck("worktree root", os.access(root, os.W_OK), "worktree root is writable" if os.access(root, os.W_OK) else "worktree root is not writable"))

    active_db_turns = 0
    try:
        with StateStore(StateLayout.from_state_dir(config.state_dir).db_path) as state:
            active_db_turns = len(state.list_active_turns())
            pass
        checks.append(DoctorCheck("SQLite", True, "migration and private state open passed"))
    except Exception:
        checks.append(DoctorCheck("SQLite", False, "state database could not be opened"))

    git_ok, _ = _run(["git", "-C", str(repo), "rev-parse", "--is-inside-work-tree"])
    checks.append(DoctorCheck("Git", git_ok, "repository identity is usable" if git_ok else "Git repository check failed"))
    try:
        clean_result = subprocess.run(
            ["git", "-C", str(repo), "status", "--porcelain"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        clean = clean_result.returncode == 0 and not clean_result.stdout.strip()
    except OSError:
        clean = False
    checks.append(DoctorCheck("service checkout", clean, "checkout is clean" if clean else "service checkout must be clean"))
    gh_ok, _ = _run(["gh", "auth", "status"])
    checks.append(DoctorCheck("GitHub", gh_ok, "gh auth check passed" if gh_ok else "gh auth status could not be verified"))
    systemd_ok, _ = _run(["systemd-run", "--user", "--wait", "--collect", "/usr/bin/true"])
    checks.append(DoctorCheck("systemd user", systemd_ok, "systemd --user transient check passed" if systemd_ok else "systemd --user is unavailable"))
    runner_ok, _ = _run(["systemctl", "--user", "is-active", "--quiet", "dev-pipeline-harness"])
    # An inactive bot service is valid before installation; this check only
    # detects a second active turn unit in the user manager.
    try:
        active_units = subprocess.run(
            ["systemctl", "--user", "list-units", "--type=service", "--state=active", "--no-legend", "--plain"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env={
                "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                "HOME": os.environ.get("HOME", str(Path.home())),
                "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", ""),
                "DBUS_SESSION_BUS_ADDRESS": os.environ.get("DBUS_SESSION_BUS_ADDRESS", ""),
            },
        )
        turn_units = [line.split()[0] for line in active_units.stdout.splitlines() if line.startswith("dev-pipeline-turn-")]
        inspectable = active_units.returncode == 0
        one_runner = inspectable and len(turn_units) <= 1 and active_db_turns <= 1
        detail = "at most one active runner" if one_runner else "more than one active runner is present"
    except OSError:
        inspectable = False
        one_runner = False
        detail = "could not inspect active runner units"
    checks.append(DoctorCheck("single runner", one_runner, detail))
    checks.append(DoctorCheck("service state", True, "service may be inactive before install" if not runner_ok else "service is active"))

    return all(check.passed for check in checks), tuple(checks)


def install_codex_wrapper(*, target: Path, launcher: Path) -> Path:
    target = Path(target).expanduser()
    launcher = Path(launcher).expanduser()
    if not target.is_absolute() or not launcher.is_absolute():
        raise ConfigError("wrapper target and launcher must be absolute")
    if not launcher.is_file() or not os.access(launcher, os.X_OK):
        raise ConfigError("Codex launcher is missing or not executable")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    target.parent.chmod(0o700)
    temporary = target.with_suffix(target.suffix + ".tmp")
    content = "#!/bin/sh\nset -eu\nexec " + shlex.quote(str(launcher)) + ' "$@"\n'
    temporary.write_text(content, encoding="utf-8")
    temporary.chmod(0o700)
    os.replace(temporary, target)
    target.chmod(0o700)
    return target
