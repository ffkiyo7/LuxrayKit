# 开发流水线 Workflow(草案 v0.1 · 2026-07-22)

> 定位:可复用的「强模型规划 + 弱模型落地 + 确定性验证 + 人验收」开发流水线。
> 分两层:**骨架**(跨项目不变)与**项目 profile**(每个项目只换这一节)。
> 本稿已结合 LuxrayKit 实测事实(Hermes 入口、Workers Builds preview、CI 现状)。
> 标注 ⚠️ 的是待项目 owner 拍板的开放决策。

## 0. 角色与信任模型(骨架)

| 角色 | 职责 | 信任边界 |
| --- | --- | --- |
| 人(owner) | 需求、PLAN 审批、验收放行、合并 | 唯一有合并权的主体 |
| 强模型(Claude Code / Codex CLI,headless) | 维护文档、spike、写 PLAN、拆 TASK、review | 产出必须过确定性防线或人工其一 |
| 弱模型(Hermes agent + DeepSeek v4 flash) | 按 TASK 填空式落地代码 | 永不做验证判断;打回上限 2 轮 |
| 确定性 CI(GitHub Actions) | 唯一验证权威(测试/构建/冒烟) | 结果不可被模型覆写 |
| 纯 cron | 零判断机械活(数据刷新) | 只走白名单分支 + auto-merge |

铁律:自动合并只给「白名单分支 + 纯生成数据 + 绿 CI」;其余 PR 一律人工合并;
`main` 无保护 ⇒ 合并即上线 ⇒ 一切防线必须落在合并之前。

## 1. 四层防线(骨架)

- **L1** 契约/单测(vitest)
- **L2** 构建 + 全量类型(`tsc -b`)
- **L3** 端到端冒烟(Playwright 真实渲染断言)
- **L4** preview 部署上的人工验收(机器不可替的判断)

L1–L3 确定性、跑在 CI;L4 由自动化负责「把待判断的东西端到人面前」(preview URL 发进 Discord)。

## 2. 一次完整循环(骨架)

1. 人在 Discord 用 `/cc` 直连强模型讨论需求(原文直达,弱模型零参与,见 §3.1)→ 强模型 spike + 写 `docs/plans/PLAN-<id>.md`,摘要回频道
2. 人 `!approve` / 提修改意见
3. 强模型拆 `docs/tasks/TASK-<id>-<n>.md`:目标、**允许改动文件白名单**、接口签名、禁区、DoD(验证命令)
4. TASK 逐个经 Hermes HTTP API(`POST /v1/runs`)交给弱模型落地,commit 到分支
5. 强模型 `/review`:实际跑 build/test + 读 diff → 通过则下一个;不通过写 `docs/reviews/REVIEW-<id>.md` 打回(≤2 轮,超限升级为强模型直修或 ping 人)
6. 全部通过 → push 分支 → CF 自动构建出 preview URL → bot 发 Discord → 人手机实测 → `!accept` 合并(=生产部署)/ `!reject <反馈>` 打回

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

VPS 实机核实(2026-07-22,ubuntu@35.74.208.112):hermes-agent **0.18.0**(2026-07-03
安装,上游已到 0.19.0),经 **user systemd** 常驻(gateway 进程由 `systemd --user` 拉起);
`DISCORD_ALLOW_BOTS` 等 4 个开关均未设(即默认 none);**API server 未启用**(8642 未监听、
config 无 api_server 键)——启用时注意只绑 localhost,dispatcher 同机直连即可,勿开公网。

强模型 headless 凭据:`claude -p` 用 `CLAUDE_CODE_OAUTH_TOKEN`(setup-token 已生成,一年期);
Codex 拷 `~/.codex/auth.json`。二者与 `ANTHROPIC_API_KEY` 不可同设。

## 3.1 人 ↔ 强模型直连通道:Hermes 插件槽(2026-07-22 拍板)

事实(VPS 实测):Hermes 原生 plugin 机制(`register_command`)注册的 slash command,
gateway 在**调 LLM 之前**分发并直接返回(run.py ~L9722)——插件命令路径**弱模型零参与**。
已有样板 `~/.hermes/plugins/codex-relay/`(`/cx`,2026-07-18 验证可用):prompt 原文落盘 →
stdin 喂 `codex exec` → 结果字节级原样返回,双向 SHA256 审计,全局锁单并发,
repo/model/超时/命令名可配;插件在 hermes-agent 仓库外,升级不受影响。

**拍板:dispatcher = Hermes 插件族,不做独立进程 / 独立 bot**(§8 决策②关闭)。
需求下行链路:人 → `/cc`(claude-relay)或 `/cx`(codex-relay)→ 强模型 →(拆 TASK)→
Hermes HTTP API → 弱模型。**弱模型只负责执行落地,永不经手/转述需求文本。**

`/cc`(claude-relay,待建,克隆 codex-relay)设计要点:

1. **先修再克隆**:codex-relay 的 handler 是同步 `subprocess.run`,而 `_handle_message`
   被直接 await——长任务会冻住整个 gateway 事件循环(所有频道、clarify 按钮全停)。
   分发处本就支持协程返回,改 async + `asyncio.create_subprocess_exec` 即解。
2. **会话:单并发、长活、可备份**。讨论无并发需求,全局锁保留;默认
   `claude -p --resume <session_id>` 续"当前会话",`/cc new <prompt>` 开新会话,
   session_id 存插件状态文件。**备份机制**:每轮讨论把记录导出/追加到指定路径的 md
   文档(路径做成插件 config,如 `docs/discussions/`,可换)——session 过期或换新时,
   新 session 首条 prompt 读该文档接续上下文,同本轮人机协作保存对话记录的做法。
   resume 原料已实测:`claude -p --resume / -c`(2.1.216)、`codex exec resume [ID] / --last`(0.144.6)。
3. **通道是自由的,不绑定需求讨论**:闲聊、临时任务、随手让强模型处理点东西都允许。
   只有当对话产出真实开发需求时才切入 workflow(写 PLAN → 审批 → 拆 TASK →…)。
   约束写在 `/cc` 的 prompt 模板里("识别到开发需求时,严格按 dev-pipeline-workflow
   走流程并落 `docs/plans/`"),而不是把通道锁死成只能谈需求。
4. **长输出落盘**:方案/PLAN 全文写进 `docs/plans/`(工作目录就是 repo),
   频道里只回摘要——不与 Discord 消息长度上限搏斗。

## 3.5 通知约定(项目 profile 的一部分)

每个项目一个专属 Discord 频道,Hermes/dispatcher 关于该项目的**一切**外发消息
(TASK 完成情况、review 结果转发、preview URL、CI 状态、审批请求)都发到该频道,
不混入 Hermes 的通用频道。LuxrayKit:**`luxraykit-dev`,频道 ID `1529159963526693025`**
(VPS 上已记录为 `~/.hermes/.env` 的 `LUXRAYKIT_DISCORD_CHANNEL=discord:1529159963526693025`,
2026-07-22 `hermes send` 冒烟已通)。发送方式:
`hermes send --to "$LUXRAYKIT_DISCORD_CHANNEL" --subject "[tag]" "…"`(无需 gateway,直连 REST)。

## 4. 2c2g 资源纪律(骨架,VPS 通用)

- 加 2–4G swap;全局锁保证同一时刻只跑一个 job(天然限流订阅额度)
- build/test 卸载:CI 跑在 GitHub Actions,preview 构建跑在 Cloudflare 侧,VPS 只做编排与轻量代码编辑
- review 只喂 diff + 相关文件;lint/test 由脚本跑、结果文本喂给模型

## 5. 项目 profile:LuxrayKit(UI/UX 重的纯前端 PWA)

每个新项目开工时回答三问,写进该项目 AGENTS.md;骨架照搬,只换这节。

1. **最容易坏而测试最难写的是什么?** → UI/UX(视觉、交互、移动端体验)
   - CI 渲染冒烟:`offline.spec.ts` + `team-samples.spec.ts`(已有)
   - 本机 win32 视觉回归 17 态:UI 改动 merge 前手动跑(已有,基线平台锁定,严禁 CI 重生成)
   - **preview URL 真机验收**:手机点开 workers.dev 链接实测(本次打通,见 §6)
2. **什么改动可以自动合并?** → 仅 `automation/pokedb-environment-refresh`、`automation/vgcpastes-team-refresh` 两个白名单分支的纯生成 JSON
3. **人只想亲眼看什么?** → PLAN 摘要、preview URL、样本数/audit 摘要

对照示例(换项目时):后端 API 项目 → L3 换 API 契约测试 + staging smoke;CLI 工具 → L3 换跨平台矩阵构建。

## 6. Preview 部署事实(2026-07-22 实测)

- ✅ **已落地(2026-07-22 端到端验收)**:push 非 main 分支 → 影子 Worker
  `luxraykit-app-preview` 自己的 Builds 触发器(非 main,`npm ci && npm run build` →
  `versions upload --config …wrangler.preview.jsonc`)→ ~70 秒出 per-version preview URL
  (`<版本前8位>-luxraykit-app-preview.ffkiyo7.workers.dev`,手机可点)
- 踩过的三个坑(细节见 guide §9):带 DO 的 Worker 不生成 preview URL;Workers Builds
  把部署钉死在所连 Worker(preview 触发器必须建在影子 Worker 名下);wrangler 需显式
  `preview_urls: true`
- ⚠️ 绕法 B(长期干净,可作流水线 dogfood PLAN):把 DO + cron 拆成独立 refresher
  Worker,luxraykit-app 无 DO 后原生获得 preview URL,即可裁撤影子 Worker
- 纪律(已在 AGENTS.md):preview 与生产共享 KV,一律只读对待;cron 不在 preview 触发;
  影子 Worker 缺 DO/secret,只读是结构保证
- 待接线:build 成功后把 preview URL 发 `luxraykit-dev` 频道(Phase 2 的 dispatcher 职责;
  Workers Builds 对 PR 也会自动贴 preview 评论,开 PR 的分支无需额外接线)

## 7. 分阶段落地

- **Phase 0(半天;✅ = 2026-07-22 实机已确认就位)**:
  ✅ swap 2G 已加(1.9G RAM,负载正常) · ✅ Node v24.18.0(与 CI 一致) · ✅ 双 clone
  (`~/LuxrayKit` 策展 / `~/LuxrayKit-maintenance` cron,两个刷新 cron 在跑) ·
  ✅ tmux/screen 可用 · ⬜ 开 Hermes API server(`API_SERVER_ENABLED=1`+`API_SERVER_KEY`,
  写进 user systemd unit,只绑 localhost) · ⬜ 装 Claude Code CLI + 设
  `CLAUDE_CODE_OAUTH_TOKEN`(token 已生成) · ⬜(可选)hermes 升级 0.18.0→0.19.0 ·
  ⬜ docs/{plans,tasks,reviews} 约定就位 · ⬜ Discord webhook 通知打通 · ⬜ SSH 手动跑
  一轮完整循环,找卡点
- **Phase 1**:插件化 dispatcher(见 §3.1)——① codex-relay handler async 化(修事件循环阻塞);② 克隆出 `/cc` claude-relay(resume 续会话 + 讨论记录 md 备份 + 自由通道);③ TASK 下发走 Hermes HTTP API `POST /v1/runs`。dispatcher 本身 = 流水线第一个 dogfood 项目
- **Phase 2**:preview URL 自动发频道、`/status` 查询、审批类插件命令(`/approve` 等);(可选)绕法 B 重构

## 8. 开放决策(⚠️ 待拍板)

1. preview 走绕法 A 先用、B 排期重构?还是直接 B?
2. ~~dispatcher 宿主~~ ✅ 2026-07-22 拍板:Hermes 插件族(样板 `/cx` codex-relay,详见 §3.1),不做独立进程
3. 打回 2 轮超限后的升级路径:强模型直修 or 必须 ping 人?
4. 本文档定稿后落到哪:仓库 `docs/`(项目实例)+ 你自己的模板库(骨架部分)?
