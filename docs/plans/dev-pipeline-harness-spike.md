# Dev Pipeline Harness 落地规格（v1.0 · 2026-07-23）

> 状态：**实现已落地；仍待 owner 完成 Discord 客户端验收与 DPH-07 dogfood。** 本文取代 2026-07-22 的 spike 结论，作为 TASK-DPH-00 至 TASK-DPH-07 的唯一技术契约。流程级规则见 [dev-pipeline-workflow.md](dev-pipeline-workflow.md)。

## 1. 结论与已验证前提

目标体验可以在现有 VPS 上落地，但必须采用下列架构，而不是旧的“同步 Hermes 插件 + JSON 状态”方案。

| 已核实事实 | 对设计的约束 |
| --- | --- |
| Hermes 0.18.0 的 HTTP runs API 没有 cwd/worktree 字段。 | 需要写代码的弱模型任务必须由本机 runner 在目标 worktree 启动 hermes -z，不能只在 prompt 中要求 cd。 |
| VPS 有 Python 3.12、venv、SQLite 和可用的 systemd-run --user。 | Harness 用 Python 标准库 + discord.py；每个实际 CLI turn 是 transient user service。 |
| Codex CLI 0.144.6 和 Claude Code 2.1.216 已登录。 | 两个 adapter 可做真实 start/resume smoke；不需要复制登录凭据。 |
| Codex exec resume 接受 -m/--model；Claude 的 --resume 与 --model 可并用。 | 模型可以在同 provider session 的后续 turn 更换，必须按 turn 记审计记录。 |
| 非交互 SSH PATH 没有可直接调用的 codex。 | service 不得调用裸 codex；doctor 必须验证显式 wrapper 或绝对可执行路径。 |
| 非 main preview 与生产共用 KV。 | Harness v1 只读取 preview/CI 状态；不部署、不写 KV、不改变 Worker binding。 |

## 2. 范围

### 2.1 v1 要交付

- 一个 codex-bot Discord Application，且只接受配置的 owner、guild、父频道和本 bot 创建的 Thread。
- 从 Discord Message Command 建立 S-#### Harness session、独立 Git worktree 和原生 public Thread。
- Codex / Claude 的 JSON 流、持久 session ID、单并发队列、停止、服务重启后的恢复。
- 真实置顶并可编辑的状态卡、脱敏输出、owner 的普通 Thread 文本续问。
- PLAN/TASK/review、受控 Hermes 弱模型执行、Draft PR、CI/preview/!accept 门禁。

### 2.2 v1 明确不做

- 不做多用户产品、并发 worker pool、跨 provider 的隐藏 transcript 迁移或自动 merge。
- 不把 provider hidden reasoning、完整环境变量或原始 stderr 发到 Discord。
- 不改 Hermes 普通聊天、maintenance cron、Cloudflare Worker 或 main 的部署路径。
- 不承诺恢复一个已杀死 CLI 进程的内存；恢复是以其已持久化的 provider session 和 context pack 开启新 turn。

## 3. 源码与运行目录

不新建仓库。Python 子项目与运维文件均随 LuxrayKit 版本控制，Node/Workers Builds 不会安装或执行它。

~~~text
LuxrayKit/
  tools/dev-pipeline-harness/
    pyproject.toml
    src/dev_pipeline_harness/
    tests/
  ops/systemd/dev-pipeline-harness.service
  ops/runbooks/dev-pipeline-harness.md
  docs/tasks/TASK-DPH-00-*.md ... TASK-DPH-07-*.md

~/.config/dev-pipeline-harness/env                 # 0600，所有 secret/部署配置
~/.local/share/dev-pipeline-harness/
  harness.sqlite3                                  # 0600，机器状态唯一真相
  locks/global-runner.lock
  locks/worktree-<sha256-realpath>.lock
  sessions/S-0042/context.md
  sessions/S-0042/turn-0007.raw.jsonl
  sessions/S-0042/turn-0007.discord.log
  sessions/S-0042/turn-0007.result.json
~/LuxrayKit-dev-worktrees/S-0042/                 # Git worktree，pipeline/S-0042
~~~

服务的源码 checkout 可以是现有 ~/LuxrayKit，但它只提供 Harness 程序，不作为模型写入工作树。所有 implementation、review 和弱模型命令均从 S-#### worktree 的 cwd 执行。现有 ~/LuxrayKit-maintenance 绝不可被 Harness 读取为写入目标、锁定或清理。

## 4. 配置与 secret 契约

配置文件只在 VPS 私有目录中创建，目录模式 0700、文件模式 0600；不得提交示例中的真实值。

~~~dotenv
DISCORD_TOKEN=<dedicated-codex-bot-token>
DISCORD_ALLOWED_GUILD_ID=<guild-id>
DISCORD_PARENT_CHANNEL_ID=1529159963526693025
DISCORD_OWNER_USER_ID=<owner-id>

HARNESS_REPO=/home/ubuntu/LuxrayKit
WORKTREE_ROOT=/home/ubuntu/LuxrayKit-dev-worktrees
HARNESS_STATE_DIR=/home/ubuntu/.local/share/dev-pipeline-harness
CODEX_BIN=/home/ubuntu/.local/bin/dev-pipeline-codex
CLAUDE_BIN=/usr/bin/claude
MAX_CONCURRENT_RUNS=1

CODEX_DEFAULT_MODEL=gpt-5.6-terra
CODEX_ALLOWED_MODELS=gpt-5.6-terra,gpt-5.6-sol,gpt-5.6-luna
CLAUDE_DEFAULT_MODEL=claude-sonnet-5
CLAUDE_ALLOWED_MODELS=claude-sonnet-5
CODEX_DEFAULT_REASONING_EFFORT=medium
CODEX_ALLOWED_REASONING_EFFORTS=none,minimal,low,medium,high,xhigh
CLAUDE_DEFAULT_REASONING_EFFORT=medium
CLAUDE_ALLOWED_REASONING_EFFORTS=low,medium,high,xhigh,max
~~~

doctor 必须拒绝缺字段、相对路径、world-readable secret、空 allowlist、同一 worktree 根指向策展或 maintenance clone、不可执行 CLI、未登录 provider、无 Git/GitHub 身份和第二个 active runner。

Codex wrapper 的目的仅是固定 launcher/Node，而不是复制 auth.json。其最小行为是把参数原样交给经 doctor 验证的 Codex launcher；wrapper 和 systemd service 都不得输出认证文件内容。Claude 继续用该用户既有登录态；不得 source 整个 Hermes env 文件。

## 5. 核心对象与 SQLite schema

一个 Discord Thread 对应一个 Harness session；一个 Harness session 可包含多个 provider session，以支持显式 provider-switch。SQLite 启用 WAL、foreign_keys、busy_timeout，所有状态转移使用短事务和条件更新。

| 表 | 关键字段 | 不变量 |
| --- | --- | --- |
| harness_sessions | id（S-####）、source_message_id、discord_thread_id、repo、worktree、branch、status、context_path | source_message_id 和 discord_thread_id 均唯一；worktree 只能由 Harness 创建。 |
| provider_sessions | id、harness_session_id、provider、provider_session_id、default_model、default_effort、status、switched_from_id | provider_session_id 仅在该 provider 中解释；跨 provider 必须新行。 |
| turns | id、provider_session_id、owner_message_id、requested_model、configured_model、requested_effort、configured_effort、reported_model、state、attempt、unit_name、started_at、finished_at、exit_code、raw_path、sanitized_path、result_path | 每一条用户输入只创建一个可执行 turn；terminal turn 不可重跑为同一 attempt。 |
| queue | turn_id、ordinal、queued_at、claimed_at、cancelled_at | 一个 turn 最多一个未取消 queue 行；全局只允许一个 claimed 且 running。 |
| event_cursors | turn_id、raw_byte_offset、last_event_seq、discord_message_id | 消费可重放；bot 重启不能重复发完整日志。 |
| pipeline_runs | harness_session_id、plan_path、plan_hash、base_sha、head_sha、review_round、pr_number、ci_state、preview_url、accepted_by、accepted_head_sha | 仅记录机器门禁；PLAN/TASK/REVIEW 正文仍在仓库。 |

模型字段语义固定如下：

- requested_model：owner/调度器请求、在入队时快照的 allowlist 名称。
- configured_model：实际传给 CLI 的 allowlist 名称。
- reported_model：只有 provider JSON 事件明确报告后才填；空值不等于 configured_model。
- default_model：下一个新入队 turn 的默认值；换模失败不得修改它。
- requested_effort/configured_effort：owner 请求和实际传给 CLI 的 provider-specific 强度，在入队时 snapshot；换强度失败不得修改 default_effort。
- default_effort：下一个新入队 turn 的默认强度，只能从该 provider 的完整 allowlist 选择。

## 6. 生命周期、锁与 transient runner

~~~text
Discord interaction / owner Thread message
        |
        v
SQLite transaction: create or enqueue turn
        |
        v
coordinator claims exactly one turn
        |
        v
systemd-run --user: dev-pipeline-turn-S-0042-T-0007
        |
        +-- global flock + worktree flock
        +-- runner starts one provider CLI with cwd=worktree
        +-- raw JSONL/result file + narrow SQLite event transactions
        |
        v
bot imports cursor delta, edits status card, emits sanitized summary
~~~

Harness 的协调进程不直接把 provider stdout 当作唯一事实。实际 turn 由 transient unit 的 runner 执行：coordinator 在同一事务中把 queued 改为 launching 并生成唯一 unit name；systemd-run --user 启动 runner，设置 WorkingDirectory、KillMode=control-group、UMask=0077、TimeoutStopSec，并只传递运行 provider 所需的最小环境；runner 先取得 global lock 和以 realpath 哈希得到的 worktree lock，再把 turn 改为 running；runner 使用 create_subprocess_exec，不经 shell，写 0600 原始转录、脱敏副本和 result JSON；runner 在 finally 中以幂等条件事务写 terminal state、释放锁并退出；coordinator/Discord bot 只消费转录增量和 result，不拥有 provider 进程。

停止按钮只向该 unit 执行 systemctl --user stop。它必须等待 runner 写完 terminal result；若超时则标记 interrupted，不能假装该 turn 已完成。服务启动的 reconcile 规则是：

| 检查结果 | 动作 |
| --- | --- |
| unit active | 不启动新的 provider；恢复读取游标，显示 running。 |
| unit inactive 且有 terminal result | 幂等导入结果，更新状态卡。 |
| unit 不存在且没有 terminal result | 标记 interrupted，保留 resume/retry 入口。 |
| SQLite 显示 running 但 global lock 空闲 | 先做上述核对；绝不直接再次执行同一 attempt。 |

## 7. Worktree 与 Git 规则

新 session 只能从最新 origin/main 创建：

~~~text
git -C <HARNESS_REPO> fetch origin main
git -C <HARNESS_REPO> worktree add -b pipeline/S-0042 <WORKTREE> origin/main
~~~

创建前必须验证目标不存在、实际路径不在禁止 clone 下、基础 SHA 已记录。Harness 可以在 owner 明确命令后 archive worktree，但 v1 不自动删除任何 worktree。所有 provider 和 Hermes runner 的 cwd 都是该绝对 worktree 路径；prompt 中的 cd 不能替代它。

## 8. Provider adapter 契约

adapter 对 coordinator 输出统一事件：

~~~text
session_started
assistant_message
tool_started
tool_finished
turn_finished
turn_failed
~~~

私有原始事件可保留 provider 字段；Discord 层只能消费统一事件和经过脱敏的正文。

### 8.1 Codex

新 session 的命令形态：

~~~text
<CODEX_BIN> exec --json --sandbox workspace-write -c 'model_reasoning_effort="<effort>"' -m <model> <prompt>
~~~

adapter 在第一个 thread.started 事件出现时立即持久化 provider_session_id。恢复形态：

~~~text
<CODEX_BIN> exec resume --json -c 'model_reasoning_effort="<effort>"' -m <model> <provider-session-id> <prompt>
~~~

禁止 --ephemeral。每个 command 记录 sandbox、model 和 CLI version；续会不得静默扩大 sandbox 或权限。

### 8.2 Claude Code

新 session 的命令形态：

~~~text
<CLAUDE_BIN> -p --model <model> --effort <effort> --permission-mode dontAsk --output-format stream-json --verbose --include-partial-messages <prompt>
~~~

恢复形态：

~~~text
<CLAUDE_BIN> -p --resume <provider-session-id> --model <model> --effort <effort> --permission-mode dontAsk --output-format stream-json --verbose --include-partial-messages <prompt>
~~~

当前 CLI 要求 stream-json 的 partial messages 同时具备 print、stream-json 和 verbose；因为 -p 已提供 print 语义，--verbose 不可漏掉。Task DPH-03 必须用当前 VPS 版本确认 session ID 事件字段和 allowlist 工具参数。不得使用 bypassPermissions；dontAsk 配合 TASK 自己的明确工具 allowlist，遇到未允许的工具失败并回报，而不是等待无人值守的交互。

### 8.3 同 provider 换模型与跨 provider

Harness 是一轮一进程的非交互模型，不向活动 CLI stdin 注入 /model。owner 的 !model <allowlisted-name> 和 !effort <level> 只能在该 provider session 没有 running turn 时更新默认值；下一条 turn 通过上述 resume 命令并带 model/effort 执行。

必须在 disposable Git repo 上完成下列真实最小 smoke：

1. 以模型 A 创建 session。
2. 保存 provider session ID。
3. 以模型 B resume 同一 ID。
4. 断言 ID 不变、历史可用、turn 的 requested/configured model 各自可审计。
5. 以非法模型入队，断言 turn 失败但 session/default_model/队列未损坏。
6. Codex 切 Claude 或反向切换时，断言新建 provider_sessions 行、生成 context.md 并标为 provider-switch。

Claude 换模型会重新读取完整历史且失去 cache 命中，调度器应在状态卡中提示这可能带来一次性延迟/成本。

## 9. Discord 协议

### 9.1 必需外部配置

owner 在 Discord Developer Portal 创建/授权 codex-bot，启用 Message Content intent，并注册 guild-scoped Message Commands：

~~~text
在 Codex 中继续
在 Claude 中继续
~~~

bot 在 luxraykit-dev 的最小权限为 View Channel、Send Messages、Read Message History、Create Public Threads、Send Messages in Threads、Manage Threads、Pin Messages、Attach Files。Token 仅进入私有 env。

### 9.2 用户交互

- Message Command 从被选原消息创建 public Thread；数据库 unique source_message_id 处理重复和竞态。
- Thread 命名 S-0042 · Codex · <short-model>；bot 发并实际 pin 一张状态卡。
- owner 在自己的 Harness Thread 发送非控制文本即入队 resume；非 owner、错误 guild/channel、bot author、父频道普通文本都忽略。
- 控制命令仅接受 owner：!status、!model、!effort、!provider、!stop、!approve、!accept、!reject、!resume。参数必须结构化解析，不把 Discord 文本插入 shell。
- 归档的 Thread 收到合法续问时先 unarchive；无法操作时给出父频道 !resume S-#### 的安全 fallback。

状态卡至少显示 provider、requested/configured/reported model、branch、queue position、turn ID、状态、最后错误摘要和可用下一步。2 至 5 秒合并更新，避免 token 级刷屏。大日志只作为经过脱敏的附件；原始 JSONL 不上传。

## 10. PLAN/TASK/review 与 Hermes 接线

Harness 不替代现有工程规则：

- PLAN、TASK、REVIEW 文件仍在当前 session worktree 的 docs/plans、docs/tasks、docs/reviews。
- 每个 TASK 必须含允许修改文件白名单、禁区、接口、DoD 和验证命令。runner 将这些限制作为弱模型 prompt 的固定上下文。
- 弱模型实施用 hermes -z 从 worktree cwd 执行；HTTP API 可以保留给 Hermes 自己的 run/status/stop 控制，但不是写代码执行通道。
- REVIEW 必须在 worktree 实跑 npm test、npm run build 和相关检查；UI 改动仍需 Windows 视觉基线与 owner 真机 preview。
- Draft PR、CI、preview、!accept 每步都以 GitHub/Cloudflare 的当前事实校验。Harness 永不 push main，永不自行 accept。

## 11. 脱敏、审计与失败策略

- 启动时从私有环境读取已知 secret 值，建立 redact set；同时应用常见 token/key/url 正则。
- 原始文件、SQLite、context pack 默认 0600；不得记录 Discord token、provider auth、Git credential、API key 或完整 Hermes env。
- Discord 输出只含已脱敏的 message/tool summary/exit code；模型 hidden reasoning 一律丢弃。
- 每个外部动作写 actor、时间、session/turn、输入消息 ID、unit 名和不可逆动作的前置检查结果。
- 弱模型同一 TASK 最多两次 review 打回；默认第三次转 needs_owner。只有 owner 明确配置后，强模型才可在原白名单和 DoD 内直修，范围外操作必须重新批准。

## 12. 实施任务与总验收

严格按以下顺序执行：

1. [TASK-DPH-00](../tasks/TASK-DPH-00-discord-and-private-config.md)
2. [TASK-DPH-01](../tasks/TASK-DPH-01-harness-state-and-scaffold.md)
3. [TASK-DPH-02](../tasks/TASK-DPH-02-runner-worktree-and-recovery.md)
4. [TASK-DPH-03](../tasks/TASK-DPH-03-provider-adapters-and-model-switching.md)
5. [TASK-DPH-04](../tasks/TASK-DPH-04-discord-thread-ui.md)
6. [TASK-DPH-05](../tasks/TASK-DPH-05-pipeline-and-hermes-integration.md)
7. [TASK-DPH-06](../tasks/TASK-DPH-06-vps-service-and-runbook.md)
8. [TASK-DPH-07](../tasks/TASK-DPH-07-dogfood-and-release-gate.md)

总验收只有在 DPH-07 完成后才算通过：两种 provider 均能在原 Thread 开始、停止、恢复并换模型；两条 Thread 始终单并发；服务重启不重复执行 turn；弱模型永远从独立 worktree 写入；低风险 Draft PR 经 CI 和 preview 到达 owner，但只有 owner 的带 SHA accept 可以合并。
