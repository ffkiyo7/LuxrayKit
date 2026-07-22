# Spike：Discord 可视、可恢复的强模型会话 Harness

> 状态：**✅ owner 已拍板，待实施** · 2026-07-22
> 关联：[dev-pipeline-workflow.md](dev-pipeline-workflow.md) v0.3。`codex-bot + harness` 已取代“强模型 session 只能走 Hermes 插件”的提案；Discord App 注册与 VPS 部署仍待 owner 的 Discord 登录可用时执行。

## 结论先行

1. **旧 Hermes-only §3.1 做不到目标体验。** 已有 `codex-relay` 是同步的
   `subprocess.run(..., capture_output=True)` handler：CLI 完成后才返回一条结果，既没有每个
   session 的 Discord Thread，也没有运行中事件流和可切换的会话注册表。
2. **能力本身完全可实现。** Codex CLI 的 `codex exec --json` 会发出 JSONL 事件，并在开头给出
   `thread.started` / `thread_id`；`codex exec resume --json <SESSION_ID> <PROMPT>` 可续同一会话。
   Claude Code 也支持 stream-json 与指定 session ID 的 `--resume`。
3. **已拍板：新建 `codex-bot` 和本地 Harness。** 它只做“强模型 session 的可视化、排队和恢复”，不取代
   Hermes、不参与弱模型决策、不拥有合并权。它可以与 Hermes 使用同一个可信 VPS Unix 用户和
   现有 CLI 凭据；分开的只是工作目录、进程和工作树，以便会话可恢复而不会互相踩文件。

这不是“把强/弱模型当不可信”的隔离方案。这里的边界是**产品交互和可恢复性**：一条 Discord
Thread 对应一个持久会话，一条 Git worktree 对应一个可能停驻的代码上下文。

## 1. 目标、边界与不变量

| 项目 | 目标 |
| --- | --- |
| 可视化 | 每个 Codex CLI / Claude Code session 在 `luxraykit-dev` 的一个原生 Discord 公共 Thread 中展示；父频道只放入口和摘要。 |
| 恢复 | Harness 持久保存 Discord Thread ↔ provider session ID ↔ repo/worktree/branch 的映射；服务重启、Thread 自动归档或换到其他 session 后都能继续。 |
| 单并发 | 任一时刻只允许一个 CLI turn 实际执行；可同时保留多个 parked session，并对任意一个排队续问。 |
| 流程边界 | PLAN、TASK、review、Draft PR、CI、preview、`!accept <PR#> <head-SHA>` 规则不变。bot 不 merge、不 push 到 `main`、不替人作验收判断。 |
| 凭据 | 同一可信 `ubuntu` 用户继续使用既有 Codex/Claude/GitHub 凭据；bot token 与 provider auth 不进入仓库、任务文档、JSONL 转录或 Discord。 |

非目标：不做多用户 SaaS、不做并发 worker 池、不把模型内部 reasoning 原样转贴到 Discord，也不以
webhook 伪装成 Hermes 人类入口。Webhook 可以发消息，却不能可靠地接收 session 输入、管理命令或
维护恢复状态，因此不足以满足本 spike 的需求。

## 2. 建议拓扑

```text
owner ──正常自然语言──► Hermes（普通聊天照旧）
  │ 长按/右键一条需求或 Hermes 回复 → Apps → 在 Codex/Claude 中继续
  ▼
Discord #luxraykit-dev ── 从被选原消息创建 public Thread（一个 Thread = 一个 session）
  │                         ▲ 事件摘要、命令状态、最终答复、日志附件
  ▼                         │
codex-bot（独立 Discord App） ──► dev-pipeline-harness（同一 ubuntu 用户）
                                       │ SQLite 队列，max_running = 1
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
          Codex CLI adapter                       Claude Code adapter
          JSONL / session ID                       stream-json / session ID
                    │                                     │
                    └────────每个 session 的 worktree──────┘

Hermes（现有 bot / API）──普通聊天、弱模型 TASK 下发、cron、项目通知；不被 codex-bot 截获或替代。
```

`codex-bot` 是**一个** bot 身份，但每个 Thread 的标题、bot 置顶状态卡和每条输出都显式标
`Codex` 或 `Claude`。标题只放短 model 身份；完整 provider/model 状态放在真实置顶卡。若以后希望
两种模型显示为两个不同 Discord 身份，才另开两个 bot App；v1 没有这个必要。

这一方案应替换 workflow §8 的决策②为：

> Hermes 保留为弱模型/自动化 dispatcher；强模型的可视、可恢复 session 由专用
> `codex-bot + harness` 承担。它不定义或绕过流水线审批规则，且所有执行仍全局单并发。

## 3. Discord 交互规格

### 3.1 建立与显示

**默认入口不是长 slash command。** 人先照常和 Hermes 聊；需要让 Codex/Claude 接手时，长按/右键
自己的需求或 Hermes 的关键回复，在 Discord **Apps** 菜单选择原生 Message Command：

```text
在 Codex 中继续
在 Claude 中继续
```

interaction 会把目标消息交给 `codex-bot`。bot 直接从该目标消息创建 public Thread，因此 Thread
天然锚定需求/回复，而不是另发一条假父卡；同一源消息只允许一个 Thread，重复选择必须打开原 session。
`/c <prompt>`、`/a <prompt>` 只作为无上下文新建 session 的短 slash 备用入口。

Thread 是 Discord 原生“子区”：能看见父频道的人可见，不需要为每个需求创建真正频道。bot 将 Thread
命名为如 `S-0042 · Codex · GPT-5.6`，并在 Thread 内发出、**实际置顶**、持续编辑的状态卡：

```text
S-0042 · running
Provider: Codex
Model: requested GPT-5.6 / effective GPT-5.6
Branch: pipeline/S-0042 · Queue: active · Turn: 3
[中断] [排到下一位] [关闭]
```

Discord 没有 app 可写的永久悬浮 Thread 顶栏；标题 + 置顶状态卡是原生 UI 的准确边界，状态卡不是 Agent
进入 session 后才补发的第一句话。普通 Thread 文本续聊需要 Message Content intent；bot 只接受配置的
owner 在自己管理的 session Thread 内的文字，永远忽略 bot author，避免与 Hermes 互刷。

### 3.2 输出策略

不按 token 高频刷屏，而是将可行动的 CLI 事件直接写在该 Thread：

- 一条可编辑的 live status（`queued` / `running` / `needs_input` / `completed` / `failed` /
  `interrupted`）每 2–5 秒合并更新一次；
- agent 面向用户的消息、命令开始/结束、退出码、文件修改摘要和最终答复以普通子消息显示；
- 大段 stdout/stderr 保存为该 turn 的 JSONL/文本附件，Thread 只放带行数与摘要的链接/附件；
- 输出先按已知 token 值和常见密钥格式脱敏。理由是 Discord 历史是长期可见记录，而非不信任
  VPS 上的模型。

这能让人实时看见“它在跑什么”，又避开 Discord 的消息长度和频率限制。模型隐藏 reasoning 不作为
“session 输出”转发；可审计的动作、工具结果和最终答复才是人需要的部分。

### 3.3 切换、暂停与恢复

- **切换**：给另一条 session Thread 发消息即可入队；当前 turn 结束后，队列按 owner 选择的顺序
  取下一项。状态卡的“排到下一位”按钮可把已排队的 turn 移到下一位。
- **暂停活动 turn**：没有安全的“冻结任意 CLI 子进程、以后从进程内存继续”的承诺。状态卡的“中断”按钮
  只会向当前进程组发送受控中断，记录为 `interrupted`；随后以已保存的 provider session ID 发起新
  turn 续谈。
- **恢复 parked/completed session**：该 Thread 内的下一条 owner 消息都会先取消归档（若已归档）、再入队；
  归档场景可从父频道的短 `/resume <S-id> <prompt>` 备用命令找回。不是“只有一个 current session”的插件状态。
- **服务崩溃**：启动时检查记录中的 PID/进程组；仍存活则重新接管事件流，否则将该 turn 标为
  `interrupted` 并提示 owner 选择 resume/retry。已取得的 provider session ID 和最后的 context pack
  不丢失。

因此，“全局单并发”不等于“只能有一个会话”。它表示一个时刻仅一个正在执行的 turn，多个会话可以
可见、停驻、排队和恢复。

## 4. Harness 持久状态

Markdown 继续保存人可读的 PLAN/TASK/REVIEW；会话控制改用本机 SQLite，而不是把多 session 的
队列塞进单个 JSON 文件。它是 Python 标准库可用的本地事务数据库，不引入服务器或权限边界。

建议位置（`0700` 目录、`0600` 文件）：

```text
~/.local/share/dev-pipeline-harness/
  harness.sqlite3                 # sessions / turns / queue / event cursor
  sessions/S-0042/context.md      # 人可读 fallback context pack
  sessions/S-0042/turn-0007.jsonl # 原始、脱敏前受限转录；不上传仓库
  sessions/S-0042/turn-0007.log   # 供 Discord 附件的脱敏副本
~/.local/state/dev-pipeline-harness/harness.lock
~/LuxrayKit-dev-worktrees/S-0042/ # 此 session 的 Git worktree
```

最小数据关系：

| 实体 | 必须字段 |
| --- | --- |
| `sessions` | `id`、`source_message_id`、`provider`、`requested_model`、`effective_model`、`provider_session_id`、`repo`、`worktree`、`branch`、`discord_thread_id`、`status_card_message_id`、`status`、`created_at`、`last_context_path` |
| `turns` | `session_id`、序号、owner Discord message ID、状态、PID/进程组、起止时间、退出码、原始/脱敏转录路径、最终消息摘要 |
| `queue` | `turn_id`、顺序、`queued_at`、`requested_by`、取消/开始时间 |

SQLite 写入以短事务完成；实际 runner 另持有一个 `flock`，防止 systemd 重启或手工启动两个
Harness 而同时执行。**这个锁只锁 Harness 的一个 CLI turn，不锁 Hermes 其他通用工作，也不锁
maintenance cron。**

每 turn 完成后更新 `context.md`：需求、关键决定、工作树/HEAD、未解决项、最后的模型答复摘要。
若 provider 本身的历史因保留策略失效，Harness 不应悄悄另起空会话；应提示 owner，并用该 context
pack 开一个明确标记为“recovered”的新 session。

## 5. Provider adapter 规格

所有 subprocess 由 Harness 以 `cwd=<session worktree>` 启动，不依赖 SSH 登录 shell 的 `PATH`，也不
将 prompt 或环境变量拼进 shell 字符串。

### Codex CLI（已本机核对）

- 新 turn：`codex exec --json --sandbox workspace-write <prompt>`；首个 `thread.started` JSONL 事件
  的 `thread_id` 必须在开始任何长任务前持久写入 `provider_session_id`。
- 恢复：`codex exec resume --json <thread_id> <prompt>`。本机 CLI 已核对该子命令接受指定 ID、prompt
  与 `--json`。
- 禁止 `--ephemeral`，否则没有恢复语义。起始 sandbox/模型配置也记录进 `sessions`，续会不隐式扩大
  权限。

### Claude Code（以 VPS 实机 smoke 为准）

- 候选新 turn：`claude -p --output-format stream-json --include-partial-messages <prompt>`。
- 候选恢复：`claude -p --resume <session_id> --output-format stream-json --include-partial-messages <prompt>`。
- adapter 必须从实际 JSON 事件中保存 Claude session ID；Task 3 会在当前 VPS CLI 版本上验证准确参数顺序、
  事件字段和 interrupted 后的恢复，不能只依据文档假设。

两个 adapter 对外统一产生：`session_started`、`assistant_message`、`tool_started`、`tool_finished`、
`turn_finished`、`turn_failed`。Discord 层只认识这些中立事件，避免把 provider 私有 JSON 协议散落在
bot 代码中。

## 6. VPS 上的具体建议

### 6.1 进程与目录

建议把 Harness 做成单独、受版本控制的小服务仓库 `~/dev-pipeline-harness`，而不是塞入
LuxrayKit 的 Cloudflare 应用仓库。这是为了不污染产品依赖和 Workers Builds，**不是**另建 Unix 用户、
容器或权限墙。它仍以现有 `ubuntu` 用户运行，能看到既有 `~/.codex/auth.json` 和 Claude 登录态。

建议 Python + `asyncio` + `discord.py`：当前 Hermes 插件已是 Python，`asyncio.create_subprocess_exec`
可直接消费两个 CLI 的 JSONL，同时一个长驻 Gateway 连接即可接收 Thread 消息。不要通过同步 Hermes
plugin handler 承载这个 event loop。

每个 implementation session 使用新 worktree；discussion session 可先使用只读的策展 clone，但一旦
允许改文件就升级/迁移到独立 worktree。现有 `~/LuxrayKit`（策展）和
`~/LuxrayKit-maintenance`（cron）永不作为 Harness 的写入工作树。

### 6.2 systemd user unit（示意）

```ini
[Unit]
Description=Dev pipeline Discord session harness
After=network-online.target

[Service]
WorkingDirectory=%h/dev-pipeline-harness
EnvironmentFile=%h/.config/dev-pipeline-harness/env
ExecStartPre=%h/dev-pipeline-harness/.venv/bin/python -m harness.doctor
ExecStart=%h/dev-pipeline-harness/.venv/bin/python -m harness.bot
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077

[Install]
WantedBy=default.target
```

`env` 仅包含 Discord bot token、允许的 guild/channel/owner ID、绝对 CLI 路径、worktree 根路径和
`MAX_CONCURRENT_RUNS=1`，例如：

```dotenv
DISCORD_TOKEN=<new-bot-token>
DISCORD_ALLOWED_GUILD_ID=<guild-id>
DISCORD_PARENT_CHANNEL_ID=1529159963526693025
DISCORD_OWNER_USER_ID=<owner-id>
CODEX_BIN=/absolute/path/to/codex
CLAUDE_BIN=/usr/bin/claude
WORKTREE_ROOT=/home/ubuntu/LuxrayKit-dev-worktrees
MAX_CONCURRENT_RUNS=1
```

`harness.doctor` 必须在服务启动前检查：两个二进制的绝对路径及版本、Codex auth 是否可用、Claude
登录/token 是否可用、state/worktree 目录权限、Discord 配置完整性、Git/`gh` 身份，以及没有第二个
持锁 runner。先前非交互 SSH 的 `PATH` 未发现 `codex`，所以**不能**把裸 `codex` 当作 systemd 环境
中的已知路径；先在该 user service 的实际环境中定位并写死绝对路径。

Claude OAuth token 如需注入，应从已有同用户私有 secret 文件以最小范围提供给本服务；不要整份
source `~/.hermes/.env`，更不要把该文件内容写入 Discord、日志或仓库。Codex 仍读取已有 auth 文件，
Harness 不复制它。

### 6.3 Discord App 前提

owner 登录 Discord Developer Portal 后，由 agent 创建并邀请新的 Discord Application bot：`codex-bot`。
初始注册两个 guild-scoped Message Commands：`在 Codex 中继续`、`在 Claude 中继续`；它们在消息长按/右键的
Apps 菜单中出现。给它在 `luxraykit-dev` 的最小功能权限：View Channel、Send Messages、Read Message
History、Create Public Threads、Send Messages in Threads、Manage Threads、**Pin Messages**、Attach Files。
普通 Thread 续聊还需在 Developer Portal 启用 Message Content intent；若不启用，就只开放 message-command
启动、按钮/modal 与短 slash 续问。

bot 只接受指定 guild、父频道、Thread 和 owner user ID 的输入，且永远忽略 bot author。这样能让
Hermes 与新 bot 同处一个频道而不会形成互相触发的回路。

## 7. 验收与故障恢复准则

- 在一条 owner 需求和一条 Hermes 回复上分别执行 Message Command；各自从原消息创建 Thread，Thread 内能看到启动、工具事件、最终答复与真实置顶状态卡。
- 对同一源消息重复执行 Message Command，不创建第二个 Thread，而是打开/提示原 session。
- 同一 Thread 追加第二次需求，确实使用第一次保存的 provider session ID，而非开新会话。
- 同时向两条 Thread 发续问：只一条处于 `running`，另一条显示准确队列位置；完成后自动切换。
- 主动重启 Harness、以及中断一个长 turn：service 重启后不会重复执行同一 turn；owner 可从原 Thread
  resume。
- 已归档 Thread 可由 `/session resume` 找回；状态数据库而非 Discord 的 active Thread 列表是事实来源。
- 实现任务一律在独立 worktree 分支；走现有 Draft PR → CI → preview → owner `!accept` 规则。

## 8. 拆成正式 TASK 前的顺序化工作包

本 spike 被 `!approve` 后，再把下列工作包各自写成 `docs/tasks/TASK-...md`。它们必须**串行**执行，
不以“多个 agent 并发”换速度。

| 顺序 | 工作包 | 产出与 DoD |
| --- | --- | --- |
| 0 | Discord App 与命令注册 | owner 提供已登录的 Discord Developer Portal；agent 创建 `codex-bot`、设置 guild/channel/owner allowlist、Message Content intent、Thread/Pin 权限，注册 `在 Codex 中继续` 与 `在 Claude 中继续` 两个 Message Commands，并以手机和桌面端实测 Apps 菜单可见。 |
| 1 | Harness 核心 | SQLite schema/migration、单运行队列、`flock`、session/context pack、受控中断和 restart recovery；单元测试覆盖队列去重、崩溃状态迁移与队列排序。 |
| 2 | Codex adapter | JSONL parser、`thread.started` 早存储、start/resume、脱敏转录；在一次性 Git worktree 中完成真实 start → resume smoke，证明 ID 未变。 |
| 3 | Claude adapter | stream-json parser、session ID 抽取、start/resume/interrupt smoke；以当前 VPS 已安装的 CLI 版本写出锁定的适配测试和错误提示。 |
| 4 | Discord UI | Message Command 从原消息创建公共 Thread、标题 + 真实置顶状态卡、Thread 内 owner 消息续问、队列/status 输出、归档/解归档、附件大小处理；`/c`、`/a` 仅作 fallback，mock Discord API 测试且不监听任何 bot 消息。 |
| 5 | VPS 服务化 | `doctor`、venv/依赖锁定、systemd --user unit、私有 env 文件、journal/runbook；先不接生产仓库，在 disposable repo 做 service restart 演练。 |
| 6 | 流水线接线与 dogfood | 更新 workflow §3/§7/§8、写操作 runbook；用一个低风险文档需求从 Discord 完整走一轮，确认 Draft PR、CI、preview 和 `!accept` 没有被 bot 绕过。 |

Task 2/3/4 的日志脱敏和 Task 6 的真实 PR 规则是不可删的 DoD；否则“看似可视化”会退化成无法恢复的终端转发器。

## 9. 已拍板与待执行事项

1. ✅ workflow §3.1 采用受限的 `codex-bot + harness` 例外；普通 Hermes 聊天不改变。
2. ✅ 新 bot 名称为 `codex-bot`；一个 bot 身份可承载 Codex 与 Claude，标题/状态卡必须明确 provider/model。
3. ✅ owner 在 Thread 内直接发普通文本续问，启用 Message Content intent；Message Command 是默认建 session 入口。
4. ⬜ Harness 源码单独建私有仓库；同一 VPS 用户、同一凭据，不影响 LuxrayKit 的产品 CI/Workers Builds。

## 参考

- [Discord Threads](https://docs.discord.com/developers/topics/threads)：公共 Thread、归档/解归档及专用权限。
- [Discord Application Commands](https://docs.discord.com/developers/interactions/application-commands)：Message Command 的 Apps 菜单与目标消息 interaction。
- [Discord Channel API](https://docs.discord.com/developers/resources/channel)：从既有消息创建 public Thread；一个源消息仅一个 Thread。
- [Discord Message API](https://docs.discord.com/developers/resources/message)：置顶消息与 `PIN_MESSAGES` 权限。
- [Discord Interactions & Components](https://docs.discord.com/developers/platform/interactions)：button/modal 和异步响应模型。
- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)：`stream-json` 与 `--resume`。
- Codex CLI 本机 `codex exec resume --help`（2026-07-22）：指定 session ID、prompt 与 `--json` 已直接核对。
