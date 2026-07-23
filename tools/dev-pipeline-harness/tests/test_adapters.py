from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from dev_pipeline_harness.adapters import ClaudeAdapter, CodexAdapter
from dev_pipeline_harness.adapters.base import AdapterError
from dev_pipeline_harness.adapters.sessions import ModelSwitchError, ProviderSessionController
from dev_pipeline_harness.filesystem import StateLayout
from dev_pipeline_harness.models import Provider, ProviderSessionStatus, TurnState
from dev_pipeline_harness.state import StateStore


class AdapterCommandTests(unittest.TestCase):
    def test_codex_commands_are_exec_argv_without_ephemeral(self):
        adapter = CodexAdapter(Path("/home/ubuntu/.local/bin/codex"), allowed_models=("a", "b"))
        self.assertEqual(
            adapter.new_command(model="a", prompt="hello"),
            [
                "/home/ubuntu/.local/bin/codex",
                "exec",
                "--json",
                "--sandbox",
                "workspace-write",
                "-c",
                'model_reasoning_effort="medium"',
                "-m",
                "a",
                "hello",
            ],
        )
        resumed = adapter.resume_command(model="b", provider_session_id="thread-1", prompt="next")
        self.assertEqual(
            resumed[:9],
            [
                "/home/ubuntu/.local/bin/codex",
                "exec",
                "resume",
                "--json",
                "-c",
                'model_reasoning_effort="medium"',
                "-m",
                "b",
                "thread-1",
            ],
        )
        self.assertNotIn("--ephemeral", resumed)
        self.assertIn('model_reasoning_effort="medium"', resumed)
        with self.assertRaises(AdapterError):
            adapter.new_command(model="not-allowed", prompt="hello")
        with self.assertRaises(AdapterError):
            adapter.new_command(model="a", prompt="hello", effort="max")

    def test_claude_commands_use_dont_ask_and_explicit_tools(self):
        adapter = ClaudeAdapter(
            Path("/usr/bin/claude"),
            allowed_models=("a",),
            allowed_tools=("Read", "Bash(git diff *)"),
        )
        command = adapter.new_command(model="a", prompt="hello")
        self.assertIn("--permission-mode", command)
        self.assertEqual(command[command.index("--permission-mode") + 1], "dontAsk")
        self.assertIn("--output-format", command)
        self.assertIn("stream-json", command)
        self.assertIn("--verbose", command)
        self.assertIn("--include-partial-messages", command)
        self.assertEqual(command[command.index("--effort") + 1], "medium")
        self.assertIn("--allowed-tools=Read,Bash(git diff *)", command)
        self.assertEqual(command[-1], "hello")
        self.assertNotIn("bypassPermissions", command)
        resumed = adapter.resume_command(model="a", provider_session_id="session-1", prompt="next")
        self.assertEqual(resumed[resumed.index("--resume") + 1], "session-1")

    def test_provider_specific_effort_allowlists_are_forwarded(self):
        codex = CodexAdapter(Path("/bin/codex"), allowed_models=("a",))
        codex_command = codex.new_command(model="a", prompt="hello", effort="xhigh")
        self.assertIn('model_reasoning_effort="xhigh"', codex_command)
        claude = ClaudeAdapter(Path("/bin/claude"), allowed_models=("a",))
        claude_command = claude.new_command(model="a", prompt="hello", effort="max")
        self.assertEqual(claude_command[claude_command.index("--effort") + 1], "max")


class AdapterParsingTests(unittest.TestCase):
    def test_codex_parser_ignores_reasoning_and_normalizes_events(self):
        adapter = CodexAdapter(Path("/bin/codex"), allowed_models=("a",))
        self.assertEqual(
            adapter.parse_line('{"type":"thread.started","thread_id":"cx-1","model":"a"}')[0].kind,
            "session_started",
        )
        self.assertEqual(
            adapter.parse_line('{"type":"item.completed","item":{"type":"reasoning","text":"hidden"}}'),
            [],
        )
        event = adapter.parse_line(
            '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}'
        )[0]
        self.assertEqual(event.kind, "assistant_message")
        self.assertEqual(event.text, "hello")
        self.assertEqual(adapter.parse_line('{"type":"turn.completed"}')[0].kind, "turn_finished")
        self.assertEqual(adapter.parse_line("truncated")[0].kind, "unknown")

    def test_claude_parser_drops_thinking_and_keeps_session_id(self):
        adapter = ClaudeAdapter(Path("/bin/claude"), allowed_models=("a",))
        init = adapter.parse_line('{"type":"system","subtype":"init","session_id":"cl-1","model":"a"}')[0]
        self.assertEqual(init.kind, "session_started")
        self.assertEqual(init.session_id, "cl-1")
        events = adapter.parse_line(
            '{"type":"assistant","session_id":"cl-1","message":{"content":[{"type":"thinking","thinking":"hidden"},{"type":"text","text":"hello"},{"type":"tool_use","name":"Read"}]}}'
        )
        self.assertEqual([event.kind for event in events], ["assistant_message", "tool_started"])
        partial = adapter.parse_line(
            '{"type":"stream_event","session_id":"cl-1","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"part"}}}'
        )
        self.assertEqual(partial[0].text, "part")
        self.assertEqual(adapter.parse_line('{"type":"result","subtype":"success","session_id":"cl-1"}')[0].kind, "turn_finished")


class SessionControllerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/tmp")
        root = Path(self.temp.name)
        self.root = root
        self.layout = StateLayout.from_state_dir(root / "state").ensure()
        self.state = StateStore(self.layout.db_path)
        session = self.state.create_session(
            source_message_id="source-1",
            repo=root / "repo",
            worktree=root / "worktree",
            branch="pipeline/S-0001",
        )
        self.session = session
        self.codex = self.state.create_provider_session(
            harness_session_id=session.id,
            provider=Provider.CODEX,
            default_model="a",
        )
        self.controller = ProviderSessionController(
            state=self.state,
            layout=self.layout,
            allowlists={Provider.CODEX: ("a", "b"), Provider.CLAUDE: ("c", "d")},
        )

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def test_model_switch_snapshots_only_when_idle(self):
        updated = self.controller.change_model(self.codex.id, "b")
        self.assertEqual(updated.default_model, "b")
        updated = self.controller.change_effort(self.codex.id, "xhigh")
        self.assertEqual(updated.default_effort, "xhigh")
        with self.assertRaises(ModelSwitchError):
            self.controller.change_model(self.codex.id, "not-allowed")
        with self.assertRaises(ModelSwitchError):
            self.controller.change_effort(self.codex.id, "max")
        turn = self.state.create_turn(
            provider_session_id=self.codex.id,
            owner_message_id="owner-1",
            requested_model="b",
            configured_model="b",
        )
        self.state.enqueue_turn(turn.id)
        self.state.claim_next()
        with self.assertRaises(ModelSwitchError):
            self.controller.change_model(self.codex.id, "a")
        with self.assertRaises(ModelSwitchError):
            self.controller.change_effort(self.codex.id, "low")
        self.assertEqual(self.state.get_provider_session(self.codex.id).default_model, "b")

    def test_cross_provider_switch_creates_new_row_and_safe_context(self):
        claude = self.controller.switch_provider(
            harness_session_id=self.session.id,
            provider=Provider.CLAUDE,
            requested_model="c",
            switched_from_id=self.codex.id,
        )
        self.assertNotEqual(claude.id, self.codex.id)
        self.assertEqual(claude.switched_from_id, self.codex.id)
        self.assertEqual(self.state.get_provider_session(self.codex.id).status, ProviderSessionStatus.SWITCHED)
        context = self.layout.session_dir(self.session.id) / "context.md"
        self.assertTrue(context.exists())
        self.assertNotIn("token", context.read_text(encoding="utf-8").lower())


if __name__ == "__main__":
    unittest.main()
