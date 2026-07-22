from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from dev_pipeline_harness.worktrees import WorktreeError, WorktreeManager


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return result.stdout.strip()


class WorktreeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        self.root = Path(self.temp.name)
        self.origin = self.root / "origin.git"
        self.repo = self.root / "repo"
        subprocess.run(["git", "init", "--bare", str(self.origin)], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["git", "init", "-b", "main", str(self.repo)], check=True, stdout=subprocess.DEVNULL)
        (self.repo / "README.md").write_text("clean\n", encoding="utf-8")
        git(self.repo, "add", "README.md")
        git(self.repo, "-c", "user.name=Harness Test", "-c", "user.email=harness@example.invalid", "commit", "-m", "initial")
        git(self.repo, "remote", "add", "origin", str(self.origin))
        git(self.repo, "push", "origin", "main")

    def tearDown(self):
        self.temp.cleanup()

    def test_creates_pipeline_worktree_from_origin_main(self):
        root = self.root / "worktrees"
        info = WorktreeManager(repo=self.repo, worktree_root=root).create("S-0001")
        self.assertEqual(info.branch, "pipeline/S-0001")
        self.assertEqual(git(info.path, "rev-parse", "HEAD"), info.base_sha)
        self.assertTrue(info.path.is_dir())
        self.assertIn("pipeline/S-0001", git(self.repo, "worktree", "list"))

    def test_rejects_dirty_service_checkout_and_forbidden_root(self):
        (self.repo / "dirty.txt").write_text("do not use\n", encoding="utf-8")
        with self.assertRaises(WorktreeError):
            WorktreeManager(repo=self.repo, worktree_root=self.root / "worktrees").create("S-0001")
        (self.repo / "dirty.txt").unlink()
        with self.assertRaises(WorktreeError):
            WorktreeManager(repo=self.repo, worktree_root=self.repo / "nested").create("S-0001")


if __name__ == "__main__":
    unittest.main()
