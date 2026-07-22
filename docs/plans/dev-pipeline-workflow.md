# 开发流水线 Workflow(草案 v0.3 · 2026-07-22)

> 定位:可复用的「强模型规划 + 弱模型落地 + 确定性验证 + 人验收」开发流水线。
> 分两层:**骨架**(跨项目不变)与**项目 profile**(每个项目只换这一节)。
> 本稿已结合 LuxrayKit 实测事实(Hermes 入口、Workers Builds preview、CI 现状)。
> 运行前提:这是 owner 自己的**可信通用 VPS Agent 主机**；强/弱模型区分的是能力与职责,不是安全信任等级。
> 信任模型注记:Hermes、强/弱模型与 Git 凭据由同一 Unix 用户使用是接受的运行前提；弱模型不是不可信或恶意主体。无需为本流水线另加容器、Unix 用户或砍掉 Hermes 的其他 VPS 能力，只用独立 worktree、分支与锁纪律避免开发工作影响 maintenance clone。若未来把 Discord 开给不受信任者，或让外部文本可直接触发执行，再重新评估隔离边界。
> 标注 ⚠️ 的是待项目 owner 拍板的开放决策。

## 0. 角色与信任模型(骨架)

| 角色 | 职责 | 信任边界 |
| --- | --- | --- |
| 人(owner) | 需求、PLAN 审批、验收放行、合并 | 唯一合并**决策者**;VPS 凭据按 owner 的 `!accept` 执行技术合并 |
| 强模型(Claude Code / Codex CLI,headless) | 维护文档、spike、写 PLAN、拆 TASK、review | 产出必须过确定性防线或人工其一 |
| 弱模型(Hermes agent + DeepSeek v4 flash) | 按 TASK 填空式落地代码 | 同属可信 VPS Agent,但永不做最终验证判断;打回上限 2 轮 |
| 确定性 CI(GitHub Actions) | 最终确定性合并门禁(测试/构建/冒烟) | 结果不可被模型覆写;本地通过不替代 CI |
| 纯 cron | 确定性机械维护活(数据刷新) | 只走白名单分支 + auto-merge |

铁律:自动合并只给「白名单分支 + 纯生成数据 + 绿 CI」;其余 PR 一律由 owner 决策合并;
`main` 无保护 ⇒ 合并即上线 ⇒ 一切防线必须落在合并之前。`!accept <PR#> <head-SHA>`
只接受 owner 指令;dispatcher 必须确认当前 PR head 仍等于被验收 SHA,并以
`gh pr merge --match-head-commit` 防止批准后分支移动。

`!accept` 是流程中的**唯一合并决策**与审计记录，不是 GitHub 平台级的写权限隔离。本仓库在当前私有仓库/套餐约束下无法保护 `main`；能接触 VPS GitHub 凭据的进程技术上仍可直接 push，这属于 owner 接受的可信主机前提，而非 P0 blocker。`--match-head-commit` 只防止批准后分支意外移动，不声称能约束已有凭据的主体。

## 0.1 2026-07-22 已拍板决策快照（跨设备续接入口）

本节是本轮讨论的自包含交接记录；换设备或新开 Codex 会话时，先读本节、§2.1、§3.1、§6，以及关联的 [Harness spike](dev-pipeline-harness-spike.md)。

| 主题 | 已拍板结论 | 下一步/边界 |
| --- | --- | --- |
| VPS 信任模型 | 这是 owner 的可信通用 Agent 主机；Hermes、Codex、Claude、Git 凭据可同一 `ubuntu` 用户使用。强/弱模型是职责与能力差异，不是把弱模型视为敌手。 | 不加容器/新 Unix 用户/权限墙；用独立 worktree、分支和 `flock` 避免开发工作影响 maintenance clone。若将来接纳不受信任 Discord 输入或外部文本直驱执行，再重新做隔离设计。 |
| Hermes 事实 | VPS 当前是 0.18.0；上游已发布 v0.19.0（`v2026.7.20`，2026-07-20）。HTTP API 已仅监听本机并受 key 保护。 | 升级 0.19.0 是可选 Phase 0 项，不阻塞本流程。 |
| preview / KV | 非 `main` 构建部署到独立影子 Worker `luxraykit-app-preview`，生产域名仍只走 `main` 的 `luxraykit-app`；push 本身不会跑 Worker handler 或写 KV。owner 访问 per-version URL 时才会运行 preview 代码。 | preview 与生产共享 KV 不再是 P0；保持为 P2 review 约束：新增直接 KV 写入、改变 preview binding/入口或新增可写路径时必须显式记录可达性并由 owner 决定。 |
| 合并权 | owner 是唯一**合并决策者**；`!accept <PR#> <head-SHA>` 记录决定，`--match-head-commit` 防止批准后 PR head 漂移。 | 这不是对已有 VPS GitHub 凭据的技术封锁；`main` 当前无保护是已接受的运行前提。 |
| 验证与恢复 | review 在 VPS 实跑 test/build，CI 对最终 SHA 重跑，UI 再做 Win32 视觉回归与 preview 真机验收；Markdown 管人类产物，JSON/SQLite 管状态。 | cron、插件、人工任务共用 per-clone `pipeline-run` + `flock`；记录 PID、开始/截止时间和恢复命令，崩溃后先核验再 resume。 |
| Discord 强模型入口 | Hermes 普通聊天不变。人从原需求/Hermes 回复的 Apps 菜单选择 `在 Codex 中继续` / `在 Claude 中继续`；专用 `codex-bot + dev-pipeline-harness` 从原消息建 public Thread。 | 每 Thread 对应一个持久 provider session + worktree；一个 bot 身份可承载 Codex/Claude，provider/model 为 session 私有状态，不影响 Hermes 当前模型。 |
| 可视/恢复/并发 | Thread 标题展示短 provider/model，bot 发出并实际置顶可编辑状态卡；Thread 内下一条 owner 消息即可排队 resume。 | 全局只允许一个实际执行的 CLI turn，但可保留多个可见、停驻、可切换、可恢复的 session。 |
| 立即执行项 | Harness 的完整实现规格与 Task 0–6 在 `dev-pipeline-harness-spike.md`。 | owner 回到可登录 Discord Developer Portal 的设备后，由 agent 创建/配置 `codex-bot`、Message Commands、Thread/Pin 权限与 Message Content intent，再在 VPS 做 Task 1 起的实现与 dogfood。 |

## 1. 四层防线(骨架)

- **L1** 契约/单测(vitest)
- **L2** 构建 + 全量类型(`tsc -b`)
- **L3** 端到端冒烟(Playwright 真实渲染断言)
- **L4** preview 部署上的人工验收(机器不可替的判断)

L1–L3 是**两层验证**而非二选一:强模型 review 可在 VPS 先跑同一批命令、尽早失败；最终证据仍来自 CI 对 push 后 `head-SHA` 的重跑，本地绿灯不替代 CI。
L4 由自动化负责「把待判断的东西端到人面前」(preview URL 发进 Discord)。

## 2. 一次完整循环(骨架)

1. 人照常在 `luxraykit-dev` 与 Hermes 自由聊天。需要把某条需求/回复升格为可视、可恢复的强模型 session 时，长按/右键该消息 → Discord **Apps** → `在 Codex 中继续` / `在 Claude 中继续`；`codex-bot` 直接从该原消息创建 public Thread，强模型 spike + 写 `docs/plans/PLAN-<id>.md`，摘要留在 Thread（见 §3.1）
2. 人 `!approve <PLAN-id>` / 提修改意见
3. 强模型拆 `docs/tasks/TASK-<id>-<n>.md`:目标、**允许改动文件白名单**、接口签名、禁区、DoD(验证命令)
4. TASK 逐个经 Hermes HTTP API(`POST /v1/runs`)交给弱模型落地,commit 到分支
5. 强模型 `/review`:实际跑 `npm test`、`npm run build` 及改动相关的 Worker/PWA 命令 + 读 diff → 通过则下一个;不通过写 `docs/reviews/REVIEW-<id>.md` 打回(≤2 轮,超限升级为强模型直修或 ping 人)
6. 全部通过 → push 功能分支并开 Draft PR → CI 对该 `head-SHA` 绿、CF 构建出 preview URL → bot 发 Discord → 人手机实测 → `!accept <PR#> <head-SHA>` 合并(=生产部署)/ `!reject <反馈>` 打回

## 2.1 运行状态与崩溃恢复(骨架)

- PLAN/TASK/REVIEW Markdown 仍是给人读的权威产物;dispatcher 另在
  `~/.hermes/state/dev-pipeline/<repo>/<pipeline-id>.json` 维护机器状态:
  `planPath`/`planHash`、`baseSha`、`branch`、`currentTask`、`reviewRound`、`headSha`、
  CI 状态、preview URL、`acceptedBy`/`acceptedHeadSha`、`runnerPid`、`startedAt`、`deadlineAt`、
  `recoveryCommand`、状态与时间戳。
- 状态只沿 `draft → plan_approved → task_running → pr_open → ci_passed → preview_ready → accepted → merged`
  前进;`rejected`、`failed`、`cancelled` 为终态。head SHA 变化会使 preview/accept 失效,退回 `pr_open`。
- 参与本流水线的 cron、Hermes 插件和人工启动任务一律经同一个 `pipeline-run` 包装器取得**对应 clone** 的 `flock`；锁只保护该 worktree 的写入与状态转换，不锁 Hermes 的其他通用工作或 maintenance cron。
  启动时若发现 state 仍为运行中但锁已释放，先核对 PID/进程组、worktree 与 Git 状态，标记 `interrupted`、保留明确的 `recoveryCommand` 并通知 owner，不盲目续跑。

## 3. 机器间通信:走 API,不走 Discord(已查证,2026-07-22)

Hermes(NousResearch [hermes-agent](https://github.com/NousResearch/hermes-agent),MIT)自带程序化入口,**dispatcher 直连 API 是正路,Discord 只留给人**:

- `hermes -z "<prompt>"`:纯净单次调用,stdout 只有最终回复,天然适合脚本
- HTTP API server(`API_SERVER_ENABLED=1` + `API_SERVER_KEY`,默认端口 8642):
  `POST /v1/runs`(202 返回 run_id)→ `GET /v1/runs/{id}/events`(SSE 生命周期流)→
  `POST /v1/runs/{id}/approval`(审批钩子)/ `POST /v1/runs/{id}/stop`(中断)
- `hermes webhook subscribe`:事件驱动激活(HMAC 签名、事件过滤、`--deliver discord` 直投频道)
- `hermes cron`:定时任务(可顺带承载策展 runbook 的月度巡检触发)

Discord 侧事实:bot/webhook 消息默认被忽略(`DISCORD_ALLOW_BOTS=none`);
可选 `mentions`(需显式 @)/ `all`;另有 `DISCORD_BOTS_REQUIRE_INLINE_MENTION`
防 bot 互刷。**因此不需要也不应该用 webhook 冒充人类消息驱动 Hermes。**

VPS 实机核实(2026-07-22,ubuntu@35.74.208.112):hermes-agent 当前为 **0.18.0**(2026-07-03
安装)；上游已发布 **Hermes Agent v0.19.0 (`v2026.7.20`，Release Date: 2026-07-20)**，经 **user systemd** 常驻(gateway 进程由 `systemd --user` 拉起);
`DISCORD_ALLOW_BOTS` 等 4 个开关均未设(即默认 none);**API server 已启用**并只监听
`127.0.0.1:8642`,未带凭据的 `/v1/capabilities` 与 `/v1/models` 均返回 401。dispatcher 同机直连即可,勿开公网。

强模型 headless 凭据:`claude -p` 用 `CLAUDE_CODE_OAUTH_TOKEN`(setup-token 已生成,一年期);
Codex 拷 `~/.codex/auth.json`。二者与 `ANTHROPIC_API_KEY` 不可同设。这些凭据保留在可信通用 VPS
Agent 主机上,但绝不写入 repo、PLAN/TASK/REVIEW、日志或 Discord 输出。

## 3.1 人 ↔ 强模型：Hermes 自由聊天 + `codex-bot` 按需升格(2026-07-22 拍板)

Hermes 的普通聊天**保持原样**：人直接发自然语言，当前 Hermes 所选模型照常回复；既不要求
command，也不会被 `codex-bot` 截获。Hermes 原生 plugin 的 `register_command` 仍在 gateway 调 LLM
之前分发，已有 `~/.hermes/plugins/codex-relay/`(`/cx`)可保留作一次性/兼容入口；其同步
`subprocess.run` 不适合作为多 session 的实时 UI 宿主。

**拍板：强模型长会话改由专用 `codex-bot + dev-pipeline-harness` 承担；Hermes 继续承担普通聊天、
弱模型 TASK 下发、cron 和项目通知。** 这不是隔离强/弱模型，而是把一个 Discord Thread、一份 CLI
session、一个 worktree 的生命周期绑定起来。

默认 UX 是显式“升格”，而非意图猜测：

1. 人长按/右键自己的需求消息或 Hermes 的关键回复，在 **Apps** 菜单点原生 Message Command
   `在 Codex 中继续` 或 `在 Claude 中继续`；不需要输入 `/session new …`。
2. `codex-bot` 收到被选消息的 interaction，直接从该**原消息**创建 public Thread；同一源消息只能有
   一个 Thread，重复操作只打开既有 session。`/c <prompt>`、`/a <prompt>` 可作为新建空 session 的
   短 slash 备用入口。
3. Thread 名称持续展示短身份（如 `S-0042 · Codex · GPT-5.6`）；bot 在 Thread 内发出并实际置顶一张
   可编辑状态卡，完整列出 provider、requested/effective model、分支、队列和控制按钮。Discord 没有供
   bot 写入任意“悬浮顶栏”的 API，因此状态卡不是 Agent 的第一句话，也不冒充永久 sticky UI。
4. Harness 的 `provider=codex|claude` 与 `requestedModel`/`effectiveModel` 是**本 session 私有状态**；
   它只决定启动哪个 CLI，绝不调用或改写 Hermes 的当前模型。Hermes 当前模型只影响普通聊天，以及
   后续 `POST /v1/runs` 的弱模型执行。
5. 用户在该 Thread 内继续发文字即排队 resume；普通父频道中的 Hermes 对话仍保持普通 Hermes 对话。
   因此“所有 session 可见、可恢复”不等于把人强迫关进 command 或 Thread。

需求下行链路变为：人 ↔ Hermes 普通聊天 →（人显式升格一条消息）→ `codex-bot` 强模型 session
→（PLAN/TASK）→ Hermes HTTP API → 弱模型。**弱模型只负责执行落地，永不经手/转述需求文本。**

## 3.5 通知约定(项目 profile 的一部分)

每个项目一个专属 Discord 频道,Hermes/dispatcher/`codex-bot` 关于该项目的**一切**外发消息
(TASK 完成情况、review 结果转发、preview URL、CI 状态、审批请求)都发到该频道,
不混入 Hermes 的通用频道。LuxrayKit:**`luxraykit-dev`,频道 ID `1529159963526693025`**
(VPS 上已记录为 `~/.hermes/.env` 的 `LUXRAYKIT_DISCORD_CHANNEL=discord:1529159963526693025`,
2026-07-22 `hermes send` 冒烟已通)。发送方式:
`hermes send --to "$LUXRAYKIT_DISCORD_CHANNEL" --subject "[tag]" "…"`(无需 gateway,直连 REST)。

## 4. 2c2g 资源纪律(骨架,VPS 通用)

- 加 2–4G swap;开发流水线与 maintenance clone 各自串行写入,避免耗尽内存或互相污染
- build/test **优先**由 CI 跑在 GitHub Actions,preview 构建跑在 Cloudflare 侧;但强模型 review 可在 VPS 先跑
  `npm test`/`npm run build` 等确定性命令,把失败挡在 push 之前。CI 对最终 head SHA 重跑,才是合并门禁
- review 只喂 diff + 相关文件;lint/test 由脚本跑、结果文本喂给模型

## 5. 项目 profile:LuxrayKit(UI/UX 重的纯前端 PWA)

每个新项目开工时回答三问,写进该项目 AGENTS.md;骨架照搬,只换这节。

1. **最容易坏而测试最难写的是什么?** → UI/UX(视觉、交互、移动端体验)
   - CI 渲染冒烟:`offline.spec.ts` + `team-samples.spec.ts`(已有)
   - 本机 win32 视觉回归 17 态:UI 改动 merge 前手动跑(已有,基线平台锁定,严禁 CI 重生成)
   - **preview URL 真机验收**:手机点开 workers.dev 链接实测(本次打通,见 §6)
   - UI TASK 的 DoD:强模型先跑 `npm test` + `npm run build`;CI 绿后再完成 Win32 视觉回归与真机验收
2. **什么改动可以自动合并?** → 仅 `automation/pokedb-environment-refresh`、`automation/vgcpastes-team-refresh` 两个白名单分支的纯生成 JSON
3. **人只想亲眼看什么?** → PLAN 摘要、preview URL、样本数/audit 摘要

对照示例(换项目时):后端 API 项目 → L3 换 API 契约测试 + staging smoke;CLI 工具 → L3 换跨平台矩阵构建。

## 6. Preview 部署事实(2026-07-22 实测)

- ✅ **已落地(2026-07-22 端到端验收 + Wrangler 控制面复核)**:push 非 main 分支 → 影子 Worker
  `luxraykit-app-preview` 自己的 Builds 触发器(非 main,`npm ci && npm run build` →
  `versions upload --config …wrangler.preview.jsonc`)→ ~70 秒出 per-version preview URL
  (`<版本前8位>-luxraykit-app-preview.ffkiyo7.workers.dev`,手机可点)。最新 preview version 的
  `has_preview=true`;从 VPS 请求其 `/health` 已返回 200。生产站点流量仍只走 `main` 所连的
  `luxraykit-app`,但 owner 的真机验收会显式访问这个 preview URL。**非 main 的 push 本身只构建/上传 preview 版本，不会执行 Worker 请求处理器、更不会仅因 push 写入生产 KV；** 只有有人访问该 preview URL（或未来接入其他事件源）并命中可写代码路径时，才可能执行 KV 操作。
- 踩过的三个坑(细节见 guide §9):带 DO 的 Worker 不生成 preview URL;Workers Builds
  把部署钉死在所连 Worker(preview 触发器必须建在影子 Worker 名下);wrangler 需显式
  `preview_urls: true`
- ⚠️ 绕法 B(长期干净,可作流水线 dogfood PLAN):把 DO + cron 拆成独立 refresher
  Worker,luxraykit-app 无 DO 后原生获得 preview URL,即可裁撤影子 Worker
- 纪律(已在 AGENTS.md):preview 与生产共享同一 KV;Wrangler 实测 preview 没有
  `ADMIN_REFRESH_TOKEN`、`ENVIRONMENT_REFRESHER` DO binding 或 cron,所以**现有刷新路径**无法写入
  (刷新请求会 401)。这不是 Cloudflare 的只读权限:任何新增 `ENVIRONMENT_CACHE.put/delete` 或
  `wrangler.preview.jsonc` 改动都必须在强模型 review 中单列检查;preview 仅供可信 owner 验收
- **风险等级修订(2026-07-22)**:在 owner 明确这是可信通用 VPS Agent 主机、且上述现有 binding
  实测成立的前提下，“preview 与生产共享 KV”**不是 P0 架构阻断项**，降为 **P2 代码审阅约束**。
  它不阻止普通 UI/只读 API 任务或 owner 访问 preview URL；一旦 diff 新增直接
  `ENVIRONMENT_CACHE.put/delete`、改变 `wrangler.preview.jsonc` 的 binding/入口，或让 preview
  获得能写入该 namespace 的新路径，强模型必须在 REVIEW 中显式标为 P2、说明可达性并由 owner 决定
  是否继续。这个等级不声称 KV 有平台级只读隔离。
- 待接线:build 成功后把 preview URL 发 `luxraykit-dev` 频道(Phase 2 的 dispatcher 职责;
  Workers Builds 对 PR 也会自动贴 preview 评论,开 PR 的分支无需额外接线)

## 7. 分阶段落地

- **Phase 0(半天;✅ = 2026-07-22 实机已确认就位)**:
  ✅ swap 2G 已加(1.9G RAM,负载正常) · ✅ Node v24.18.0(与 CI 一致) · ✅ 双 clone
  (`~/LuxrayKit` 策展 / `~/LuxrayKit-maintenance` cron,两个刷新 cron 在跑) ·
  ✅ tmux/screen 可用 · ✅ Hermes API server 已开(`127.0.0.1:8642`,受 `API_SERVER_KEY` 保护) · ⬜ 装 Claude Code CLI + 设
  `CLAUDE_CODE_OAUTH_TOKEN`(token 已生成) · ⬜(可选)hermes 升级 0.18.0→0.19.0 ·
  ⬜ docs/{plans,tasks,reviews,discussions} 约定就位 · ⬜ pipeline state.json + clone 级 `flock` 就位 · ⬜ 注册 `codex-bot`、配置 Message Commands/Thread 权限/Message Content intent · ⬜ SSH 手动跑
  一轮完整循环,找卡点
- **Phase 1**:`codex-bot + dev-pipeline-harness`（`docs/plans/dev-pipeline-harness-spike.md` Task 0–6）——Message Command 从原消息建 Thread、SQLite session/队列、Codex/Claude adapter、单并发恢复、TASK 下发走 Hermes HTTP API。现有 codex-relay 若继续承载长任务，另行 async 化；它不是新 session UI 的宿主
- **Phase 2**:preview URL 自动发频道、Thread 中的 `/status`/resume/审批操作、真实 dogfood；(可选)绕法 B 重构

## 8. 开放决策(⚠️ 待拍板)

1. preview 走绕法 A 先用、B 排期重构?还是直接 B?
2. ~~dispatcher 宿主~~ ✅ 2026-07-22 拍板:Hermes 保留自由聊天/弱模型 dispatcher；专用 `codex-bot + harness` 用 Message Command 创建强模型 session Thread（详见 §3.1）
3. 打回 2 轮超限后的升级路径:强模型直修 or 必须 ping 人?
4. 本文档定稿后落到哪:仓库 `docs/`(项目实例)+ 你自己的模板库(骨架部分)?
