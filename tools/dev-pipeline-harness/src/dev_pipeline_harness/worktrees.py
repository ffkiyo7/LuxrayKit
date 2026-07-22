"""Safe Git worktree creation for pipeline sessions."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


class WorktreeError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorktreeInfo:
    session_id: str
    path: Path
    branch: str
    base_sha: str


class WorktreeManager:
    def __init__(
        self,
        *,
        repo: Path,
        worktree_root: Path,
        forbidden_roots: tuple[Path, ...] = (),
        git=subprocess,
    ):
        self.repo = Path(repo).resolve()
        self.worktree_root = Path(worktree_root).resolve()
        self.forbidden_roots = tuple(Path(root).resolve() for root in forbidden_roots) + (self.repo,)
        self._git_module = git

    def _run(self, args: list[str], *, check: bool = True) -> str:
        try:
            result = subprocess.run(
                args,
                cwd=self.repo,
                check=check,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            if isinstance(exc, subprocess.CalledProcessError):
                detail = "git command failed"
            else:
                detail = "git executable is unavailable"
            raise WorktreeError(detail) from exc
        return result.stdout.strip()

    def _validate_checkout(self) -> None:
        if not self.repo.is_dir():
            raise WorktreeError("harness repository does not exist")
        try:
            is_repo = self._run(["git", "-C", str(self.repo), "rev-parse", "--is-inside-work-tree"])
        except WorktreeError:
            raise
        if is_repo != "true":
            raise WorktreeError("harness repository is not a Git worktree")
        dirty = self._run(["git", "-C", str(self.repo), "status", "--porcelain"])
        if dirty:
            raise WorktreeError("harness service checkout must be clean")

    def _validate_target(self, target: Path) -> None:
        target = target.resolve()
        root = self.worktree_root
        if target.parent != root:
            raise WorktreeError("worktree target must be a direct child of WORKTREE_ROOT")
        for forbidden in self.forbidden_roots:
            try:
                target.relative_to(forbidden)
            except ValueError:
                continue
            raise WorktreeError("worktree target is inside a forbidden checkout")
        if target.exists() or target.is_symlink():
            raise WorktreeError("worktree target already exists")

    def create(self, session_id: str, *, branch: str | None = None) -> WorktreeInfo:
        if not re.fullmatch(r"S-[0-9]{4}", session_id):
            raise WorktreeError("invalid harness session id")
        self._validate_checkout()
        self.worktree_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.worktree_root.chmod(0o700)
        target = self.worktree_root / session_id
        self._validate_target(target)
        branch = branch or f"pipeline/{session_id}"
        if not branch.startswith("pipeline/"):
            raise WorktreeError("pipeline worktree branch must use pipeline/ prefix")
        try:
            self._run(["git", "-C", str(self.repo), "fetch", "origin", "main"])
            base_sha = self._run(["git", "-C", str(self.repo), "rev-parse", "origin/main^{commit}"])
            self._run(
                [
                    "git",
                    "-C",
                    str(self.repo),
                    "worktree",
                    "add",
                    "-b",
                    branch,
                    str(target),
                    "origin/main",
                ]
            )
        except WorktreeError:
            # The manager deliberately does not delete a possible partial
            # worktree.  An owner can inspect and recover it explicitly.
            raise
        return WorktreeInfo(session_id=session_id, path=target, branch=branch, base_sha=base_sha)
