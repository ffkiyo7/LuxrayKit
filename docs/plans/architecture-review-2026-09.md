# 架构复盘（2026-09，UI 改版收尾时）

改版期间 8 个阶段 agent 各自报了「顺带观察」，加上我自己量的数据，合成下面的清单。**都只是建议，一条没动手**；每条写了依据、收益和代价，按「先做哪个最划算」排序。

数据口径：`npx vitest run --exclude '.claude/**'`，45 个文件 / 566 条用例，测试体耗时合计约 50 秒（2026-09-19，`dev` = 0bde919）。

## 一、测试

### 1. `src/App.test.tsx` 是唯一真正的瓶颈（建议先做）

- **依据**：1470 行、49 条用例，**一个文件占全部测试耗时的 56%**（28 s / 50 s）。每条用例都挂整棵 `<App />` + fake IndexedDB，然后用中文文案找元素。改版的 8 个阶段里，**每一个** agent 都被迫改这个文件，合并冲突也主要出在它和 `App.tsx`。
- **问题不在「多」而在「放错了层」**：49 条里只有约 10 条真的在测跨页行为（tab ↔ hash 路由、分享链接导入、上位构筑导入 → 队伍列表高亮 → toast、环境详情 → 加入队伍、从队伍成员代入计算器）。其余是单页行为，借 `<App />` 走一遍导航才能到达——例如「计算器招式搜索与选中同步」「图鉴按两个属性过滤」「特性按持有者名字搜索」。
- **和页面级测试重复**：`TeamPage.test.tsx`（18 条）与 App.test 的队伍部分（约 14 条）都挂真 `<App />`，新建 / 删除 / 改名 / 编辑器各测一遍。
- **建议**：
  1. 单页行为下沉到各页自己的测试，直接 render 页面组件 + 传 props（`CalculatorPage.test.tsx`、`SpeedPage.test.tsx`、`EnvironmentPage.test.tsx` 已经是这个形态，照着做）。图鉴现在**没有自己的测试文件**，它的 3 条用例全在 App.test 里。
  2. App.test 只留跨页流程，目标 ≤ 12 条。
  3. 队伍相关二选一：要么留在 `TeamPage.test.tsx`，要么留在 App.test，不两边各一份。
- **收益**：全量测试时间大约减半；以后改一页只动一个测试文件。**代价**：纯搬运约半天到一天，需要逐条确认没丢断言；建议在改版合进 `main` 之后单独做，别和视觉验收混在一起。

### 2. 断言 DOM 细节的用例（随第 1 条一起清）

各 agent 这一轮已经删掉一批（`pr-14` class、sheet 的 inline `style.bottom`、`h-6 w-6` 按钮尺寸、`cursor-default`）。规则建议写进 `CONTRIBUTING.md`：**单测断言角色 / 可访问名 / 行为结果，不断言 class 和内联样式**；样式归视觉基线管。唯一合理的例外是 `Sheet` 跟随软键盘（`bottom` / `maxHeight`），那是行为不是样式，已保留。

### 3. 不算过度工程、建议保留的

- `src/lib/damageAdapter.test.ts`（2547 行 / 99 条）：行数吓人，但**只跑 0.1 秒**，而且守的是伤害计算——产品里最容易悄悄算错的地方。保留。
- `cloudflare/environment-worker/src/index.test.ts`（1932 行 / 69 条，0.1 s）、`dataAudit.test.ts`（26 条）：守的是「preview 与生产共享 KV」「零容忍审计」这两条红线。保留。
- `hashRoute.test.ts` 的 `routePatterns` 全覆盖门禁：这一轮新增 6 条路由时它确实拦住了漏登记。保留。
- `FeedbackSheet.test.tsx` 里 honeypot / 草稿恢复两条其实在测 `sessionStorage` 与表单序列化，可以下沉成纯函数测试，但收益小，不急。

### 4. 本机工具问题：vitest 会扫进 `.claude/worktrees/`

- **依据**：并行 agent 的 worktree 在 `.claude/worktrees/` 下，`vite.config.ts` 的 `test.exclude` 没排除它，`npm test` 会把每个副本的测试都跑一遍（这次看到 499 个文件、200 个假失败）。
- **建议**：`test.exclude` 加一项 `'.claude/**'`。一行，零风险。

### 5. Playwright 功能性 e2e 与 UI 文案强耦合

`tests/pwa/` 的三个功能 spec（离线 / 首屏预算 / 队伍样本）全靠旧文案定位，改版后必挂（已另派 agent 更新）。它们保护的行为是对的，但建议给关键锚点加稳定的 `data-testid`（tab bar 四个按钮、环境页就绪标记、队伍列表容器），e2e 只认这些锚点，不认文案。

## 二、文件与模块

### 6. `src/App.tsx`（613 行）同时是路由表、页面装配、跨页状态机和两个弹窗

- **依据**：12 个 `useState`、约 30 个 hook 调用；`ImportCoverageNoticeDialog`（07-04）、`PageLoading`（N08-15）、`ToolWorkspace` 都定义在里面；`page` 这个 `useMemo` 的依赖数组有 20 多项。这一轮 6 次合并有 5 次在它身上冲突。
- **建议拆三块**（不引入新库）：
  - `src/app/routes.tsx`：route → 页面元素的装配（现在的 `page` useMemo + `ToolWorkspace`）。
  - `src/app/useTeamImport.ts`：`importSampleTeam` / `continuePendingImport` / `importSharedTeam` / `shareTeam` / `copyReplicaCode` + `importToast` / `highlightedImportTeamId` 这一组状态——它们是一个内聚的状态机。
  - `ImportCoverageNoticeDialog` → `src/pages/environment/`，`PageLoading` → `src/components/kit/`。
- **收益**：`App.tsx` 降到约 200 行，只剩外壳；并行改动不再撞车。**代价**：中等，需要 App.test 先瘦身（第 1 条）否则回归面太大。

### 7. 样式文件按「阶段」命名，应改成按「领域」

- **依据**：`src/styles/p2.css` / `p3.css` / `p3b.css` / `p4a.css` / `p4b.css` / `p6.css` 是为了并行不打架临时起的名字，半年后没人知道 p4a 是什么。
- **建议**：改名 `environment.css` / `teams.css` / `team-editor.css` / `dex.css` / `type-chart.css` / `profile.css`；顺手收敛重复：`p4b.css` 的 `.lk-type-segment-on` 与全局 `.lk-segment-on` 等价；`p2.css` 的 `.lk-env-slab`、`p3b.css` 的 `.lk-slab` 与全局 `.lk-btn-primary` 是同一族主按钮阴影的三个副本（深色外发光半径略有不同，合并前先确认是否有意）。
- **收益**：可读性；**代价**：小，纯改名 + 改 `main.tsx` 的 import。

### 8. `src/components/ui.tsx` 只剩两张属性表，名不副实

`Card` / `Button` / `Chip` / `Badge` / `TypeBadge` / `PokemonAvatar` 等这一轮已全部删除，文件里只剩 `typeColors` / `typeLabels`，被 kit 的 `TypeDot` 反向 import。建议挪到 `src/lib/typePresentation.ts`（或 `src/components/kit/typeColors.ts`），删掉 `ui.tsx`。

### 9. 还偏大的页面文件（按需拆，不急）

| 文件 | 行数 | 建议 |
| --- | --- | --- |
| `src/pages/CalculatorPage.tsx` | 1083 | `SideEditor`（约 270 行）、`ResultCard`（5 个分支态）、选择器 sheet 各自成文件，放 `src/pages/calculator/` |
| `src/pages/EnvironmentPage.tsx` | 927 | `FullRankingPage`、`EnvironmentMethodologyPage` 是独立路由，拆出去；详情和加载态已经拆了 |
| `src/pages/TypeChartPage.tsx` | 627 | `TypeMatrix` 单独成文件；`MATRIX_CELL_SIZE` 与 CSS 里的 `min-width:44px` 是两处真相，收成一个 CSS 变量 |
| `src/pages/SpeedPage.tsx` | 625 | `OutspeedSheet` / `TierRow` 拆出；轴计算已是纯函数，可挪进 `src/lib/speedTier.ts` 旁边 |

页面目录也不统一：`pages/team/`、`pages/dex/`、`pages/profile/` 有子目录，环境 / 计算器 / 速度线 / 属性速查还平铺在 `pages/` 下。拆的时候顺便对齐。

### 10. 两套「本机小状态」存储，没有约定

这一轮新增了三处 `localStorage`（`luxraykit.recentDex.v1`、`luxraykit.recentTools.v2`、`luxraykit.env.methodologySeen`），同时 `hasOpenedPresetTeam` 走的是 IndexedDB `UserPreference`。两种都有道理（前者是可丢的工作集，后者要随备份走），但**没有写下来的规则**，所以每个 agent 各自判断。建议在 `DEVELOPER_GUIDE` 加一句：「要进备份 / 跨设备迁移的 → `UserPreference`；丢了无所谓的 → `localStorage`，key 统一 `luxraykit.<域>.v<n>`，读取必须降级」。`methodologySeen` 按这条规则其实该进 preferences（否则用户导入备份到新设备会再看一次首开 sheet）——影响很小，可以不改。

## 三、死代码（确认过无调用方，删之前各有一个要你点头的点）

| 对象 | 依据 | 删之前 |
| --- | --- | --- |
| `src/data/pokemonFacts.ts` + 测试 + `scripts/generate-pokemon-facts.mjs` + `package.json` 的 `data:pokemon-facts` | 唯一消费者「你知道吗」横幅已按决策删除 | 80 多条冷知识是内容资产，确认以后不会换个形态回来 |
| `src/branding.ts` 的 `feedbackLinks` | 「关于与数据」里的 GitHub issue 外链按 08-02 删了 | **先决定那条外链要不要加回来**（见改版计划的待拍板清单） |
| `src/pages/environmentTeamSamples.ts` 的 `teamSampleCategory` | 上位构筑页的「赛事 / 排位高分」筛选已按 07-01 删除；`src` 内无其他引用 | 无 |
| `src/styles.css` 的 `.speed-grid` | 改版前就已无引用 | 无 |

不是死代码但值得留意：`src/lib/damageAdapter.ts` 的 `validateStatPoints` 仍被计算器用来判定 SP 是否合法，但它返回的**文案**带英文 key（`speed SP 36 超过单项上限 32。`）。计算器现在只用它的判定、自己拼界面文案；以后别处要展示 SP 错误时别直接印这个串。

## 四、建议的顺序

1. `vite.config.ts` 加 `.claude/**` 排除（1 行）——随时。
2. 改版合进 `main` 并稳定之后：App.test 瘦身（第 1、2 条）。这是其余重构的安全网前提。
3. `App.tsx` 拆三块（第 6 条）+ 样式文件改名（第 7 条）+ `ui.tsx` 退役（第 8 条）。
4. 死代码清理（第三节），每条等你点头。
5. 大页面文件按需拆（第 9 条）——下次要改哪一页时顺手做，不单独立项。
