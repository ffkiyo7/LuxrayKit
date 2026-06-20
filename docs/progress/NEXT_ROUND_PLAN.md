# 下一轮开发计划 / TASKS

更新日期：2026-06-20

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

> 上一轮 Task A–E、G、H 及「上线前联合核验」已全部完成并验证（2026-06-18 核对，`npm test` 239 passed）。Task 1（伤害计算补全新赛季 Mega 物种映射）已完成并验证（2026-06-18，`npm test` 240 passed、`npm run build` passed）。Task 2（一次性脚本摄入 VGCPastes「Champions M-A」构筑）已完成并验证（2026-06-19，经 Claude review 修订：按赛事含金量清洗——仅保留官方线下锦标赛 + 近 30 天窗口，PJCS 取 Top14，最终入库 **99 队**；修正 EV→SP 误除以 8 的 bug；数据改为运行时 fetch（后由 Task 8 改为构建期受管 chunk））。Task F（伤害计算页排版重规划）经确认**保留、暂不做**，见文末。

> **本轮（2026-06-19）新增**：将一批零散需求整理为 Task 3–19。其中**原 Task 12（队伍卡片字段适配）经复核与 Task 3/5 重合，已撤销**（「SP/配招」即 Task 3 胶囊、「队伍码」属 Task 5、「来源标识」并入 Task 3）。**已完成并验证**：Task 3/4/5（卡片来源标签 + 可导入粒度行 + 动态导入提醒 + 队伍码链路）、Task 8（VGCPastes 改构建期受管 chunk，根治整批消失）、Task 6/7/9（底栏触底守卫、永恒花种族值、样本量框去误导光标）、Task 10/11（计算器空白态 + 统一默认成员初始化）、Task 16（PokeDB 更新探针 → 条件触发刷新）、Task 17（底栏自动隐藏流畅度 + 中途停留遮挡）。基础设施：`cloudflare/environment-worker/wrangler.jsonc` 的自定义域名 `routes` 已注释保留（合并部署后停用对外 `luxraykit.com`，Worker 仍经 `*.workers.dev` 提供；详见 `DEVELOPMENT_PROGRESS.md`）。**剩余**：Task 13（队报链接，spike 先行）→ Task 14（速度线重做，spike 先行）→ Task 15（浅色主题）；及 Task 18（粒度胶囊改 icon，接续 Task 3）→ Task 19（队伍一览 + 试试灵感，替代 Task 4「换一批」与主页乱序）。建议先做 18（小改）→ 19（功能）。

## 任务清单

### Task F — 伤害计算页排版重规划（保留 · 暂不做 · 低优先级 · 前端 · 算法不动）

> 上一轮遗留。经确认本轮**保留但暂不做**，待后续排期。算法/计算口径不动，仅重排展示层与信息层级（进攻/防守方卡片、招式区、对战条件、伤害结果的布局与视觉）。可走 `frontend-design` 技能定方向，保持与全站 `text-xs/text-sm` 设计语言一致。

### Task 3 — 构筑样本卡片字段适配：可导入粒度胶囊 + 来源标识 + 导入提醒重写（已完成 · 2026-06-19）

> 完成记录：卡片显示 PokeDB 环境榜 / VGCPastes 锦标赛来源标签，并按 `hasSpread`/`hasMoves`/`replicaCode` 渲染「可导入：[SP分配][配招][队伍码]」粒度行；导入提示改为按当前样本动态说明可带入项与缺失项。额外修正 VGCPastes 样本被旧 PokeDB「赛季 · 名次 · 分数」标题归一化覆盖的问题：赛事样本保留原始标题，展示赛事、名次/组别与分享日期。去掉重复的「可导入」标签，仅保留粒度行。（`npm test` 250 passed、`build`、`test:visual` 通过）

### Task 4 — 上位构筑列表乱序展示 +「换一批」随机（已完成 · 2026-06-19）

> 完成记录：按当前 battleType 样本池生成带种子的乱序列表，浏览内按乱序顺位分批展示；翻到末页换新种子重洗，切换单/双打重置批次与种子。测试覆盖首屏乱序、换批不重复、目标样本翻页可达。**注**：Task 19 将以「固定 4 张最新 + 试试灵感」替代主页乱序与「换一批」，本任务的 seeded shuffle 保留给「试试灵感」。

### Task 5 — 队伍码：写入 → 导入带入 → 队伍详情页展示与复制（已完成 · 2026-06-19）

> 完成记录：`Team.replicaCode` 接入环境样本导入链路并保留在队伍 schema 归一化；队伍详情页成员计数后展示队伍码与复制按钮，无码队伍仅显示成员计数；复制调用 `navigator.clipboard.writeText` 复用顶部 toast，文案「队伍码已复制 / 分享可能已过期」。原「本地队伍 · 可自由编辑」说明已移除（并入需求 #1）。

---

### Task 8 — VGCPastes 批次导入后消失 + 配置映射核验（已完成 · 2026-06-19）

> 完成记录：根因是 VGCPastes 作为 `public/data` 裸 JSON 运行时 fetch，任何 404 / 离线未命中 / SW 错版被 `catch` 静默吞成空数组（表现为「PokeDB 正常但 VGCPastes 整批消失」）。改为 `src/data/external/vgcpastes/*.json` 的 Vite 动态 import（hash chunk），摄入脚本同步写入受管位置，SW 移除 `/data/vgcpastes/*` 预缓存并 bump cache。`npm run data:vgcpastes:champions-ma:check`、`test`、`build`、`test:visual`、`test:pwa` 均通过。

### Task 6 — 底部导航栏滚到底部上浮遮挡内容（已完成 · 2026-06-19）

> 完成记录：`useAutoHideBottomNav.ts` 新增 `isNearScrollEnd`（`scrollTop + 视口高 >= 内容高 - 2`）并接入 `handleScroll`——触底强制显示底栏并清掉 idle timer，避免停在隐藏/半隐藏遮挡内容；window 路径用 `visualViewport?.height ?? innerHeight`。新增用例覆盖「向下滚到底仍 shown」。（后续流畅度/中途停留遮挡见 Task 17）

### Task 7 — 花叶蒂改永恒花形态种族值（已完成 · 2026-06-19）

> 完成记录：`catalog-batch-003.ts` 的 `floette.baseStats` 改为 `74/65/67/125/128/92`，`dataAudit.test.ts` 加防回退断言。复核确认无需改动他处：`mega-floette` HP 已是 74 且为基础值 +100 BST 干净分配，`pokepasteSource.ts:67` 已映射 `floette → Floette-Eternal`，全站无硬编码基础种族值（速度线/伤害计算均查表）。

### Task 9 — 数据口径页「样本量」方框光标/误点（已完成 · 2026-06-19）

> 完成记录：样本池卡片加 `cursor-default select-none`，去掉误导光标/选中态（该框本就是纯 `<div>`、无 `role`/`onClick`/`tabindex`，问题仅在视觉光标）；`EnvironmentPage.test.tsx` 断言无 `role`/`tabindex`、非 button、className 含 `cursor-default`。

### Task 10 — 伤害计算页进入即重置为空（已完成 · 2026-06-19）

> 完成记录：计算器初始攻防双方改为空白态，不预填首只/第二只宝可梦与首招；普通从工具页进入清掉上次 `calculatorMemberId`，离开再重进仍为空。图鉴/队伍的显式带入路径保留（显式选择后才生成临时配置并计算）。视觉快照更新为新空白起点。

### Task 11 — 自己添加队伍的成员配置初始化（已完成 · 2026-06-19）

> 完成记录：新增 `createDefaultTeamMember` 统一手动成员默认值（原始形态、首个合法特性、无道具、空招式、当前规则中性性格、六项 SP 显式为 0、等级 50）。TeamPage 手动添加与 DexPage 加入队伍均改走该 helper；schema 迁移缺省成员复用同款默认，避免旧的「爽朗 + 速度 32」残留。另：修复 Task 4 乱序导致的「导入提醒」用例偶发 flake（改为测试内固定乱序种子，非产品 bug；隔离连跑 8/8、全量 254 passed）。

### Task 13 — 队报链接重做 + 双来源统一（Feature · **spike 先行**）

> **现象**：当前「队报」入口从导入弹框（`App.tsx:60`）与环境卡片（`EnvironmentPage.tsx:197`）打开 `sample.reportUrl`。**PokeDB 源常只跳到 X 截图帖**（鸡肋，看不到具体加点）；VGCPastes 源跳 pokepaste。

- **目标**：让「队报」入口跳到**有实际加点数值**的落点；并**统一两来源的入口处理**（避免前端不一致）。
- **spike 先行**：
  1. 调研 PokeDB 是否存在带具体配置/加点数值的页面可作落点（trainer / 構築記事 等），还是只有 X 截图帖。
  2. 确认 VGCPastes 的 pokepaste 是否已足够（pokepaste 本就含完整配置）。
  3. 汇报结论后再定实现。
- **改动要点（待 spike）**：PokeDB 源——有好落点则指向之，无则**弱化/隐藏入口**（而非硬塞鸡肋链接）；VGCPastes 源——指向 pokepaste；**权衡**两来源入口是否统一展示，以及 VGCPastes 批是否需要差异化处理。与 Task 3 的导入提醒在同一弹框，注意协调。
- **验收**：入口落点有价值/合理；两来源处理一致，或有明确说明的差异理由；无落点时入口不误导；`npm test` 通过。

### Task 14 — 速度线页面重做 + 超速建议反哺（Feature · 大 · **spike 先行** · 可走 frontend-design）

> **现状**：速度线页面已存在但**入口关闭**（保留为未开放卡片）。本任务重做并规划开放。

- **目标**：
  - **可视化**：保持坐标轴可视化；轴上自带 **PokeDB 参照速度线**（来源 `https://champs.pokedb.tokyo/speed?season=3&rule=1`）。
  - **用户宝可梦入轴**：用户选自己的宝可梦进入坐标轴，调节配置（道具 / 速度 SP / 顺风 等）后**实时看到相对快慢位置**。
  - **反哺**：点轴上任一宝可梦 → 选「**超速他**」→ 系统给出 **SP 分配 / 道具（如围巾）/ 性格 / 顺风** 等建议组合，使用户宝可梦超过该目标。
- **spike 先行**：
  1. 调研 PokeDB speed 端点的数据结构、可取性与离线/缓存策略。
  2. 反哺算法可行性：给定目标最终速度，**反解**所需 速度SP/性格/道具/顺风 的组合与边界（复用 `src/lib/calculations.ts` 的速度公式）。
  3. 汇报后再定实现与入口开放策略。
- **改动要点（待 spike）**：参照速度线数据接入；可视化重做；配置调节交互；反哺建议算法；入口开放策略（先原型/灰度 vs 正式开放）。可走 `frontend-design` 定方向。
- **验收**：轴上展示参照线 + 用户宝可梦；调配置实时更新位置；「超速他」给出合理建议；`npm test` 通过；快照更新。

### Task 15 — 浅色主题品牌色重做（Feature · 前端 · frontend-design）

> **出发点**：浅色主题**整体调性/品牌色**不对，需向 Luxray Kit 品牌色对齐（非个别 token 点修）。

- **涉及文件**：`tailwind.config.js` 颜色 token；主题变量 / 全局样式；`src/branding.ts`。
- **改动要点**：走 `frontend-design` 定浅色调色板与品牌色映射；保证对比度/可读性达标；深浅主题切换观感一致。
- **验收**：浅色主题观感统一、对齐品牌、对比度达标；`npm test` + `npm run test:visual`（浅色态快照）通过。

### Task 16 — PokeDB 更新探针 → 条件触发刷新（已完成 · 2026-06-20）

> 完成记录：cron 由固定 `17 18 * * *` 改为每小时 `17 * * * *`，`scheduled` 入口改走 `startScheduledRefresh`——先用一个廉价 list 页探针提取 `season` + `更新日` 生成 SHA-256 签名存 KV；签名未变且已有快照 → `unchanged` 廉价退出，不触发分批重拉；有变化才进现有 cursor refresh（既有分批逻辑不动，仅加门控）。live spike 确认 PokeDB list 当前无 ETag/Last-Modified，故以「season + 更新日」内容签名为准（保留 `If-None-Match`/`If-Modified-Since` 条件请求作前瞻兼容，304 复用旧签名）。有任务在飞时直接续跑既有 job 不抢；首跑无 previousProbe 时回退用 status 派生签名，且确认探针与解析器 `pokedbEnvironment.ts` 的时间戳归一化格式一致（`YYYY-MM-DD HH:MM:SS`），部署后第一跑不会无谓多拉；失败 `recordRefreshFailure` 后抛出。`npm test` 258 passed、`npm run build`、`npm run worker:environment:check` 均通过。

### Task 17 — 底部 Tab 自动隐藏流畅度 + 中途停留定位遮挡（已完成 · 2026-06-20 · 接续 Task 6）

> 完成记录：`useAutoHideBottomNav` 把滚动处理改为 RAF 合并 + `hiddenRef` 去重，消除每个 scroll 事件的多余 setState 抖动（流畅度）；`BottomNav` 用 `visualViewport` 维护 `--lk-bottom-nav-offset`，显示态贴视觉视口底、隐藏态把 offset 一并移出视口，`.safe-bottom` 同步补足内容底部留白（解决中途停留时上浮一小段、遮挡内容）。新增「中段滚动停下后回显」用例。`npm test` 258 passed、`npm run build`、`npm run worker:environment:check` 均通过。

### Task 18 — 可导入粒度胶囊改 icon 样式（UI polish · 前端 · 接续 Task 3）

> **现象**：Task 3 落地的可导入粒度行目前是**纯文本 + 方括号**「可导入：[SP分配][配招][队伍码]」——当时用 `[]` 只是方便打字，实际应做成**带 icon 的胶囊**样式，当前太简陋。

- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`TeamSampleCard`，`importChips` 渲染，约 `:273`）；测试 `src/App.test.tsx` / `src/pages/EnvironmentPage.test.tsx`（依赖 `可导入：[...]` 文本的断言需随之改）。
- **改动要点**：把 `[SP分配][配招][队伍码]` 文本行改为**胶囊标签组**——每项一个小 pill（圆角 + 轻底色/描边 + 对应 lucide icon），与卡片「来源标签」「可导入」pill 视觉语言一致；仅命中项出现。注意把测试里 `可导入：[...]` 文本定位改为按 pill 文案 / `aria-label`。
- **验收**：粒度以 icon 胶囊呈现、与卡片其余标签风格统一；命中项才显示；`npm test` 通过；`npm run test:visual` 更新环境页 / 队伍一览快照。

### Task 19 — 队伍一览页 + 「试试灵感」随机弹窗（Feature · 前端 · 替代 Task 4「换一批」）

> **出发点**：当前没有队伍一览页，用户找特定队伍只能走 环境页 → 选宝可梦 → 详细数据页 → 下拉「相关上位构筑」，太繁琐。

- **目标**：
  - **保留**现有「相关上位构筑」这条路径不动。
  - **新增「队伍一览」页**：入口放在原**「换一批」按钮位置**，按钮样式同「宝可梦榜 · 查看全部」（`EnvironmentPage.tsx:824-827`）。**移除原「换一批」**。
  - **主页「上位构筑」区**：去掉乱序，改为**固定展示 4 张「更新日期最新」的队伍卡片**（按日期降序取前 4）+「查看全部」入口。
  - **队伍一览页能力**：
    - **区分单/双打**（沿用 `battleType`）。
    - **筛选**：① 是否**含队伍码**；② **队伍类别 = 赛事 / 排位高分**（映射来源：VGCPastes 锦标赛 → 赛事，PokeDB 环境榜 → 排位高分）。**不做「含特定宝可梦」筛选**——靠搜索覆盖。
    - **排序**：**时间由最新到最旧**（独立排序选项）。
    - **搜索**：按**宝可梦名或队伍名**命中队伍。
  - **「试试灵感」按钮**（位于队伍一览页内）：点击 → 弹出**居中的队伍卡片弹窗**（随机抽一支，**复用 Task 4 的 seeded shuffle**），弹窗卡片样式与列表 `TeamSampleCard` **统一**；可点「导入配置」（带关闭），也可点卡片下方「导入配置」按钮**直接跳队伍页面**。
- **导航方案（已定：EnvironmentPage 内 view 切换 + 抽独立子组件）**：作为 `EnvironmentPage` 的第 4 个 `view`（`'home' | 'ranking' | 'methodology'` → 加 `'teams'`），与「完整宝可梦榜」（`view:'ranking'`）**对称**——入口、返回、`battleType`/environment 数据/导入链路天然共享，零额外接线，符合本 app「tab + view state」既有范式（**无 react-router**）。为避免 `EnvironmentPage.tsx` 膨胀，把队伍一览**抽成独立子组件文件**（如 `TeamBrowseView`），`view==='teams'` 时渲染。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（移除换一批、主页改 top-4 最新、加查看全部入口、加 `'teams'` view）；新建 `TeamBrowseView` 子组件；`TeamSampleCard` 复用（列表 + 弹窗）；导入跳转复用 `App.tsx` 的 `onImportSample`；测试。
- **关系 / 复用**：**替代 Task 4** 的「换一批」与主页乱序（seeded shuffle 仅保留给「试试灵感」）；卡片粒度胶囊用 **Task 18** 的 icon 样式；队报入口受 **Task 13** 影响。
- **实现细节待核**：主页「最新 4 张」的日期字段——VGCPastes 有 `dateShared`，PokeDB 样本可能无日期，需定降级排序键（如无日期者按 rank 视为较旧）。
- **验收**：环境页「换一批」改为「查看全部」入口、原换一批移除、主页固定 4 张最新卡片；队伍一览区分单/双打、可按「含队伍码」「赛事/排位高分」筛选、可按时间最新→最旧排序、可搜索宝可梦/队伍名；「试试灵感」弹居中卡片弹窗、可关闭/可导入/可跳队伍页；`npm test` 通过；`npm run test:visual` 更新。

## 暂不做

- 完整战斗模拟器 / 用户账号 / 云同步 / 多赛季趋势库（沿用上轮判断）。
- 升级 Workers Paid（免费分批方案已够用）。
- 队伍分析（上轮已下线）。
- 生成/分享图片（上一轮砍掉，暂无需求；若日后要回归再重评落点）。
- ~~引入新数据源~~ —— 本轮已重新评估并接入，见 Task 2（PokePaste 摄入）。
- **Worker cron 自动拉取 VGCPastes**：本轮先做一次性脚本（Task 2）；数据源更新频率与累积量级未知，待量起来、值得自动化再评估上 cron。注意 Task 16 的探针仅针对 **PokeDB 环境刷新**，与 VGCPastes 自动化是两件事。
- **终端用户粘贴导入框（形态 A）**：用户在 app 内粘贴 PokePaste/Showdown 导入到自己队伍。本轮只做维护侧自动摄入（Task 2）；A 价值有限，推后。
- **Chrome 插件 + computer-use 爬小红书/B站**：payload 是视频/图仍需 OCR/人工、ToS/封号风险、且产出无成绩证据——经评估不作数据骨干。
- 游戏内「复制码」反解、Pokémon HOME、游戏内官方 Battle Data 馈源、Pikalytics/Game8 推荐队作整队源——经调研确认为死路（详见 Task 2 调研结论）。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run test:visual            # 涉及 UI 改动
npm run test:pwa               # 涉及 SW / 离线 / 运行时数据加载
npm run worker:environment:check  # 涉及 Worker
```

剩余任务验收要点：

- Task 13：队报入口落点有价值、两来源处理一致或有明确差异理由（spike 后定）。
- Task 14：速度线轴上展示参照线+用户宝可梦、调配置实时更新、「超速他」给出合理建议（spike 后定）。
- Task 15：浅色主题对齐品牌色、对比度达标；浅色态快照更新。
- Task 18：可导入粒度以 icon 胶囊呈现、与卡片其余标签风格统一、仅命中项显示。
- Task 19：环境页「换一批」改为「查看全部」入口、原换一批移除、主页固定 4 张最新卡片；队伍一览区分单/双打、可按「含队伍码」「赛事/排位高分」筛选、按时间最新→最旧排序、可搜索宝可梦/队伍名；「试试灵感」居中队伍卡片弹窗可关闭/可导入/可跳队伍页。
