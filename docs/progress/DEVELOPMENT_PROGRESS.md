# Luxray Kit 开发进度

更新日期：2026-09-02

> 工程细节（架构 / Worker 刷新管线 / 部署）以 `docs/DEVELOPER_GUIDE.md` 为准，本文件只记录进度概要。

## 当前阶段

环境优先重构、Luxray Kit 品牌更新和 Cloudflare Worker 统一部署已进入 `main`。生产站点由 `luxraykit-app` Worker 提供静态资源与 API，环境页在线优先读取 KV 中的 PokeDB snapshot，并保留最新赛季静态快照和开发 seed 两级回退。

## 本轮进展（2026-09-02）：Regulation M-C 接入前准备（阶段 A）

PR #59（merge `9101dca`，CI 含 `visual` 门禁一次通过、基线未重建）。计划与阶段 B 门禁见 [`docs/plans/regulation-mc-migration-2026-09.md`](../plans/regulation-mc-migration-2026-09.md)。M-C 于 **2026-09-09 02:00 UTC** 开赛，官方完整清单未公布，**阶段 B（切换规则、落数据、计算器草场 / Aura Guard）未开工**。

- **时间轴冻结**：`regulationSchedule` / `seasonSchedule` 历史边界改字面量，不再引用 `currentRuleSet`；M-B 结束时间按官方延期订正为 `2026-09-09T01:59Z`；M-B / M-5 条目补 `sourceUrl`。
- **`RegulationId` 扩到 M-C**：`currentRegulation` 改显式映射表、缺失抛错；`sampleRegulation` 查不到赛季返回 `undefined`（不再静默归 M-A）；VGCPastes 样本在加载时按来源文件打标签；队伍库筛选按钮由 `regulationSchedule` 派生。
- **Mega 表合并改按父级拼接数组**：为 M-C 的 Z Mega（absol / garchomp / lucario 父级已有普通 Mega）铺路，重复 `form.id` 抛错，`dataAudit` 新增 `duplicate-mega-form`。
- **招式接触标记改用 `@smogon/calc`**：删掉名称启发式，545 条翻转 122 条（近身战 / 十万马力 / 吸取之吻 / 圣剑 → 接触；`aura-wheel` / `bone-rush` / `icicle-crash` → 非接触），`dataAudit.test.ts` 加基准门禁。`makesContact` 目前无消费方，是 Aura Guard 的前置。
- **脚本隔离**：allowlist 生成器加守卫（存在非 `reg-ma-` 行即拒跑，无 bypass）；catalog batch 生成器批次号 / 大小 / sourceRefs 改命令行参数；特性生成器改目录扫描并新增 `--check`。
- **去硬编码文案**：manifest / `index.html` / README / 开发指南不再写具体赛季与规则号，唯一真源是 `src/data/schedule.ts` 与 `metadata.ts`。

## 本轮进展（2026-07-09）：默认双打 · 赛季/规则集中化 · 高分队规则归属

分支 `feat/doubles-default-and-season-schedule`（**已合并进 main**）：

- **默认双打**：环境 / 速度线 / 计算器三处单双打 toggle 统一默认 `currentRuleSet.battleType`（M-B → 双打），单一来源。
- **赛季/规则单一来源** `src/data/schedule.ts`：区分两条独立时间轴——**规则**（M-A/M-B，按日期窗口解析）与 **PokeDB 赛季**（M-1…M-4，取自每日快照 `EnvironmentState.seasonLabel`，排期表作离线兜底）。Header 顶部文案改为「活值赛季 · 按日期规则」，不再硬编码 `Season M-3`，赛季更替后自动更新。导出 `seasonToRegulation` 与 `isRegulationRolloverDue`（更替提醒）。
- **高分队规则归属**：`sampleRegulation` 用 `seasonToRegulation(sample.season)` 派生——M-3/M-4 的 champs.pokedb.tokyo 排位高分队自动归 M-B（在「队伍一览」M-B 筛选下可见），M-1/M-2 归 M-A，VGCPastes 显式标签优先。消费端单点、对已提交快照即时生效、快照 JSON 保持纯数据、无需重抓。
- **M-3 真实数据**：抓取脚本加 `POKEDB_SAMPLE_SEASON` 覆盖用于定向回填；真实 M-3 高分队进快照仍由 **VPS 每日刷新 / automation PR** 负责（站点已滚到 M-4，下次刷新自然抓 M-3 并由上面的派生逻辑自动标 M-B）。

验证：完整 Vitest 套件通过、`tsc -b` 通过，两轮 codex review 通过。

## 已完成

### 产品与界面

- 默认环境页和 4 Tab 导航。
- 单打 / 双打环境榜、完整榜单、环境详情和数据口径页。
- **赛季排名变动 chip**（↑n / ↓n / NEW / `—`）：Worker 换季时把上一赛季的名次表写进快照，前端按 `pokemonId` join。只对比紧邻上一赛季，缺前序数据时完全不渲染。见开发指南 §5.3 / §6.3。
- 上位构筑导入、首次字段覆盖提示、导入后高亮和 Toast。
- 本地队伍 CRUD、成员编辑和 JSON 备份。（配队分析页上一轮已下线；分享图上一轮已砍，代码中不存在。）
- 规则图鉴、伤害计算与速度线收束到工具页，速度线已上线（超速反哺建议、环境参照档）。
- 深浅主题和滚动时自动隐藏底部导航。

### 数据

- 当前规则（M-B）allowlist **235 条**（真源 `src/data/seed/regMA/allowlist.ts` 的 `regMaPokemonAllowlistExpectedCount`，有单测门禁）。
- 当前 seed 包含本地宝可梦、形态、招式、learnset、道具、特性、Mega 和来源 manifest。
- 静态环境快照当前为 PokeDB **M-4**：单打 / 双打各 **235 个排名**，各含前 60 个宝可梦详情统计和队报样本。仓库内静态快照由 VPS automation PR 刷新，线上第一层由 Worker cron + KV 刷新，两者可能不同步。
- Worker 和静态维护脚本均动态探测最新赛季，并复用 PokeDB HTML 解析入口。
- 数据进入 UI 前经过 `EnvironmentDataset` 审计，未知引用会被报告并过滤。

### Cloudflare

- Worker 路由：`/health`、`/api/environment/status`、`/api/environment/latest`、`/api/pokemon/:pokemonId/teams`、受保护的 `/api/environment/refresh`。
- KV key：`environment:latest`、`environment:status`、`environment:team-index`、`environment:refresh-job`、`environment:pokedb-freshness-probe`（**5 个，赛季变动没有新增 key**，前序名次表放在 `environment:latest` 内部）。
- Cron 探针 + Durable Object 步进：`wrangler.jsonc` 配多个定点 Cron（围绕 PokeDB 每日 00:30 JST 发布窗口 + 稀疏兜底），cron 先发廉价 list 页请求，按「season + 更新日」内容签名（PokeDB 当前无 ETag/Last-Modified）比对；签名未变即廉价退出，有变化才创建刷新 job，再由 `EnvironmentRefreshDurableObject` 的 alarm 每约 1s 步进一次 cursor 分批刷新，完成后自动清理，失败重试上限 6 次（间隔 10min）。详见 `docs/DEVELOPER_GUIDE.md` §6.3。
- Worker 同时托管 Vite `dist`，支持 SPA fallback。
- GitHub Actions（`.github/workflows/ci.yml`）只跑 `npm test` / `npm run build` / Worker 校验，**不负责部署**；`main` 的实际部署由 Cloudflare Workers Builds（Git 集成）以 `cloudflare/environment-worker/wrangler.jsonc` 执行 `wrangler deploy`。
- **自定义域名（`luxraykit.com` / `www.luxraykit.com`）已启用**：`wrangler.jsonc` 的 `routes` 以 `custom_domain: true` 绑定两个裸主机名，deploy 时 Cloudflare 自动建橙云代理 DNS 并签证书。如需停用，注释该 `routes`（注意 deploy 不会自动删除已存在路由，需在 Dashboard 手动删一次）。

### 测试

- Vitest 覆盖 App、IndexedDB、导入导出、环境审计、PokeDB 转换、合法性、SP 与伤害 adapter。
- Playwright 离线用例覆盖环境、队伍持久化、备份，并断言速度线离线可用。
- 视觉回归覆盖 18 个移动端状态（CI-only，缺口见 `docs/qa/MOBILE_VISUAL_REGRESSION.md`）。

## 当前边界与已知问题

- 环境页已按 `x-luxray-cache-state` 显示「可能过期」等新鲜度状态；尚无显式手动“检查更新”按钮（每次加载已带 `?refresh=` 强制回源）。
- API 和静态快照都失败时使用开发 seed，加载失败页没有重试按钮。
- 伤害计算是 Gen9 主线公式近似，不是 Champions 官方公式。

## 当前验证命令

```bash
npm run data:pokedb:environment:check
npm test
npm run build
npm run worker:app:check
npm run test:pwa
npm run test:visual
```

> **下一轮路线与优先级见 [`docs/plans/product-roadmap-2026-08.md`](../plans/product-roadmap-2026-08.md)。**

## 仍未开始

- **Task 13 — 队报链接重做 + 双来源统一**（spike 先行）：PokeDB 队报链接多数落在没有实际加点的 X 截图贴，需要换落点或弱化入口。
- **Task 15 — 浅色主题品牌色重做**：浅色主题目前偏离 Luxray Kit 品牌色。
- **Task F — 伤害计算页排版重规划**：保留、低优先级，算法不动。

## 已知代码层待办

- `src/pages/SettingsPage.tsx`、`src/components/RuleSummary.tsx` 无任何引用，属死代码。
- （**非待办**）`src/pages/RulePage.tsx` 没有入口是**有意为之**，规则口径页由 owner 主动隐藏，勿改成可达。
- `src/data/schedule.ts` 的 `seasonSchedule` 需在每个赛季更替时追加新条目（缺表的赛季自 2026-09-02 起由 `sampleRegulation` 返回 `undefined`，只在「全部规则」视图可见，不再默认归 M-A）。**当前已补到 M-5**（M-B 的最后一个赛季，`sourceUrl` 已填 `page/803.html`）；下一个赛季同时是新规则 M-C，需要先编 catalog（见 M-C 计划阶段 B）。
- `src/data/speedTiers.ts` 的 `speedTierSeason` 落后线上环境一个赛季。
- 属性速查工具没有视觉基线（四个工具里唯一未覆盖）。
- `scripts/generate-ability-effects.mjs --check` 对 `catalog.ts` 抽到 0 条特性行（该文件的数组名是 `abilityRows`，`extractAbilityRows` 匹配不到）。改动前既有行为，目前不影响（`catalog.ts` 里的 Champions 专属特性是手写中文），但若日后直接在 `catalog.ts` 加特性行会被漏扫。
- `src/lib/dataAudit.test.ts` 写死 Mega 形态总数 75、招式接触基准集：M-C 阶段 B 加数据时会变红，属预期，届时按实际数量更新。

## 文档索引

- 开发者文档（架构 / Worker / 部署）：`docs/DEVELOPER_GUIDE.md`
- 范围边界：`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`
- 产品路线：`docs/plans/product-roadmap-2026-08.md`
- M-C 接入计划（阶段 A 已上线，阶段 B 待官方清单）：`docs/plans/regulation-mc-migration-2026-09.md`
- 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 数据来源：`docs/research/DATA_SOURCE_RESEARCH.md`
- 计算边界：`docs/research/CALC_ENGINE_SPIKE.md`
