# 下一轮开发计划 / TASKS

更新日期：2026-06-11

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

## 背景与关键发现

- **环境“数据不更新”不是 cron 问题。** Worker 已有每 6h cron（`17 */6 * * *`）且跑得通。根因：PokeDB 的 `opendata/s2_*_ranked_teams.json` 当前 **404**（当季 M-2 聚合榜未公开），只有 `s1_*`（“M-1”，已结束的上赛季）。Worker 赛季回退一直落 S1，每 6h 拉同一份上赛季数据。
- **决策：直接解析 PokeDB 当季 HTML。** 不引入外部替代源（同样要解析且滞后）。PokeDB `trainer/list?season=2&rule=2` 是当季的（M-2，约 299 条，近日更新）。`parsePokeDbTrainerSamples` 已验证能从该 HTML 解析每张卡的完整队伍（宝可梦 + 携带物），聚合 usage 复用 `buildUsage`。
- **限制**：列表 HTML 不含招式，`moveStats`（详情页「常用招式」）需另抓各 report 页 → P1。

## 任务清单

### Task A — 删除队伍分析功能（就绪 · 独立）

- **目标**：队伍编辑页不再出现「展开队伍分析」入口与弹层，底层代码与测试一并删除。
- **涉及文件**：`src/pages/TeamPage.tsx`、`src/lib/calculations.ts`、`src/lib/teamAnalysis.test.ts`。
- **改动要点**：
  - TeamPage：删 `showAnalysis` state、`AnalysisDetailSheet` 组件、「展开队伍分析」按钮、`{showAnalysis && ...}` 渲染、`openTeamDetail/closeTeamDetail` 的 `setShowAnalysis(false)`、`buildTeamAnalysisDetails` import；若 `BarChart3` 本文件无其它用途则删 import。
  - calculations.ts：删 `buildTeamAnalysisDetails`、`TeamAnalysisDetails` 类型及仅服务于它的模块级 helper；保留 `memberBattleStats`/`memberLabel`。
  - 删除 `src/lib/teamAnalysis.test.ts`。
- **验收**：编辑页无分析入口/弹层；无悬空引用与未用 import；`npm test`、`npm run build` 通过。

### Task B — 环境数据改用 PokeDB 当季 trainer/list 聚合（核心 · 门控 C）

- **目标**：环境榜单从“当季 PokeDB 队报”实时聚合，而非滞后一季的 `ranked_teams.json`，让数据真正随赛季更新。
- **涉及文件**：`cloudflare/environment-worker/src/index.ts`（取数/赛季/聚合/KV）、`src/lib/pokedbEnvironment.ts`（解析与聚合）、必要时 `src/data/environment.ts`（快照结构）。
- **改动要点**：
  - Worker 取当季 `trainer/list`（单打 `rule=2` / 双打 `rule=1`），**分页**抓取以获得足够样本（覆盖约 299 条，注意频率与礼貌 user-agent，控制在 6h cron 内）。
  - 解析：复用/外提 `parsePokeDbTrainerSamples` 的 card→队伍解析；解除其 `maxSamples` 截断用于聚合。
  - 聚合：重构 `buildUsage`，使其接受“已解析队伍列表（slots）”而非 `PokeDbRankedTeamsPayload`，产出 `EnvironmentPokemonUsage[]`（usage% / item / teammate）；top-N 仍作可导入样本。
  - 赛季选择：自动探测当前/最新可用赛季（trainer/list 当季可用），替代硬编码 `SEASON_CANDIDATES`；`ranked_teams.json` 降级为可选回退或移除。
  - snapshot 携带真实赛季标签、源 `updated_at`、completeness。
  - **四条不可破边界**：公开只读缓存、不代用户抓取、未知宝可梦/道具引用走审计、源失败回退静态快照。
- **验收**：`npm run worker:app:check` 通过；新增单测（HTML 聚合 / 赛季探测 / 分页 / 部分失败回退）；部署后 `/api/environment/status` 显示当季（M-2）。

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

### Task E（P1）— 在线详情补齐 moveStats

- **目标**：在线详情页「常用招式」不再为空。
- **现状**：trainer/list 列表 HTML 不含招式（Task B 聚合后详情仍缺招式）；静态包含 `moveStats`，故在线比离线稀疏。
- **取舍**：评估跟进各 trainer report 页解析招式分布（抓取量大、需控频）或暂缺。优先级 P1，B 完成后再定。

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
- Task B：环境榜由当季 trainer/list 聚合，dry-run 通过，部署后 /status 显示 M-2，聚合/赛季探测有单测。
- Task C/D：三态正确标注来源与赛季；口径页为图标定义列表、无硬编码 M-1。
- Task E：详情页招式补全或明确标注暂缺。
