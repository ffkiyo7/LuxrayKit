from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from dev_pipeline_harness.filesystem import StateLayout
from dev_pipeline_harness.models import Provider, TurnState
from dev_pipeline_harness.redaction import Redactor
from dev_pipeline_harness.runner import RunnerError, TurnRunner, build_child_environment
from dev_pipeline_harness.scheduler import Coordinator
from dev_pipeline_harness.state import StateStore
from dev_pipeline_harness.systemd import FakeSystemdUserClient
from dev_pipeline_harness.transcript import read_delta


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        root = Path(self.temp.name)
        self.root = root
        self.worktree = root / "worktree"
        self.worktree.mkdir()
        self.layout = StateLayout.from_state_dir(root / "state").ensure()
        self.state = StateStore(self.layout.db_path)
        session = self.state.create_session(
            source_message_id="source-1",
            repo=root / "repo",
            worktree=self.worktree,
            branch="pipeline/S-0001",
        )
        provider = self.state.create_provider_session(
            harness_session_id=session.id,
            provider=Provider.CODEX,
            default_model="model-a",
        )
        turn = self.state.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="model-a",
            configured_model="model-a",
        )
        self.state.enqueue_turn(turn.id)
        self.turn = self.state.claim_next()

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def test_runner_uses_recorded_cwd_and_redacts_discord_copy(self):
        secret = "super-secret-token"
        # The runner must not inherit this secret even when its parent process
        # has one in its environment.
        import os

        old = os.environ.get("DISCORD_TOKEN")
        os.environ["DISCORD_TOKEN"] = secret
        try:
            runner = TurnRunner(
                state=self.state,
                layout=self.layout,
                redactor=Redactor({secret}),
            )
            command = [
                sys.executable,
                "-c",
                "import json, os, sys; print(json.dumps({'type':'assistant_message','text':'%s'})); print(os.getenv('DISCORD_TOKEN','missing'), file=sys.stderr)"
                % secret,
            ]
            result = runner.run(self.turn.id, command, cwd=self.worktree)
            self.assertEqual(result["state"], TurnState.SUCCEEDED.value)
            turn = self.state.get_turn(self.turn.id)
            self.assertEqual(turn.state, TurnState.SUCCEEDED)
            self.assertEqual(turn.raw_path.stat().st_mode & 0o777, 0o600)
            safe = turn.sanitized_path.read_text(encoding="utf-8")
            raw = turn.raw_path.read_text(encoding="utf-8")
            self.assertNotIn(secret, safe)
            self.assertIn(secret, raw)
            lines, offset = read_delta(turn.sanitized_path)
            self.assertGreater(offset, 0)
            self.assertEqual(len(lines), 2)
        finally:
            if old is None:
                os.environ.pop("DISCORD_TOKEN", None)
            else:
                os.environ["DISCORD_TOKEN"] = old

    def test_child_environment_rejects_secret_like_keys(self):
        with self.assertRaises(RunnerError):
            build_child_environment({"DISCORD_TOKEN": "secret"})
        with self.assertRaises(RunnerError):
            build_child_environment({"arbitrary": "value"})


class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        root = Path(self.temp.name)
        self.root = root
        self.layout = StateLayout.from_state_dir(root / "state").ensure()
        self.state = StateStore(self.layout.db_path)
        self.worktree = root / "worktree"
        self.worktree.mkdir()
        session = self.state.create_session(
            source_message_id="source-1",
            repo=root / "repo",
            worktree=self.worktree,
            branch="pipeline/S-0001",
        )
        provider = self.state.create_provider_session(
            harness_session_id=session.id,
            provider=Provider.CODEX,
            default_model="model-a",
        )
        first = self.state.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="model-a",
            configured_model="model-a",
        )
        second = self.state.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-2",
            requested_model="model-a",
            configured_model="model-a",
        )
        self.state.enqueue_turn(first.id)
        self.state.enqueue_turn(second.id)
        self.systemd = FakeSystemdUserClient()

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def test_only_one_transient_unit_is_started(self):
        coordinator = Coordinator(
            state=self.state,
            layout=self.layout,
            systemd=self.systemd,
            command_builder=lambda turn: ["fake-provider", turn.id],
        )
        first = coordinator.start_next()
        self.assertIsNotNone(first)
        self.assertIsNone(coordinator.start_next())
        self.assertEqual(len(self.systemd.started), 1)
        self.assertTrue(self.systemd.started[0].unit_name.startswith("dev-pipeline-turn-S-0001-T-"))
        coordinator.stop(first.id)
        self.assertEqual(self.systemd.stopped, [first.unit_name])

    def test_default_transient_command_carries_private_env_path(self):
        env_path = self.root / "private" / "env"
        coordinator = Coordinator(
            state=self.state,
            layout=self.layout,
            systemd=self.systemd,
            runner_env_path=env_path,
        )
        first = coordinator.start_next()
        self.assertIsNotNone(first)
        command = self.systemd.started[0].command
        self.assertIn("--env-file", command)
        self.assertEqual(command[command.index("--env-file") + 1], str(env_path.resolve()))

    def test_reconcile_imports_result_once_and_does_not_rerun(self):
        coordinator = Coordinator(
            state=self.state,
            layout=self.layout,
            systemd=self.systemd,
            command_builder=lambda turn: ["fake-provider", turn.id],
        )
        first = coordinator.start_next()
        session_dir = self.layout.session_dir("S-0001")
        result_path = session_dir / "turn-0001.result.json"
        result_path.write_text(
            json.dumps(
                {
                    "turn_id": first.id,
                    "state": "succeeded",
                    "exit_code": 0,
                    "result_path": str(result_path),
                }
            ),
            encoding="utf-8",
        )
        result_path.chmod(0o600)
        self.state.update_turn_paths(first.id, result_path=result_path)
        self.systemd.active.clear()
        reconciled = coordinator.reconcile()
        self.assertEqual(reconciled[0].state, TurnState.SUCCEEDED)
        self.assertEqual(coordinator.reconcile(), [])
        self.assertIsNotNone(coordinator.start_next())


if __name__ == "__main__":
    unittest.main()
