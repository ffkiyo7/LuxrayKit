from __future__ import annotations

import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dev_pipeline_harness.doctor import _check_login, install_codex_wrapper, load_env_file


class DoctorTests(unittest.TestCase):
    def test_login_check_uses_each_provider_cli_contract(self):
        with patch("dev_pipeline_harness.doctor._run", return_value=(True, "ok")) as run:
            self.assertTrue(_check_login(Path("/usr/bin/codex"), label="Codex").passed)
            self.assertTrue(_check_login(Path("/usr/bin/claude"), label="Claude").passed)

        self.assertEqual(run.call_args_list[0].args[0], ["/usr/bin/codex", "login", "status"])
        self.assertEqual(run.call_args_list[1].args[0], ["/usr/bin/claude", "auth", "status"])

    def test_env_parser_and_wrapper_never_copy_auth(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            root = Path(directory)
            env = root / "env"
            env.write_text("DISCORD_TOKEN=do-not-print\nA=one=two\n", encoding="utf-8")
            env.chmod(0o600)
            values = load_env_file(env)
            self.assertEqual(values["A"], "one=two")
            launcher = root / "launcher"
            launcher.write_text("#!/bin/sh\nexec /usr/bin/printf '%s\\n' \"$@\"\n", encoding="utf-8")
            launcher.chmod(0o700)
            target = root / "bin" / "dev-pipeline-codex"
            install_codex_wrapper(target=target, launcher=launcher)
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            content = target.read_text(encoding="utf-8")
            self.assertNotIn("do-not-print", content)
            self.assertIn(str(launcher), content)


if __name__ == "__main__":
    unittest.main()
