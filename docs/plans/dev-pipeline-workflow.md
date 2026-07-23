# 开发流水线 Workflow（定稿 v0.4 · 2026-07-23）

> 定位：可复用的「强模型规划 + 受控执行 + 确定性验证 + owner 验收」流水线。本文件定义流程和
> LuxrayKit project profile；Harness 的代码级契约见
> [dev-pipeline-harness-spike.md](dev-pipeline-harness-spike.md)，可逐项执行的工作包见
> [docs/tasks/](../tasks/)。
>
> 状态：**DPH-01 至 DPH-06 已落地并验证；DPH-00/04 的 Discord 客户端目视验收和 DPH-07 owner dogfood 仍待执行。**

## 0. 已定边界

| 主题 | 定稿结论 |
| --- | --- |
| 源码归属 | v1 不新建 dev-pipeline-harness 私库。Harness 放在 LuxrayKit 的 tools/dev-pipeline-harness，systemd/runbook 放在 ops/；Python 代码不会进入 Node/Workers Builds。 |
| 运行目录 | 运行状态、venv、日志和工作树都在仓库外：~/.local/share/dev-pipeline-harness、~/.config/dev-pipeline-harness、~/LuxrayKit-dev-worktrees。现有 ~/LuxrayKit 与 ~/LuxrayKit-maintenance 永不作为模型写入目标。 |
| 信任模型 | 这是 owner 的可信 VPS；Hermes、Codex、Claude 和 GitHub 凭据可同一 Unix 用户运行。隔离目标是 worktree、可恢复性和审计，不是把弱模型当恶意主体。 |
| 强模型 UI | 新建一个 codex-bot。owner 从 Discord 原消息的 Apps 菜单选择“在 Codex 中继续”或“在 Claude 中继续”，得到一个原生 public Thread。普通 Hermes 聊天不改变。 |
| 并发 | 同时最多一个实际 CLI turn；可停驻、排队和恢复多个 Thread/session。全局 runner lock 与每个 worktree lock 均由实际 turn 持有。 |
| 合并权 | owner 是唯一合并决策者。!accept PR# full-head-SHA 必须核对最新 head、CI 和 preview，再用 gh 的 match-head-commit 合并。main 无保护，合并即生产上线。 |
| 模型切换 | 同一 provider session 可在后续 turn 改模型；Codex 与 Claude 的 session ID 不能跨 provider 恢复。跨 provider 必须新建 provider session 并注入 context pack。 |

## 1. 角色与不可绕过的防线

| 角色 | 责任 | 不可做的事 |
| --- | --- | --- |
| owner | 提需求、批准 PLAN、真机验收、批准合并 | 不把合并权交给 bot 或模型。 |
| 强模型（Codex / Claude） | spike、PLAN、TASK、review、限定范围内修复 | 不绕过 TASK 白名单、CI、preview 或 owner 验收。 |
| Hermes 弱模型 | 按 TASK 的允许文件和 DoD 执行实现 | 不决定 review 结论、PR 合并或生产操作。 |
| Harness | Discord session、队列、worktree、转录、恢复和命令门禁 | 不替模型作工程判断，不直接推 main，不替 owner 批准。 |
| CI / Workers Builds | 最终确定性验证 / 部署 | CI 不是部署通道；只有 main push 经 Workers Builds 上线。 |

铁律：

- 自动合并仅限两个既有白名单的纯生成数据分支；其余 PR 一律人工合并。
- 每个功能 PR 默认 Draft，直到 owner 明确要求 ready。
- 强模型在 VPS 的 npm test / npm run build 只是前置反馈；最终证据是 CI 对待合并 head SHA 的重跑。
- 模型、Hermes、Discord 的任何原始输出都不能携带到 Discord 的 secret 或隐藏 reasoning。

## 2. 一次完整循环

1. owner 照常在 luxraykit-dev 与 Hermes 交流；需要升级某条需求或 Hermes 回复时，使用 Discord
   Message Command 建立 Codex 或 Claude Thread。
2. Harness 创建 S-####、从 origin/main 建立独立 worktree 和 pipeline/S-#### 分支，写入 SQLite，
   再把首个强模型 turn 入队。重复选择同一源消息必须回到既有 Thread。
3. 强模型在该 worktree 写 PLAN；owner 用 !approve <PLAN-id> 批准或给修改意见。
4. 强模型把工作拆为 docs/tasks/TASK-<id>-<n>.md：目标、允许改动文件、禁区、接口、DoD 和验证命令。
5. Harness 在目标 worktree 的 cwd 中用受控 runner 执行弱模型的 hermes -z。不得把需要写代码的任务
   直接投给 Hermes HTTP API：当前 API 请求没有 cwd/worktree 字段，提示词中的 cd 不是可靠隔离。
6. 强模型 review 在相同 worktree 实跑相应测试、读取 diff，并将结论写入 REVIEW。失败至多打回两轮；
   默认第二轮后状态为 needs_owner，不自动扩展范围直修。
7. 通过后 push 功能分支并开 Draft PR。CI 对该 head SHA 通过，影子 Worker preview 可访问后，bot 将
   preview URL 和验收摘要发入 Thread。
8. owner 在 Win32 视觉回归和真机 preview 验收后发送 !accept <PR#> <full-head-SHA>；Harness 再取
   远端事实核对并合并。!reject <反馈> 只会把工作放回 review/task 队列。

## 3. 事实来源、状态和恢复

Markdown 与 SQLite 分工不能混淆：

| 信息 | 权威来源 |
| --- | --- |
| PLAN、TASK、REVIEW、用户可读决策 | 仓库内 Markdown。 |
| Discord Thread、provider session ID、队列、turn、锁、unit、事件游标和恢复状态 | ~/.local/share/dev-pipeline-harness/harness.sqlite3。 |
| 原始 provider JSONL | 私有 state 目录内的 0600 文件；不入仓库。 |
| 发往 Discord 的日志 | 经过脱敏的副本；仍不作为机器状态来源。 |

Harness session 的主状态为：

~~~text
draft -> queued -> running -> waiting_for_owner
                         -> failed | interrupted | cancelled
waiting_for_owner -> plan_approved -> task_running -> review_pending
review_pending -> pr_open -> ci_passed -> preview_ready -> accepted -> merged
~~~

每个实际 CLI turn 是一个 systemd --user transient unit，而不是由 bot 进程直接持有一根无法重连的
stdout pipe。runner 将事件和最终结果写入私有文件，并以短 SQLite 事务落盘。Harness 重启时：

1. 查询记录的 unit 是否仍 active；
2. 若 active，重新读其增量转录并恢复 Discord 状态，不重复启动；
3. 若 unit 已结束，导入 terminal result；
4. 若 unit 和 terminal result 都不存在，标为 interrupted，显示明确的 resume/retry 操作。

这保证“服务重启后可恢复”不是对任意子进程内存状态的虚假承诺。

## 4. Provider、模型和 worktree 规则

- Codex 交互式 session 可用 /model；Harness 的无交互恢复使用 codex exec resume 加 -m。
  当前 VPS Codex 0.144.6 的 resume help 已确认该参数。
- Claude 可用 /model；Harness 使用 claude -p --resume 加 --model。当前 VPS Claude Code 2.1.216
  已确认这两个参数，且 Claude 文档说明 --model 会覆盖恢复时的模型选择。
- 两个 provider 的 reasoning effort 也必须显式 snapshot：Codex 通过
  `model_reasoning_effort` 配置覆盖，Claude 通过 `--effort`；owner 使用 `!effort <level>`
  在 session 空闲时修改下一条 turn 的默认值。各 provider 只开放其 CLI 支持的全部强度。
- 仅允许配置 allowlist 中的模型。改变模型只在 session 空闲时生效，已排队 turn 固定其 enqueue 时的
  model snapshot；无效模型不得覆盖默认值或损坏 session。
- 数据库存 requested_model、configured_model、reported_model。reported_model 只有在 provider 明确事件
  报告时才填写，状态卡不能把“请求值”伪称为实际值。
- 每个 Claude session 必须从原 project/worktree 启动 resume；所有 provider subprocess 均使用
  exec 形式和 cwd=<session worktree>，不得拼 shell 字符串或依赖 SSH PATH。
- provider 切换创建同一 S-#### 下新的 provider_sessions 行，向新 CLI 输入 context.md。不得把
  Codex ID 传给 Claude 或反过来，并在 Discord 标为 provider-switch。

## 5. LuxrayKit project profile

本项目的四层验证是：

1. L1：Vitest 契约、单元和组件测试。
2. L2：npm run build（包含 TypeScript 全量检查）。
3. L3：CI 的离线 PWA 与队伍库渲染冒烟，以及改动需要的 Worker 检查。
4. L4：Windows 的既有视觉基线与 owner 对 preview URL 的真机验收。

主分支只经 Cloudflare Workers Builds 部署。非 main 分支构建到影子 Worker
luxraykit-app-preview；它与生产共享 KV，所以所有 preview 代码按生产 KV 对待。现有 preview 缺少
cron、DO 和 admin secret，普通 UI/只读 API 任务可用；任何新增 KV 写路径、binding 或
wrangler.preview.jsonc 改动必须在 REVIEW 中列为 P2，并等待 owner 决定。

## 6. 实施顺序

| 顺序 | 工作包 | 结束条件 |
| --- | --- | --- |
| DPH-00 | Discord 与私有配置前置 | bot、权限、allowlist 和私有 env 已就绪，未提交 secret。 |
| DPH-01 | Python scaffold 与 SQLite | schema、迁移、队列、source-message 去重和测试完成。 |
| DPH-02 | worktree、transient runner、恢复 | 假 provider 可证明单并发、重启重建状态和受控中断。 |
| DPH-03 | Codex / Claude adapter 与模型/强度切换 | 两种 provider 的真实最小 start/resume/model-switch/effort smoke 通过。 |
| DPH-04 | Discord interaction/UI | Message Command、Thread、真实置顶状态卡、owner-only 输入和日志脱敏完成。 |
| DPH-05 | PLAN/TASK/review 与 Hermes 接线 | cwd 安全的弱模型 runner、审批/PR/CI 门禁完成。 |
| DPH-06 | VPS service 与 runbook | doctor、wrapper、venv、systemd 和 restart 演练完成。 |
| DPH-07 | 低风险 dogfood | 文档类 Draft PR 完成完整循环；只能由 owner accept。 |

每一项的文件白名单、依赖、验收和禁止事项在对应 TASK-DPH 文档中。不得并行跳过依赖，也不得在
DPH-07 前把 Harness 当作正式合并通道。

### 当前落地状态（2026-07-23）

- DPH-00 的 Discord API、guild commands、频道权限和 VPS 私有 env 已验证；客户端 Apps 菜单仍由 owner 在桌面/手机目视确认。
- DPH-01、DPH-02、DPH-05 的实现和自动化/fake/mock 验收已完成；本地与 VPS Harness 测试均通过。
- DPH-03 的 disposable repo 真实 smoke 已完成：Codex 双模型 start/resume、Claude start/resume 与 effort 切换、以及 Codex → Claude 的 context pack/provider switch 均通过。Claude 当前可用且唯一 allowlist 模型为 `claude-sonnet-5`，不伪造第二个 Claude 模型的换模结果。
- DPH-04 已接通 Thread、状态卡、置顶、owner gate 和脱敏输出；真实 Discord Thread/UI 操作留待 owner。
- DPH-06 已部署到 VPS r4；doctor、user service、Gateway 与 fake-turn 恢复演练均通过。active transient unit 在 service 冷启动后保持单实例，停止后由 reconcile 标为 `interrupted`。
- 本轮证据：VPS source 测试为 40/40，源码 `compileall` 与 Git whitespace 检查通过；VPS doctor 通过且 user service 保持 active。真实 provider smoke 已完成；尚未启动 Discord 客户端验收或 DPH-07 dogfood。

## 7. 尚需 owner 决定的事项

- 第二次弱模型打回后的默认安全行为是 needs_owner。若希望允许强模型在原 TASK 白名单内直修，需要
  owner 明确开启；任何扩展范围、改生产配置或改变验收标准仍必须停下询问。
- 影子 preview Worker 继续作为 v1 验收路线；把 DO/cron 拆为独立 refresher Worker 的“绕法 B”
  不在 Harness 实施范围内。
