# 架构复盘（2026-09，UI 改版收尾时）

> 只列未做的重构项，按建议顺序；已完成项与原始依据见 `git show 9a26196:docs/plans/architecture-review-2026-09.md`。都只是建议，动手前由 owner 选。

## 待办（按顺序）

- [ ] **1. App.test 瘦身**（其余重构的前置）。`src/App.test.tsx` 现 1512 行 / 49 条，约占全量测试耗时 42%（2026-09-23：54 文件 / 674 条，约 54.5 s）。
  - 单页行为下沉到各页测试，直接 render 页面组件 + 传 props（照 `CalculatorPage.test.tsx` / `SpeedPage.test.tsx` / `EnvironmentPage.test.tsx` 的形态）。App.test 里的图鉴用例（按两个属性过滤、共用搜索框过滤招式 / 道具 / 特性）下沉到 `DexPage.test.tsx` 或 `dex/*.test.tsx`。
  - App.test 只留跨页流程（tab ↔ hash 路由、分享链接导入、上位构筑导入 → 队伍列表高亮 → toast、环境详情 → 加入队伍、从队伍成员代入计算器），目标 ≤ 12 条。
  - 队伍用例只留一处：`src/pages/team/TeamPage.test.tsx`（27 条）或 App.test（约 14 条），二选一。
  - 顺手删断言 class / 内联样式的用例；在 `CONTRIBUTING.md` 写规则：单测断言角色 / 可访问名 / 行为结果，不断言 class 和内联样式（例外：`Sheet` 跟随软键盘的 `bottom` / `maxHeight`）。
  - 保留不动：`src/lib/damageAdapter.test.ts`、`cloudflare/environment-worker/src/index.test.ts`、`dataAudit.test.ts`、`hashRoute.test.ts` 的 `routePatterns` 全覆盖门禁。
- [ ] **2. `src/App.tsx` 拆三块**（641 行；不引入新库；需第 1 条先做）：
  - `src/app/routes.tsx`：route → 页面元素的装配（现在的 `page` useMemo + `ToolWorkspace`）。
  - `src/app/useTeamImport.ts`：`importSampleTeam` / `continuePendingImport` / `importSharedTeam` / `shareTeam` / `copyReplicaCode` + `importToast` / `highlightedImportTeamId`。
  - `ImportCoverageNoticeDialog` → `src/pages/environment/`，`PageLoading` → `src/components/kit/`。
- [ ] **3. 样式文件按领域改名**：`src/styles/p2.css` / `p3.css` / `p3b.css` / `p4a.css` / `p4b.css` / `p6.css` → `environment.css` / `teams.css` / `team-editor.css` / `dex.css` / `type-chart.css` / `profile.css`，同步 `main.tsx` 的 import。顺手收敛：`p4b.css` 的 `.lk-type-segment-on` 与全局 `.lk-segment-on` 等价；`p2.css` 的 `.lk-env-slab`、`p3b.css` 的 `.lk-slab` 与全局 `.lk-btn-primary` 是同一族主按钮阴影（深色外发光半径略有不同，合并前先确认）。
- [ ] **4. `src/components/ui.tsx` 退役**：只剩 `typeColors` / `typeLabels`（被 kit 的 `TypeDot` 引用），挪到 `src/lib/typePresentation.ts`（或 `src/components/kit/typeColors.ts`）后删文件。
- [ ] **5. 死代码**（每条等 owner 点头）：
  - `src/data/pokemonFacts.ts` + 测试 + `scripts/generate-pokemon-facts.mjs` + `package.json` 的 `data:pokemon-facts`（无消费者）。待定：这 80 多条冷知识以后是否还用。
  - `src/branding.ts` 的 `feedbackLinks`（无消费者）。待定：「关于与数据」要不要加回 GitHub issue 外链（见改版计划待拍板）。
- [ ] **6. 大页面按需拆**（改到哪页顺手做）：
  - `src/pages/EnvironmentPage.tsx`（975 行）：`FullRankingPage`、`EnvironmentMethodologyPage` 拆出去。
  - `src/pages/TypeChartPage.tsx`（631 行）：`TypeMatrix` 单独成文件；`MATRIX_CELL_SIZE` 与 CSS 的 `min-width:44px` 收成一个 CSS 变量。
  - `src/pages/SpeedPage.tsx`（665 行）：`OutspeedSheet` / `TierRow` 拆出；轴计算挪到 `src/lib/speedTier.ts` 旁边。
  - 环境 / 速度线 / 属性速查也放进 `pages/` 子目录，对齐 `team/` `dex/` `profile/` `calculator/`。

## 小项

- [ ] 给 e2e 关键锚点加 `data-testid`（tab bar 四个按钮、环境页就绪标记、队伍列表容器），`tests/pwa/` 只认锚点不认文案。
- [ ] 在 `DEVELOPER_GUIDE` 写本机小状态规则：要进备份 / 跨设备迁移的 → IndexedDB `UserPreference`；可丢的 → `localStorage`，key 统一 `luxraykit.<域>.v<n>`，读取必须降级。（可选：`luxraykit.env.methodologySeen` 按此规则改进 preferences。）
- [ ] 可选：`FeedbackSheet.test.tsx` 的 honeypot / 草稿恢复两条下沉成纯函数测试。

## 已知坑

- `src/lib/damageAdapter.ts` 的 `validateStatPoints` 返回的文案带英文 key（`speed SP 36 超过单项上限 32。`），只用它的判定结果，不要直接显示这个串。
