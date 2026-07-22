# Dev Pipeline Harness VPS Runbook

本 runbook 只使用 `ubuntu` 用户的 `systemd --user`。它不启动 root service、tmux、cron，也不打印私有 env。

## Install / upgrade

在 VPS 上执行，源码 checkout 使用 `/home/ubuntu/LuxrayKit`，模型写入目标只能是 `/home/ubuntu/LuxrayKit-dev-worktrees/S-####`。

先确认 Python 的 venv 支持存在；若 `python3 -m venv` 报 `ensurepip is not available`，请由有 sudo 权限的 VPS owner/管理员只安装匹配版本的系统包（本机当前是 Python 3.12）：

```bash
sudo apt-get install python3.12-venv
```

没有 sudo 时不要把 `--break-system-packages` 写进生产安装流程；先解决该系统前置。

```bash
cd /home/ubuntu/LuxrayKit
python3 -m venv /home/ubuntu/.local/share/dev-pipeline-harness/venv
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m pip install --upgrade pip
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m pip install -e /home/ubuntu/LuxrayKit/tools/dev-pipeline-harness
install -d -m 700 /home/ubuntu/.config/dev-pipeline-harness
install -d -m 700 /home/ubuntu/.local/share/dev-pipeline-harness
install -d -m 700 /home/ubuntu/.local/bin
```

通过密码管理器或 VPS 本地安全输入创建 `/home/ubuntu/.config/dev-pipeline-harness/env`，权限必须为 `0600`。不要把 token 写入 shell 命令、history、仓库、PR 或聊天。

生成固定 Codex wrapper（不复制 auth 文件）：

```bash
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m dev_pipeline_harness install-wrapper \
  --target /home/ubuntu/.local/bin/dev-pipeline-codex \
  --launcher /home/ubuntu/.local/bin/codex
```

确认 `CODEX_BIN=/home/ubuntu/.local/bin/dev-pipeline-codex`、`CLAUDE_BIN=/usr/bin/claude`、两个非空模型 allowlist 和 provider-specific reasoning effort allowlist 已私下写入 env 后，运行：

```dotenv
CODEX_DEFAULT_REASONING_EFFORT=medium
CODEX_ALLOWED_REASONING_EFFORTS=none,minimal,low,medium,high,xhigh
CLAUDE_DEFAULT_REASONING_EFFORT=medium
CLAUDE_ALLOWED_REASONING_EFFORTS=low,medium,high,xhigh,max
```

```bash
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m dev_pipeline_harness doctor \
  --env-file /home/ubuntu/.config/dev-pipeline-harness/env
```

doctor 失败时只修复它报告的字段名/权限/路径，不复制 `auth.json`、Claude 登录文件或 Hermes env。

## Enable / start / inspect

```bash
mkdir -p /home/ubuntu/.config/systemd/user
install -m 600 /home/ubuntu/LuxrayKit/ops/systemd/dev-pipeline-harness.service \
  /home/ubuntu/.config/systemd/user/dev-pipeline-harness.service
systemctl --user daemon-reload
systemctl --user enable --now dev-pipeline-harness
systemctl --user status dev-pipeline-harness --no-pager
journalctl --user -u dev-pipeline-harness -n 100 --no-pager
```

如果 SSH 断开后 user manager 不会持续，先只检查 linger：

```bash
loginctl show-user ubuntu -p Linger
```

只有 owner 明确同意后才执行 `sudo loginctl enable-linger ubuntu`。不要把它作为安装的隐式步骤。

## Stop one turn / reconcile

先从 SQLite/status card 找到完整 `S-####` 和 `T-####`，只停止 Harness 记录的 unit：

```bash
systemctl --user stop dev-pipeline-turn-S-0042-T-0007
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m dev_pipeline_harness reconcile \
  --env-file /home/ubuntu/.config/dev-pipeline-harness/env
```

不要使用 `pkill`, `killall` 或按 `hermes`/`python` 模糊匹配；runner 的 cgroup stop 不应影响 Hermes gateway 或 maintenance cron。

## Backup / recovery

```bash
install -d -m 700 /home/ubuntu/.local/share/dev-pipeline-harness/backups
sqlite3 /home/ubuntu/.local/share/dev-pipeline-harness/harness.sqlite3 ".backup '/home/ubuntu/.local/share/dev-pipeline-harness/backups/harness-$(date -u +%Y%m%dT%H%M%SZ).sqlite3'"
chmod 600 /home/ubuntu/.local/share/dev-pipeline-harness/backups/*.sqlite3
git -C /home/ubuntu/LuxrayKit worktree list
```

恢复前停止服务并保留原数据库副本；不要删除或 reset 任何 `S-####` worktree。若 unit 已结束但 result JSON 存在，先运行 reconcile；若 unit/result 都不存在，状态会变为 `interrupted`，再由 owner 发送 `!resume` 或新的普通文本。

## Upgrade / emergency disable

```bash
systemctl --user stop dev-pipeline-harness
cd /home/ubuntu/LuxrayKit
git status --short --branch
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m pip install -e /home/ubuntu/LuxrayKit/tools/dev-pipeline-harness
systemctl --user daemon-reload
/home/ubuntu/.local/share/dev-pipeline-harness/venv/bin/python -m dev_pipeline_harness doctor \
  --env-file /home/ubuntu/.config/dev-pipeline-harness/env
systemctl --user start dev-pipeline-harness
```

紧急停用：

```bash
systemctl --user disable --now dev-pipeline-harness
systemctl --user stop 'dev-pipeline-turn-S-####-T-####'
```

最后一条必须替换为 status card 中的精确 unit 名称；不要使用未解析的 glob。停用不会删除 SQLite、转录或 worktree。重新启用前必须再次通过 doctor 和 owner 验收。
