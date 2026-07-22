"""Private runtime directories and file permissions."""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path


class FilesystemError(ValueError):
    """Raised when a runtime path is unsafe or cannot be prepared."""


def _chmod(path: Path, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError as exc:  # pragma: no cover - platform-specific error text
        raise FilesystemError(f"cannot set permissions for {path}") from exc


def ensure_private_dir(path: Path) -> Path:
    """Create a directory and force owner-only permissions."""

    path = Path(path)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    _chmod(path, 0o700)
    if not path.is_dir():
        raise FilesystemError(f"not a directory: {path}")
    return path


def ensure_private_file(path: Path, *, mode: int = 0o600) -> Path:
    """Create an empty owner-only file without truncating an existing file."""

    path = Path(path)
    ensure_private_dir(path.parent)
    flags = os.O_WRONLY | os.O_CREAT
    fd = os.open(path, flags, mode)
    os.close(fd)
    _chmod(path, mode)
    return path


@dataclass(frozen=True)
class StateLayout:
    state_dir: Path
    db_path: Path
    locks_dir: Path
    sessions_dir: Path

    @classmethod
    def from_state_dir(cls, state_dir: Path) -> "StateLayout":
        state_dir = Path(state_dir).expanduser()
        return cls(
            state_dir=state_dir,
            db_path=state_dir / "harness.sqlite3",
            locks_dir=state_dir / "locks",
            sessions_dir=state_dir / "sessions",
        )

    def ensure(self) -> "StateLayout":
        ensure_private_dir(self.state_dir)
        ensure_private_dir(self.locks_dir)
        ensure_private_dir(self.sessions_dir)
        if self.db_path.exists():
            _chmod(self.db_path, 0o600)
        return self

    def session_dir(self, session_id: str) -> Path:
        if not re.fullmatch(r"S-[0-9]{4}", session_id):
            raise FilesystemError("invalid session id")
        path = self.sessions_dir / session_id
        ensure_private_dir(path)
        return path

    @property
    def global_runner_lock_path(self) -> Path:
        return self.locks_dir / "global-runner.lock"

    def worktree_lock_path(self, worktree: Path) -> Path:
        realpath = str(Path(worktree).resolve())
        digest = hashlib.sha256(realpath.encode("utf-8")).hexdigest()
        return self.locks_dir / f"worktree-{digest}.lock"
