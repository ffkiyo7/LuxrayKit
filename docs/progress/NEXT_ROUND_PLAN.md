# 下一轮开发计划 / TASKS

更新日期：2026-06-11

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

## 背景与关键发现（已实测 PokeDB，2026-06-11）

- **环境“数据不更新”不是 cron 问题，也不是解析 bug。** 6h cron 正常。根因有两层：
  1. `opendata/s2_*_ranked_teams.json` **404**（PokeDB 没公开当季聚合榜 JSON）。
  2. `trainer/list?season=2` 的**队伍阵容被刻意隐藏**（防抄队）：M-2 进行中，每行只有名字+评分，阵容位是 `none.png` 占位；M-1 已结束才放出完整阵容。所以从 roster 拆队伍这条路**当季拿不到任何数据**。
- **真正的当季数据源：PokeDB 自己聚合好的「统计页」**（不暴露任何人具体队伍，故不受防抄队隐藏，M-2 完整可用，已逐项实测）：
  - 排行：`/pokemon/list?season=<S>&rule=<R>` → 213 只按使用率排序（含 rank + key）。单打 `rule=2` / 双打 `rule=1`。
  - 详情：`/pokemon/show/<key>?season=<S>&rule=<R>` → **道具 %、招式 %、队友、特性 %、性格 %** 全部当季填充（实测 Garchomp M-2：气势头带 37.7% / 地震 99.2% / 鲨鱼肌 99.4% / 爽朗 51.4%）。**含招式**，顺带补掉原 moveStats 缺口。
- **可导入「上位构筑」样本**：统计页只有聚合 %，给不了某支具体可导入队伍。这块继续用 roster 解析（已结束赛季 M-1 的 `trainer/list` 阵容）或 構築記事（`/article/search`，当季目前仅 ~1 篇，后期会变多）。
- **已有产物**：Codex 已实现并通过审查的 `trainer/list` roster 解析 + 聚合（`parsePokeDbTrainerListPage` 等）**保留**，由「环境榜聚合」降级为「可导入样本来源」。WIP 在分支 `feat/env-trainer-list-aggregation`。
- **待实现时确认**：榜单行的总「使用率 %」（如 54.0%）在 `/pokemon/list` 与详情页上未直接看到，可能被页面其它处藏着或当季只给排名。实现时确认；拿不到就用排名或相对值兜底。

## 任务清单

### Task A — 删除队伍分析功能（就绪 · 独立）

- **目标**：队伍编辑页不再出现「展开队伍分析」入口与弹层，底层代码与测试一并删除。
- **涉及文件**：`src/pages/TeamPage.tsx`、`src/lib/calculations.ts`、`src/lib/teamAnalysis.test.ts`。
- **改动要点**：
  - TeamPage：删 `showAnalysis` state、`AnalysisDetailSheet` 组件、「展开队伍分析」按钮、`{showAnalysis && ...}` 渲染、`openTeamDetail/closeTeamDetail` 的 `setShowAnalysis(false)`、`buildTeamAnalysisDetails` import；若 `BarChart3` 本文件无其它用途则删 import。
  - calculations.ts：删 `buildTeamAnalysisDetails`、`TeamAnalysisDetails` 类型及仅服务于它的模块级 helper；保留 `memberBattleStats`/`memberLabel`。
  - 删除 `src/lib/teamAnalysis.test.ts`。
- **验收**：编辑页无分析入口/弹层；无悬空引用与未用 import；`npm test`、`npm run build` 通过。

### Task B — 环境数据改用 PokeDB「统计页」当季聚合（核心 · 门控 C）

> **修订说明**：原方案"从 trainer/list 拆队伍聚合"当季拿不到数据（阵容被隐藏）。改为以 PokeDB 自己的聚合统计页为主源，能拿到 M-2 的排行/道具/招式/队友/特性。已写好的 roster 解析保留，退居"可导入样本"来源。在 `feat/env-trainer-list-aggregation` 分支上继续做。

- **目标**：环境榜（排行 + 道具 + 招式 + 队友 + 特性/性格）从 PokeDB 统计页实时聚合当季（M-2）数据；可导入「上位构筑」样本走 roster/構築記事。
- **涉及文件**：`cloudflare/environment-worker/src/index.ts`（取数/赛季/throttle/KV）、`src/lib/pokedbEnvironment.ts`（新增统计页解析 + 复用 roster 解析）、`src/data/environment.ts`（快照结构判别已支持新格式，按需扩展招式/特性字段）。
- **改动要点**：
  - **排行**：抓 `/pokemon/list?season=<S>&rule=<R>`（单打 `rule=2` / 双打 `rule=1`）→ 解析出有序宝可梦列表（rank + pokeDbKey → 经 allowlist 映射到本地 id）。复用已实现的 `detectLatestPokeDbSeason` 选当季。
  - **详情**：对榜单 **top-N**（建议 60–80，长尾只留排名）抓 `/pokemon/show/<key>?season=<S>&rule=<R>`，解析道具 %、**招式 %**、队友、特性 %、性格 %（百分比 PokeDB 已算好，直接读）。映射进 `EnvironmentPokemonUsage`（含 `moveStats` / `itemStats` / `teammateStats`）。
  - **节流**：详情页是 N 次请求（top-N × 单双打）。沿用 250ms 间隔 + 礼貌 UA；给 top-N 和总页数一个硬上限，避免子请求/CPU 超限（Workers scheduled 限额）。
  - **样本（保留 roster 路径）**：`parsePokeDbTrainerListPage` / `parsePokeDbTrainerSamples` 不动，用来出可导入 `teamSamples`——已结束赛季（M-1 阵容已公开）或 構築記事；当季 roster 为空时样本可空，不影响排行。
  - **失败与边界（已实现，保持）**：分页/详情失败不覆盖旧 `environment:latest`/`team-index`，仅写 `status.ok=false`+`failedAt`，前端判 stale；未知宝可梦/道具/招式引用走审计；纯服务端只读缓存、不代用户抓取；失败回退静态包。
  - snapshot 携真实赛季标签、源更新时间、completeness。
- **待确认**：总使用率 %（榜单行 54.0% 那个）能否从统计页拿到；拿不到则用排名/相对值兜底（见背景）。
- **验收**：`npm run worker:app:check` 通过；新增单测（list 排行解析 / show 详情解析含道具+招式+队友 / 赛季探测 / top-N 节流 / 部分失败保旧 KV）；部署后 `/api/environment/status` 显示当季 M-2，详情页「常用招式」非空。

### Task C — 来源/赛季/新鲜度透明化（前端 · 依赖 B · 门控 D）

- **目标**：前端真实反映「看的是哪份数据、来自哪、多新、是否过期」，去掉硬编码赛季。
- **涉及文件**：`src/data/environment.ts`、`src/pages/EnvironmentPage.tsx`（头部）。
- **改动要点**：
  - `EnvironmentState` 增字段：`seasonLabel`（真实赛季，如 M-2）、`sourceKind`（`worker | static | seed`）、`freshness`（`fresh | stale`，来自响应头 `x-luxray-cache-state`）、`sourceUpdatedAt`（源 `updated_at`）。
  - `fetchEnvironmentSnapshot`/`loadEnvironmentState` 把响应头带出来（当前实现丢了 header），据此填 `freshness`/`sourceKind`。
  - 头部区分「抓取时间」与「源更新时间」，stale 给标识；在线/静态回退/seed 三态都正确标注。
- **验收**：头部展示真实赛季而非硬编码；三态标注正确；`npm test` 通过。

### Task D — 数据口径页改「图标定义列表」（依赖 C）

- **目标**：`EnvironmentMethodologyPage` 五段大文字 → 图标 + 标签 + 一行短句；去掉硬编码 “M-1”。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`EnvironmentMethodologyPage`）。
- **版式（用户选定）**：
  - 来源　PokeDB 公开上位快照
  - 范围　不是全服实时统计
  - 百分比　带该宝可梦的队占比
  - 详情　在带了该宝的队中再统计
  - 构筑　来自公开队报链接
- **改动要点**：保留「样本池」分母小卡（数字有价值），其余说明压成图标定义列表；可留一个极简示例（54.0%/285 队＝…）。赛季文案用 Task C 的真实赛季。
- **验收**：无大段文字；展示真实赛季；`npm run test:visual` 更新对应快照。

### ~~Task E（P1）— 在线详情补齐 moveStats~~（已并入 Task B）

统计页 `/pokemon/show` 直接带招式 %，moveStats 在 Task B 内一并产出，无需单独任务。

## 暂不做

- 引入 PokeDB 之外的第三方数据源（已评估：同样要 HTML 解析且滞后，无优势）。
- 完整战斗模拟器、用户账号 / 云同步 / 跨设备队伍、多赛季趋势库。
- 队伍分析（本轮已下线，暂无需求）。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run worker:app:check   # 涉及 Worker 时
npm run test:visual        # 涉及 UI / 口径页时
```

- Task A：编辑页无分析入口/弹层，无悬空引用。
- Task B：环境榜由 PokeDB 统计页聚合当季，dry-run 通过，部署后 /status 显示 M-2，详情页含招式；list/show 解析、节流、部分失败保旧 KV 有单测。
- Task C/D：三态正确标注来源与赛季；口径页为图标定义列表、无硬编码 M-1。
