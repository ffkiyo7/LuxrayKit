# Luxray Kit 开发进度

更新日期：2026-09-23

> 本文只列现状、开放待办、待 owner 决定项与仍有效的规则 / 坑。已完成的各轮进展与功能清单见 `git show 9a26196:docs/progress/DEVELOPMENT_PROGRESS.md`（M-C 接入计划全文见 `git show 9a26196:docs/plans/regulation-mc-migration-2026-09.md`）。工程细节以 `docs/DEVELOPER_GUIDE.md` 为准。

## 现状

- 线上：当前规则 M-C（PR #68，2026-09-10），PokeDB 赛季 M-6；UI 整体改造已上线（PR #70，2026-09-20），PR #71–#79 为上线后修补。
- 生产由 `luxraykit-app` Worker 提供静态资源与 API；环境页先读 KV 里的 PokeDB 快照，回退依次为仓库静态快照（当前 M-6，源更新 2026-09-19 20:42）、开发 seed。
- 测试 54 文件 / 674 条（2026-09-23）；视觉基线 24 张（18 深色 + 6 浅色，CI-only）。

## 开放待办

### M-C Task 10：计算器草场地形与 Aura Guard（⬜ 未开工）

- **允许改动**：`src/lib/damageAdapter.ts` / `damageAdapter.test.ts`、计算器场地选择器所在组件、`docs/research/DAMAGE_CALC_FIXTURES.md`。
- **现状**：`damageAdapter.ts` 有天气（`weatherImpact()`，`:352`），没有 terrain。`aura-guard` / `aerilate` / `thermal-exchange` 的 `calculationImpact` 为 `pending`，伤害计算不读它们。招式的 `makesContact`（来自 `@smogon/calc`）已入库、目前无消费方。
- **要求**：每个机制二选一，不许既不建模也不提示。
  - A 建模：草场——草属性招式增伤、地震类减伤、青草滑梯先制，口径逐条对照确认后实现；Aura Guard——按 `makesContact` 把接触招伤害减半。
  - B 守门：未建模场景阻止计算或显著警告，不把结果显示成准确值。
  - 推荐：Aura Guard 走 A；草场的草招增伤 + 地震减伤走 A，其余走 B。
  - Terrain Extender 与四种 Seed（Electric / Psychic / Misty / Grassy）的场地联动也要按 A 或 B 处理。
- **边界**：只做单次交换的伤害区间，不做回合推进 / 换人 / 命中判定 / 特性触发链（`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`）。
- **验收**：fixture 测试覆盖接触招 vs 非接触招打 Aura Guard 持有者、草场下草招与地震的修正；未建模场景在 UI 上有提示且文案不暗示精确；`npm test` + `npm run build` 通过；CI `visual` 门禁通过；Draft PR。

### 其他

- [ ] ⬜ **删 R33 的 `TRANSITIONAL` 回填**：`src/data/environment.ts` 的 `backfillStatPointStats` 与它多发的那次 fetch，连同 `environment.test.ts` 里对应用例。前置已满足（生产 `/api/environment/latest` 已带 `statPointStats`，2026-09-23）。
- [ ] ⬜ **Task 13 队报链接重做 + 双来源统一**（spike 先行）：PokeDB 队报链接多数落在没有实际加点的 X 截图贴，换落点或弱化入口。
- [ ] ⬜ 属性速查页补视觉基线。
- [ ] ⬜ 分享链接预览浮层（`#/t/<code>`）补视觉基线：先定合法 code 从哪来（写死会随 catalog 变动失效）。现由 `App.test.tsx` 覆盖。
- [ ] 🎮 人工确认 Analytics Engine 里出现 `luxraykit_pageviews` 数据集且有行写入。
- 产品功能 P3 速度线减法 → P4 PokeDB meta 调研 → P5 对位速查：见 [`product-roadmap-2026-08.md`](../plans/product-roadmap-2026-08.md)。
- 重构（App.test 瘦身、`App.tsx` 拆分、样式改名、`ui.tsx` 退役、死代码、大页面拆分）：见 [`architecture-review-2026-09.md`](../plans/architecture-review-2026-09.md)。

## 待 owner 决定

- `src/data/environment.ts` 里 Worker stale / degraded 分支与 Worker 不可用分支取兜底 JSON 仍用 `force-cache`（兜底 JSON 手工刷新后回访用户拿不到新版）：是否改 `no-cache`。
- **Task F 伤害计算页排版重规划**：计算器已随 UI 改造重排（owner 2026-09-19 验收），是否算完成。
- UI 相关待拍板清单：见 [`ui-redesign-2026-09.md`](../plans/ui-redesign-2026-09.md)。
- 是否做事件级埋点：见 [`product-roadmap-2026-08.md`](../plans/product-roadmap-2026-08.md)。

## 规则与已知坑

- 伤害计算是 Gen9 主线公式近似，不是 Champions 官方公式；UI 不暗示精确。
- `src/data/schedule.ts` 的 `seasonSchedule` 每个赛季追加一条（当前到 M-6），赛季编号公告出来前不写；缺表赛季的 `sampleRegulation` 返回 `undefined`，不要兜底成当前规则。
- `src/lib/dataAudit.test.ts` 写死各项总数（当前 pokemon 262 / Mega 81 / 道具 166 / 招式 566 / 特性 216 / form 39）与招式接触基准集：加数据必红，按实际数量更新并在注释写清算式。
- 🎮 `speedTier.test.ts` 的 Mega Z 占位守卫保留：PokeDB 速度线还没有 Mega Z 切片（`speedTiers.ts` 的 `'151'` 档位为 0）；PokeDB 开始列 Z Mega 后换成同文件的 resolution 检查。
- 静态兜底 JSON 没有 `ruleSetId`（`battles.*.rule` 是 `singles` / `doubles`），不要拿它核对规则。
- Mega 表按父级拼接数组合并；同父级新增 Mega 后必须回归确认原有 Mega 仍在（曾静默丢失 `mega-garchomp-z`，无类型错、无测试红）。

## 下次换规则（如 M-D）必做

1. `regulationSchedule` / `seasonSchedule` 追加**字面量**窗口并挂官方公告 `sourceUrl`，不引用 `currentRuleSet`；日期只认官方公告。
2. 视觉用例的固定时钟由 `currentRuleSet.startAt` 推出（`tests/pwa/visual.spec.ts`），切规则的 PR 截图必变：在该分支跑 `visual-baseline.yml` 重建基线；报「clock falls outside」时缩短 spec 里的偏移。
3. 合法池只认官方 Eligible Pokémon 端点（M-C 的是 `https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178713870219xeaaio/en/pokemon.html`，新规则从公告页内链找），与本地 allowlist 做双向全量差分；不用社区名单或 PokéBase 规则标签；官方清单出现前不入库。形态按 Champions form index（游戏内 0-based 序号）对照。
4. `src/data/seed/regMA/allowlist.ts` 手工追加 `reg-mX-` 行，同步 `regMaPokemonAllowlistExpectedCount`。
5. 本体用 `scripts/generate-catalog-batch.mjs` 生成（批次号 / 大小 / sourceRefs 走命令行参数）；新 Mega 另建 `mega-catalog-<reg>.ts`；Mega 引用的特性 id 必须有 Ability 行。
6. 每块新 Mega 石：独立道具，`requiredItemId` 与 `applicablePokemonIds` 对齐，加道具图标，`pokedbItemNameMap.ts` 加日文名（Z 石用全角 Ｚ，半角行留作别名）。新道具英文名以 PokéBase slug 为准，翻完 PokéBase 道具页全部分页再定数。
7. PokeDB 键映射：招式 / 特性键逐个用日文名对上 PokeAPI 同号条目后写进 `pokedbResourceKeyMap.ts`；Mega 特性以 PokeDB 形态 payload 的 `ability_key` 为准，不信 PokémonDB / `@smogon/calc`。
8. 每个新本体在 `physicalMetrics.ts` 补一条（按 `nationalDexNo`，形态 / Mega 不补）；本体与 Mega 补立绘，在 `scripts/` 下新写脚本，不运行 `scripts/archive/update-mc-assets.mjs`。
9. `currentRuleSet`：同步 `id` / 名称 / `displayName` / `startAt` / `endAt`，升 `dataVersionId`；战斗参数（`battleType` / `allowMega` / `megaLimitPerBattle` / `duplicateHeldItemsAllowed` / `timers`）逐项对照官方公告；`dataSourceManifest` 加新来源并保留历史来源；新行 `verificationStatus: manual-review`；`RegulationId` 映射表加一条。
10. 切规则、catalog 增补、全量重生成放在同一个 PR。重生成：`data:pokemon-facts`、`data:pokedb:speed`、`data:pokedb:environment`、`data:items:audit`、`worker:app:types`、`worker:environment:check`；更新 `dataAudit.test.ts` 的总数。
11. `npm run data:regma:moves`（约 75 分钟网络作业）的 diff 拆成 `makesContact` 与 learnset / 文案两部分分别审。
12. VGCPastes：`scripts/ingest-vgcpastes-champions.mjs` 加一条 per-regulation 配置 + 新 sheet gid。
13. 开赛后在真实 PokeDB 数据上跑一次刷新，零容忍审计必须全零；与本体同名的独立形态行掉出速度线时加进 `speedTier.ts` 的 `CATALOG_FORM_ALIASES`；新赛季无队伍样本时依赖脚本向前回溯或设 `POKEDB_SAMPLE_SEASON`。
14. 开赛前赶不及：只补规则窗口、不动 `currentRuleSet`（软着陆）。
15. 不重命名 `seed/regMA/` 与 `reg-ma-environment.json`；不做多规则 catalog 切换。

## 验证命令

```bash
npm run data:pokedb:environment:check
npm test
npm run build
npm run worker:app:check
npm run test:pwa
```

视觉回归只在 CI 跑（`visual` 门禁），本机不跑 `test:visual`。

## 文档索引

- 开发者文档（架构 / Worker / 部署）：`docs/DEVELOPER_GUIDE.md`
- 已上线 UI 的设计规范：`docs/DESIGN_SYSTEM.md`
- 范围边界：`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`
- 产品路线：`docs/plans/product-roadmap-2026-08.md`
- UI 规则、已知坑与待拍板：`docs/plans/ui-redesign-2026-09.md`
- 重构待办：`docs/plans/architecture-review-2026-09.md`
- 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 数据来源：`docs/research/DATA_SOURCE_RESEARCH.md`
- 计算边界：`docs/research/CALC_ENGINE_SPIKE.md`
