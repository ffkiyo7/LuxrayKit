from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from dev_pipeline_harness.commands import CommandParseError, parse_control
from dev_pipeline_harness.config import Config
from dev_pipeline_harness.discord_bot import bot as discord_bot
from dev_pipeline_harness.discord_bot.bot import DiscordHarnessService
from dev_pipeline_harness.filesystem import StateLayout
from dev_pipeline_harness.models import Provider, TurnState
from dev_pipeline_harness.scheduler import Coordinator
from dev_pipeline_harness.state import StateError, StateStore
from dev_pipeline_harness.systemd import FakeSystemdUserClient
from dev_pipeline_harness.worktrees import WorktreeInfo


class FakeWorktrees:
    def __init__(self, root: Path):
        self.root = root
        self.created: list[str] = []

    def create(self, session_id: str, *, branch: str | None = None):
        path = self.root / session_id
        path.mkdir(parents=True, exist_ok=False)
        self.created.append(session_id)
        return WorktreeInfo(
            session_id=session_id,
            path=path,
            branch=branch or f"pipeline/{session_id}",
            base_sha="0" * 40,
        )


class CommandTests(unittest.TestCase):
    def test_control_parser_is_strict_and_never_shells(self):
        self.assertEqual(parse_control("!status").name, "status")
        self.assertEqual(parse_control("!provider claude").args, ("claude",))
        self.assertEqual(parse_control("!effort xhigh").args, ("xhigh",))
        self.assertEqual(parse_control("!reject please review this").args, ("please", "review", "this"))
        self.assertEqual(parse_control("normal owner text"), None)
        with self.assertRaises(CommandParseError):
            parse_control("!unknown $(touch /tmp/nope)")
        with self.assertRaises(CommandParseError):
            parse_control("!accept 12 deadbeef")

    @unittest.skipIf(discord_bot.commands is None, "discord.py is not installed")
    def test_slash_handler_does_not_override_discord_gateway_dispatch(self):
        self.assertIsNot(
            discord_bot.DiscordHarnessBot.dispatch,
            discord_bot.DiscordHarnessBot.dispatch_command,
        )


class DiscordServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        root = Path(self.temp.name)
        self.root = root
        env = {
            "DISCORD_TOKEN": "discord-secret",
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
        self.config = Config.from_env(env)
        self.layout = StateLayout.from_state_dir(self.config.state_dir).ensure()
        self.state = StateStore(self.layout.db_path)
        self.coordinator = Coordinator(
            state=self.state,
            layout=self.layout,
            systemd=FakeSystemdUserClient(),
            command_builder=lambda turn: ["fake", turn.id],
        )
        self.worktrees = FakeWorktrees(self.config.worktree_root)
        self.service = DiscordHarnessService(
            config=self.config,
            state=self.state,
            layout=self.layout,
            coordinator=self.coordinator,
            worktrees=self.worktrees,
        )

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def test_source_message_creates_thread_ready_session_and_deduplicates(self):
        first = self.service.start_from_source(
            source_message_id="source-1",
            source_content="Please inspect the docs.",
            provider_name="codex",
        )
        self.assertTrue(first.created)
        self.assertEqual(self.worktrees.created, [first.session_id])
        second = self.service.start_from_source(
            source_message_id="source-1",
            source_content="same source",
            provider_name="claude",
        )
        self.assertFalse(second.created)
        self.assertEqual(second.session_id, first.session_id)
        self.assertEqual(len(self.state.list_turns(first.session_id)), 1)
        card = self.service.status_card(first.session_id)
        text = "\n".join([card.title, card.description, *[f"{k}:{v}" for k, v in card.fields]])
        self.assertIn("requested model", text)
        self.assertNotIn("discord-secret", text)
        pipeline = self.state.get_pipeline_run(first.session_id)
        self.assertEqual(pipeline.base_sha, "0" * 40)

    def test_dispatch_waits_for_provider_choice_and_is_idempotent(self):
        dispatch = self.service.create_dispatch(
            owner_user_id=self.config.owner_user_id or "",
            guild_id=self.config.allowed_guild_id or "",
            channel_id=self.config.parent_channel_id or "",
            task="Draft the release notes.",
        )
        self.assertEqual(dispatch.status.value, "pending")
        self.assertEqual(self.worktrees.created, [])
        self.assertEqual(self.state.list_sessions(), [])

        edited = self.state.update_dispatch_task(dispatch.id, "Draft the corrected release notes.")
        self.assertEqual(edited.task, "Draft the corrected release notes.")

        started = self.service.start_from_dispatch(dispatch_id=dispatch.id, provider_name="codex")
        self.assertTrue(started.created)
        self.assertEqual(self.worktrees.created, [started.session_id])
        completed = self.state.get_dispatch(dispatch.id)
        self.assertEqual(completed.status.value, "started")
        self.assertEqual(completed.provider.value if completed.provider else None, "codex")
        self.assertEqual(completed.harness_session_id, started.session_id)

        duplicate = self.service.start_from_dispatch(dispatch_id=dispatch.id, provider_name="claude")
        self.assertFalse(duplicate.created)
        self.assertEqual(duplicate.session_id, started.session_id)
        self.assertEqual(len(self.state.list_provider_sessions(started.session_id)), 1)
        with self.assertRaises(StateError):
            self.state.update_dispatch_task(dispatch.id, "Too late to edit.")

    def test_owner_can_register_and_approve_a_plan_from_the_thread(self):
        start = self.service.start_from_source(
            source_message_id="source-1",
            source_content="Start",
            provider_name="codex",
        )
        plan = self.worktrees.root / start.session_id / "docs" / "plans" / "PLAN-docs.md"
        plan.parent.mkdir(parents=True)
        plan.write_text("# PLAN\n\nSafe docs-only change.\n", encoding="utf-8")
        turn = self.state.list_turns(start.session_id)[0]
        self.state.claim_next()
        self.state.finalize_turn(turn.id, state=TurnState.SUCCEEDED, exit_code=0)
        response = self.service.handle_control(
            session_id=start.session_id,
            command=parse_control("!approve PLAN-docs"),
        )
        self.assertIn("已批准", response)
        self.assertEqual(self.state.get_session(start.session_id).status.value, "plan_approved")

    def test_owner_message_enqueues_one_turn_and_provider_switch_is_explicit(self):
        start = self.service.start_from_source(
            source_message_id="source-1",
            source_content="Start",
            provider_name="codex",
        )
        turn = self.service.enqueue_owner_message(
            session_id=start.session_id,
            owner_message_id="owner-2",
            content="Follow up",
        )
        self.assertEqual(self.state.queue_position(turn.id), 2)
        response = self.service.handle_control(
            session_id=start.session_id,
            command=parse_control("!provider claude"),
        )
        self.assertIn("新的 claude provider session", response)
        self.assertEqual(len(self.state.list_provider_sessions(start.session_id)), 2)

    def test_effort_switch_is_allowlisted_and_snapshotted(self):
        start = self.service.start_from_source(
            source_message_id="source-1",
            source_content="Start",
            provider_name="codex",
        )
        response = self.service.handle_control(
            session_id=start.session_id,
            command=parse_control("!effort xhigh"),
        )
        self.assertIn("xhigh", response)
        turn = self.service.enqueue_owner_message(
            session_id=start.session_id,
            owner_message_id="owner-effort",
            content="Follow up",
        )
        self.assertEqual(turn.requested_effort, "xhigh")
        self.assertEqual(turn.configured_effort, "xhigh")

    def test_stop_cancels_a_queued_turn_without_starting_a_process(self):
        start = self.service.start_from_source(
            source_message_id="source-1",
            source_content="Start",
            provider_name="codex",
        )
        response = self.service.handle_control(
            session_id=start.session_id,
            command=parse_control("!stop"),
        )
        self.assertIn("已取消", response)
        self.assertEqual(self.state.list_turns(start.session_id)[0].state.value, "cancelled")


if __name__ == "__main__":
    unittest.main()
