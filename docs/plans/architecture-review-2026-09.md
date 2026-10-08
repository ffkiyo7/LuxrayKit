# 架构复盘（2026-09，UI 改版收尾时）

> 只列未做的重构项，按建议顺序；已完成项与原始依据见 `git show 9a26196:docs/plans/architecture-review-2026-09.md`。都只是建议，动手前由 owner 选。

## 待办（按顺序）

- [x] **1. App.test 瘦身**（✅ 2026-10-08）：49 条 → 10 条跨页流程，单文件约 82 s → 23 s；单页用例下沉到 `TeamPage` / `CalculatorPage` / `DexPage` / `ToolsPage` / `ProfilePage` 测试与 `environmentImport.test.ts`，队伍用例只留 `TeamPage.test.tsx`；规则写进 `CONTRIBUTING.md`。
- [x] **2. `src/App.tsx` 拆分**（✅ 2026-10-08）：`src/app/routes.tsx`（RoutedPage + 路由弹层）、`useTeamImport.ts`、`useToolPresets.ts`、`useEnvironmentState.ts`；`ImportCoverageNoticeDialog` → `src/pages/environment/`，`PageLoading` → `src/components/kit/`。
- [x] **3. 样式文件按领域改名**（✅ 2026-10-08）：`src/styles/p2.css` / `p3.css` / `p3b.css` / `p4a.css` / `p4b.css` / `p6.css` → `environment.css` / `teams.css` / `team-editor.css` / `dex.css` / `type-chart.css` / `profile.css`，`main.tsx` 的 import 已同步；`.lk-type-segment-on` 已并入全局 `.lk-segment-on`。类名 / 变量前缀（`lk-p4a-*`、`--p4a-*`）未改。
  - [ ] 剩一项待 owner 确认：`environment.css` 的 `.lk-env-slab`、`team-editor.css` 的 `.lk-slab` 与全局 `.lk-btn-primary` 是同一族主按钮阴影（深色外发光半径略有不同，合并前先确认）。
- [x] **4. `src/components/ui.tsx` 退役**（✅ 2026-10-08）：`typeColors` / `typeLabels` 挪到 `src/lib/typePresentation.ts`，原文件已删。
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
