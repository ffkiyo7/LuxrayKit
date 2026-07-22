"""Process locks used by actual turn runners."""

from __future__ import annotations

import fcntl
import os
import time
from pathlib import Path
from types import TracebackType
from typing import IO

from .filesystem import ensure_private_file


class LockTimeout(TimeoutError):
    pass


class FileLock:
    def __init__(self, path: Path, *, timeout: float | None = None):
        self.path = Path(path)
        self.timeout = timeout
        self._handle: IO[str] | None = None

    def acquire(self) -> "FileLock":
        ensure_private_file(self.path)
        handle = self.path.open("r+")
        deadline = None if self.timeout is None else time.monotonic() + self.timeout
        while True:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._handle = handle
                return self
            except BlockingIOError:
                if deadline is not None and time.monotonic() >= deadline:
                    handle.close()
                    raise LockTimeout("lock acquisition timed out")
                time.sleep(0.05)

    def release(self) -> None:
        if self._handle is None:
            return
        try:
            fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
        finally:
            self._handle.close()
            self._handle = None

    def __enter__(self) -> "FileLock":
        return self.acquire()

    def __exit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc_value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        self.release()


class TurnLocks:
    """Acquire global and worktree locks in one fixed order."""

    def __init__(self, global_path: Path, worktree_path: Path, *, timeout: float | None = None):
        from .filesystem import StateLayout

        self.global_lock = FileLock(global_path, timeout=timeout)
        # The caller normally passes a StateLayout-derived path.  Keeping the
        # hash calculation here makes accidental raw worktree names impossible.
        self.worktree_lock = FileLock(worktree_path, timeout=timeout)

    def __enter__(self) -> "TurnLocks":
        self.global_lock.acquire()
        try:
            self.worktree_lock.acquire()
        except Exception:
            self.global_lock.release()
            raise
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.worktree_lock.release()
        self.global_lock.release()
