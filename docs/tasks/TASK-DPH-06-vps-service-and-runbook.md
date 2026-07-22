# TASK-DPH-06：VPS 服务化、doctor 与运维 runbook

状态：**已部署；doctor、user service、Gateway 连接和基础重启已验证，fake-turn 恢复演练留待 smoke/dogfood**
依赖：TASK-DPH-00 至 TASK-DPH-05
后续：TASK-DPH-07

## 目标

把已测试的 Harness 以 systemd --user 常驻服务部署到 VPS，并提供不含 secret 的安装、升级、故障恢复 runbook。服务只在 DPH-00 私有配置完整时启动。

## 允许改动

~~~text
tools/dev-pipeline-harness/src/dev_pipeline_harness/doctor.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/__main__.py
tools/dev-pipeline-harness/tests/**
ops/systemd/dev-pipeline-harness.service
ops/runbooks/dev-pipeline-harness.md
~~~

允许在 VPS 仓库外创建 ~/.local/share/dev-pipeline-harness/venv、~/.config/dev-pipeline-harness/env 和 ~/.local/bin/dev-pipeline-codex。不得把 venv、env、wrapper 中的 credential、journal 导出或用户级 token 加进 Git。

## 实施要求

1. venv 位于运行态目录而非仓库；安装 Python 子项目时不改变根 package-lock 或 Node 依赖。
2. 写一个显式 Codex wrapper，调用 doctor 已验证的 Node + npm launcher 或固定 standalone binary。wrapper 要原样转发 argv，不能依赖 login shell PATH，不能读取/打印 auth 内容。
3. doctor 在不泄漏 secret 的前提下检查：env 权限、目录可写、SQLite 迁移、systemd --user、CODEX_BIN/CLAUDE_BIN/version、两 provider auth、Git/gh identity、worktree 根隔离、Discord 配置、模型 allowlist、无第二个 active runner。
4. user unit 使用 EnvironmentFile 指向私有 env，WorkingDirectory 指向 Harness 源码，ExecStartPre 运行 doctor，Restart=on-failure，RestartSec=5，TimeoutStopSec=30，UMask=0077。不得用 root system service、tmux 或 cron 承载 bot。
5. runbook 包含 install、daemon-reload、enable/start/status、journal 查看、doctor、停止当前 turn、reconcile、升级、备份 SQLite、恢复 worktree 和紧急 disable。所有命令使用绝对或明确目录，且不打印 env。
6. 若 user manager 不会在 SSH 断开后持续存在，runbook 必须先检查 linger；只有 owner 明确同意时才启用 linger。

## VPS 验收

- doctor 通过且不输出 token/email/认证文件内容。
- service restart 后 bot 重新连接、SQLite 不重建、无 running turn 时状态稳定。
- 用 fake provider 启动一个足够长的 transient unit，重启 Harness service；新服务不启动第二个 unit，能恢复状态。
- systemctl --user stop dev-pipeline-harness 停 bot，但不停止 Hermes gateway 或 maintenance cron。
- repo git status 只出现本 TASK 允许的版本控制文件。

## 验收命令

~~~text
systemctl --user daemon-reload
systemctl --user enable --now dev-pipeline-harness
systemctl --user status dev-pipeline-harness --no-pager
<venv-python> -m dev_pipeline_harness.doctor
~~~

若 Discord 私有配置仍缺失，doctor 必须失败并给出字段名，不得以空 token 启动半工作服务。
