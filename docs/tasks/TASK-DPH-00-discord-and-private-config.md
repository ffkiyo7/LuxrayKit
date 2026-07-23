# TASK-DPH-00：Discord App 与私有配置前置

状态：**外部配置已完成；VPS r7 已注册唯一 `/dispatch task`；桌面/手机客户端交互仍需 owner 目视确认**
依赖：无
后续：TASK-DPH-01 至 TASK-DPH-07

## 目标

准备 codex-bot 的 Discord 身份和 VPS 私有配置，但不提交 token，不启动任何长期服务，也不改 Hermes。

## Owner 必须提供或亲自完成的动作

1. 在 Discord Developer Portal 创建名为 codex-bot 的 Application/Bot，或授权执行者在已登录窗口中完成。
2. 启用 Message Content intent。
3. 在目标 guild 只注册一个 guild-scoped Slash Command：`/dispatch task:<任务>`。
4. 将 bot 邀请到 luxraykit-dev，并仅授予 View Channel、Send Messages、Read Message History、Create Public Threads、Send Messages in Threads、Manage Threads、Pin Messages、Attach Files。
5. 将 bot token、guild ID、owner user ID 仅通过私有安全渠道写入 VPS；不要发送到仓库、PR、Discord Thread、模型 prompt 或聊天记录。

## VPS 私有配置

在 ubuntu 用户下创建 ~/.config/dev-pipeline-harness，模式 0700；创建 env，模式 0600。它至少包含：

~~~dotenv
DISCORD_TOKEN=<token>
DISCORD_ALLOWED_GUILD_ID=<guild-id>
DISCORD_PARENT_CHANNEL_ID=1529159963526693025
DISCORD_OWNER_USER_ID=<owner-id>
HARNESS_REPO=/home/ubuntu/LuxrayKit
WORKTREE_ROOT=/home/ubuntu/LuxrayKit-dev-worktrees
HARNESS_STATE_DIR=/home/ubuntu/.local/share/dev-pipeline-harness
MAX_CONCURRENT_RUNS=1
~~~

CODEX_BIN、CLAUDE_BIN 和模型 allowlist 由 TASK-DPH-03/06 确认后再加入。不要在此任务中复制 Codex auth.json、Claude 登录文件或 Hermes env。

## 验收

- 桌面端和手机端都能在目标频道的 Slash Command 选择器看到 `/dispatch`，并能填写必填的 `task`。
- bot 在目标频道可创建/发送/置顶 public Thread 消息，但不能访问不应访问的频道。
- env 文件为 owner-only，仓库 git status 没有 token、env 或生成凭据文件。
- 若 owner 尚不能访问 Developer Portal，记录为本任务的唯一 blocker；不要猜测 ID、临时用个人 bot 或绕过 intent。

## 禁止事项

- 不提交任何 secret、Discord ID 以外的 credential、OAuth 回调或截图。
- 不赋予 Administrator 权限，不开放全 guild 消息监听，不让 bot 响应其他 bot。
- 不启动 production Harness；此任务只完成外部前置。
