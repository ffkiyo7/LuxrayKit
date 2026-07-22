from __future__ import annotations

import os
import stat
import tempfile
import threading
import unittest
from pathlib import Path

from dev_pipeline_harness.config import Config, ConfigError
from dev_pipeline_harness.filesystem import StateLayout
from dev_pipeline_harness.models import Provider, SessionStatus, TurnState
from dev_pipeline_harness.state import (
    DuplicateSessionError,
    InvalidTransition,
    QueueError,
    StateStore,
)


class StateStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.layout = StateLayout.from_state_dir(self.root / "state").ensure()
        self.store = StateStore(self.layout.db_path)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def _session(self, source="100"):
        return self.store.create_session(
            source_message_id=source,
            repo=self.repo,
            worktree=self.root / f"worktree-{source}",
            branch=f"pipeline/S-{int(source):04d}",
        )

    def _provider(self, source="100", provider=Provider.CODEX):
        session = self._session(source)
        return self.store.create_provider_session(
            harness_session_id=session.id,
            provider=provider,
            default_model="model-a",
        )

    def test_migration_is_idempotent_and_private(self):
        self.store.close()
        StateStore(self.layout.db_path).close()
        StateStore(self.layout.db_path).close()
        self.assertEqual(self.layout.db_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.layout.state_dir.stat().st_mode & 0o777, 0o700)
        with StateStore(self.layout.db_path) as store:
            tables = {
                row[0]
                for row in store._connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
        self.assertTrue(
            {
                "harness_sessions",
                "provider_sessions",
                "turns",
                "queue",
                "event_cursors",
                "pipeline_runs",
            }.issubset(tables)
        )

    def test_source_message_deduplication_is_atomic(self):
        self.store.close()
        results = []
        errors = []

        def create():
            try:
                with StateStore(self.layout.db_path) as store:
                    results.append(
                        store.get_or_create_session(
                            source_message_id="same-source",
                            repo=self.repo,
                            worktree=self.root / "one",
                            branch="pipeline/S-0001",
                        )
                    )
            except Exception as exc:  # pragma: no cover - assertion below reports it
                errors.append(exc)

        threads = [threading.Thread(target=create) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertFalse(errors)
        self.assertEqual(len(results), 2)
        self.assertEqual(sum(created for _, created in results), 1)
        self.assertEqual(results[0][0].id, results[1][0].id)

    def test_session_and_turn_state_transitions_are_conditional(self):
        session = self._session()
        with self.assertRaises(InvalidTransition):
            self.store.transition_session(session.id, SessionStatus.MERGED)
        self.store.transition_session(session.id, SessionStatus.QUEUED)
        provider = self.store.create_provider_session(
            harness_session_id=session.id,
            provider=Provider.CODEX,
            default_model="model-a",
        )
        turn = self.store.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="model-a",
            configured_model="model-a",
        )
        self.store.enqueue_turn(turn.id)
        claimed = self.store.claim_next()
        self.assertEqual(claimed.id, turn.id)
        self.store.mark_turn_running(turn.id)
        final = self.store.finalize_turn(turn.id, state=TurnState.SUCCEEDED, exit_code=0)
        self.assertTrue(final.state.terminal)
        with self.assertRaises(InvalidTransition):
            self.store.mark_turn_running(turn.id)

    def test_queue_is_fifo_and_only_one_turn_can_be_claimed(self):
        provider = self._provider()
        first = self.store.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="model-a",
            configured_model="model-a",
        )
        second = self.store.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-2",
            requested_model="model-b",
            configured_model="model-b",
        )
        self.assertEqual(self.store.enqueue_turn(first.id), 1)
        self.assertEqual(self.store.enqueue_turn(second.id), 2)
        self.assertEqual(self.store.queue_position(first.id), 1)
        self.assertEqual(self.store.queue_position(second.id), 2)
        self.assertEqual(self.store.claim_next().id, first.id)
        self.assertIsNone(self.store.claim_next())
        self.store.finalize_turn(first.id, state=TurnState.SUCCEEDED, exit_code=0)
        self.assertEqual(self.store.claim_next().id, second.id)

    def test_duplicate_turn_and_terminal_turn_are_rejected(self):
        provider = self._provider()
        turn = self.store.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="model-a",
            configured_model="model-a",
        )
        with self.assertRaises(QueueError):
            self.store.create_turn(
                provider_session_id=provider.id,
                owner_message_id="owner-1",
                requested_model="model-a",
                configured_model="model-a",
            )
        self.store.enqueue_turn(turn.id)
        self.store.claim_next()
        self.store.finalize_turn(turn.id, state=TurnState.FAILED, exit_code=1, error_summary="safe")
        with self.assertRaises(QueueError):
            self.store.enqueue_turn(turn.id)

    def test_model_audit_fields_are_distinct(self):
        provider = self._provider()
        turn = self.store.create_turn(
            provider_session_id=provider.id,
            owner_message_id="owner-1",
            requested_model="requested-a",
            configured_model="configured-a",
        )
        self.assertEqual(turn.requested_model, "requested-a")
        self.assertEqual(turn.configured_model, "configured-a")
        self.assertIsNone(turn.reported_model)
        self.assertEqual(turn.requested_effort, "medium")
        self.assertEqual(turn.configured_effort, "medium")
        self.store.set_turn_reported_model(turn.id, "reported-b")
        self.assertEqual(self.store.get_turn(turn.id).reported_model, "reported-b")
        self.store.set_default_model(provider.id, "next-model")
        self.assertEqual(self.store.get_provider_session(provider.id).default_model, "next-model")
        self.store.set_default_effort(provider.id, "high")
        self.assertEqual(self.store.get_provider_session(provider.id).default_effort, "high")


class ConfigTests(unittest.TestCase):
    def _env(self, root: Path):
        return {
            "DISCORD_TOKEN": "not-a-real-token",
            "DISCORD_ALLOWED_GUILD_ID": "123456789012345678",
            "DISCORD_PARENT_CHANNEL_ID": "1529159963526693025",
            "DISCORD_OWNER_USER_ID": "987654321098765432",
            "HARNESS_REPO": str(root / "repo"),
            "WORKTREE_ROOT": str(root / "worktrees"),
            "HARNESS_STATE_DIR": str(root / "state"),
            "MAX_CONCURRENT_RUNS": "1",
            "CODEX_DEFAULT_MODEL": "codex-a",
            "CODEX_ALLOWED_MODELS": "codex-a,codex-b",
            "CLAUDE_DEFAULT_MODEL": "claude-a",
            "CLAUDE_ALLOWED_MODELS": "claude-a,claude-b",
        }

    def test_secret_is_not_in_repr_or_validation_error(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            root = Path(directory)
            config = Config.from_env(self._env(root))
            self.assertNotIn("not-a-real-token", repr(config))
            bad = self._env(root)
            bad["HARNESS_REPO"] = "relative/repo"
            with self.assertRaises(ConfigError) as caught:
                Config.from_env(bad)
            self.assertNotIn("not-a-real-token", str(caught.exception))

    def test_optional_discord_mode_does_not_read_a_secret(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            root = Path(directory)
            env = {
                "HARNESS_REPO": str(root / "repo"),
                "WORKTREE_ROOT": str(root / "worktrees"),
                "HARNESS_STATE_DIR": str(root / "state"),
            }
            config = Config.from_env(env, require_discord=False)
            self.assertIsNone(config.discord_token)
            self.assertIsNone(config.allowed_guild_id)

    def test_empty_or_invalid_allowlist_is_rejected_when_default_is_present(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            root = Path(directory)
            env = self._env(root)
            env["CODEX_ALLOWED_MODELS"] = ""
            env["CODEX_DEFAULT_MODEL"] = "codex-a"
            with self.assertRaises(ConfigError):
                Config.from_env(env)

    def test_reasoning_effort_allowlists_are_provider_specific(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            root = Path(directory)
            env = self._env(root)
            env["CODEX_ALLOWED_REASONING_EFFORTS"] = "none,minimal,low,medium,high,xhigh"
            env["CLAUDE_ALLOWED_REASONING_EFFORTS"] = "low,medium,high,xhigh,max"
            config = Config.from_env(env)
            self.assertEqual(config.default_effort("codex"), "medium")
            self.assertEqual(config.allowed_efforts("claude")[-1], "max")
            env["CODEX_ALLOWED_REASONING_EFFORTS"] = "medium,unknown"
            with self.assertRaises(ConfigError):
                Config.from_env(env)


if __name__ == "__main__":
    unittest.main()
