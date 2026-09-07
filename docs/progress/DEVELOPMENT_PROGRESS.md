# Luxray Kit 开发进度

更新日期：2026-09-07

> 工程细节（架构 / Worker 刷新管线 / 部署）以 `docs/DEVELOPER_GUIDE.md` 为准，本文件只记录进度概要。

## 当前阶段

环境优先重构、Luxray Kit 品牌更新和 Cloudflare Worker 统一部署已进入 `main`。生产站点由 `luxraykit-app` Worker 提供静态资源与 API，环境页在线优先读取 KV 中的 PokeDB snapshot，并保留最新赛季静态快照和开发 seed 两级回退。

## 本轮进展（2026-09-07）：站内留言箱（Durable Object SQLite）

分支 `feat/feedback-inbox`（stacked 在 `perf/snapshot-etag-first-paint` 之上，PR base 为该分支）。

**起因**：PR #62 给「反馈」做的三个 GitHub issue 入口，owner 验收时否掉了——**三个入口都强制登录 GitHub，而且三个太多**。对一个不需要账号的本地优先 PWA 来说，登录墙是最高的一道门槛。改成不依赖 GitHub 的站内留言箱。

- **Worker：`/api/feedback`（`cloudflare/environment-worker/src/feedbackInbox.ts`）**。存储用 Durable Object 自带的 SQLite（migrations 追加 `v2` / `new_sqlite_classes`，**v1 未动**）：deploy 即建库，**零 Dashboard 操作**——D1 与新 KV namespace 都要 owner 先手工创建再把 id 填回配置。单实例 `idFromName('feedback-inbox')`。
  - `POST /api/feedback` 公开：body ≤ 4 KB，`message` trim 后 5–1000 字符，`contact` ≤ 120，`route` 走 `routePatterns` 白名单（与 `/api/ping` 同一份，不在就置空），`website` 蜜罐返回与真成功形状相同的 201 但不落库。
  - `GET /api/feedback?status=new|read|all&limit=50` / `PATCH /api/feedback/:id` `{status:'read'}` 复用 `ADMIN_REFRESH_TOKEN` Bearer 鉴权。
  - **限流在 DO 内做**（单实例天然串行，不需要锁）：同一 `client_key` 5 条 / UTC 日，全站 200 条 / UTC 日，越界 429。
  - **隐私边界**：不存 IP 原文——`client_key` = SHA-256(固定盐 + IP + 当天 UTC 日期) 取前 16 位，**在 Worker 里就算完**，DO 只见派生值且每天轮换；不存 UA 原文，只落 iOS / Android / Windows / macOS / other。
  - **Discord 推送**：secret `FEEDBACK_DISCORD_WEBHOOK` 存在时 `ctx.waitUntil` 发一条 embed，未设置静默跳过，推送失败只记日志（留言已落库）。
  - **preview 没有 DO 绑定**（`wrangler.preview.jsonc` 刻意不加），三个端点一律 503 `feedback_unavailable`。
  - 字段表、curl 示例与 secret 设置命令见开发指南 §6.8。
- **前端**：新路由 `#/profile/feedback`（`hashRoute.ts`，同步进 `routePatterns`，所以 ping 白名单自动包含它）+ 底部弹层 `src/pages/profile/FeedbackSheet.tsx`：三选一 chip（问题 / 建议 / 其他，默认建议）、计数 textarea、可选联系方式、隐藏蜜罐、自动附带 `__APP_BUILD__` / 数据版本 / 来源路由。草稿存 `sessionStorage`（误关不丢字，发送成功即清）；429 / 503 / 网络错误各给一句能据此行动的话，离线时禁用发送。
- **「我的」与引导**：「反馈与建议」三入口卡 → 一张「留言」卡 + 「写留言」按钮；「关于」把「复制版本信息」降为次要样式，卡底留一行小字「也可以在 GitHub 提 issue」。`branding.feedbackLinks` 只剩 `general`，`.github/ISSUE_TEMPLATE/` 保留（GitHub 侧仍有用）。引导末页三个 chip 与「发送反馈」都改成按钮：完成引导 + 跳到留言表单。

**测试怎么做的**：能纯化的判断（校验、`client_key` 派生、UA 归类、限流判定、Discord payload）全部导出成纯函数单测；SQL 收在 `FeedbackRepository` 接口后面，`feedbackInbox.test.ts` 用一个只认那几条语句的内存 `SqlLike` 假实现跑 insert / list / patch / 限流；`index.test.ts` 用 stub 的 `FEEDBACK_INBOX.get().fetch` 覆盖路由、鉴权、503、蜜罐、body 上限、Discord `waitUntil`。

验证：见本文件末尾的当前验证命令一节；数字与视觉基线结论写在 PR 里。

⚠️ 与上两轮同因：**本 PR 上没有 CI**（`ci.yml` 只在 `pull_request: branches: [main]` 触发，这是 stacked PR），数字来自本机。

## 上一轮进展（2026-09-07）：条件请求 · 首屏瘦身 · TeamPage 拆分

分支 `perf/snapshot-etag-first-paint`（stacked 在 `feat/hash-routing-share-feedback` 之上，PR base 为该分支）。一条主题：**打开环境首页要下载的东西太多**（实测约 345 KB gzip + 450 KB 未压缩快照）。首屏 JS 合计 **404,548 → 236,378 字节（-42%）**。

- **环境快照条件请求（ETag / 304）**：Worker 的 `handleLatest` 以 `environment:status` 的内容身份字段（`sourceUpdatedAt` / `selectedSeason` / `previousSeasonLabel`）生成 ETag，`cache-control` 从 `no-store` 改为 `private, no-cache`；命中 `If-None-Match` 返回 **304 且带全套 `x-luxray-*` 头**，并且**不读、不 `JSON.parse` 那份 450 KB 快照**（审计头改读 `status.audit`，老 KV 记录才回退解析）。新增 `x-luxray-refreshed-at`。前端去掉 `?refresh=` 与 `no-store`，改 `cache: 'no-cache'`，「抓取」时间优先取响应头。语义见开发指南 §5.3 / §6.1。
- **招式表移出首屏**：导入链是 `index → EnvironmentPage → regma-pokemon-catalog → regma-moves` —— 罪魁是 `catalog.ts` 里的 `export const moves = championsMoves`，它让**共享的**宝可梦 catalog chunk 静态依赖 362 KB 的招式表。现在 `moves` 的 re-export 独立成 `src/data/seed/regMA/moves.ts`；环境审计改用新生成产物 `move-ids.ts`（`scripts/generate-move-ids.mjs`，不联网，`dataAudit.test.ts` 做防漂移门禁）；招式对象由 `loadEnvironmentMoves()` 在进入宝可梦详情时动态 `import()`。**首屏实际下载的 JS 404,548 → 351,690 字节（-13%），14 个文件 → 13 个**，由新用例 `tests/pwa/first-paint-budget.spec.ts`（已挂进 CI 的 PWA 冒烟步骤）守住。
- **`calc-engine` 移出首屏**：`@smogon/calc`（115 KB gzip）被 index chunk 静态引入，但 `src/` 里只有 `damageAdapter.ts` 和 lazy 的 `CalculatorPage.tsx` 用它 —— 真凶是 Rollup commonjs 插件的虚拟模块 `\0commonjsHelpers.js` 在 `manualChunks` 里没有归属，被 Rollup 塞进 `calc-engine`；React / ReactDOM 是 CJS 包，index 需要这个 helper，于是 index 为几十字节的 helper 拉下整个计算引擎。现在 helper 单独归到 116 字节的 `vendor-helpers` chunk。**首屏 351,690 → 236,378 字节（-33%），13 个文件**；预算收到 260,000，`calc-engine` 也进了用例的禁载名单。产物核实：`index-*.js` 的静态 import 只剩 `vendor-helpers`，全 dist 只有 `CalculatorPage-*.js` 引 `calc-engine`。
- **`TeamPage` 拆分 + 补测**：1320 行单体按现有内部组件边界拆到 `src/pages/team/`（`MemberCard` / `MemberEditor` / `TeamListCard` / `TeamDialogs` / `HeldItem` / `teamDrag`），`TeamPage.tsx` 只剩 360 行编排；拖拽排序的纯逻辑抽成可测的 `teamDrag.ts`。两页各自一份的 `StatPointPicker` 合并成 `src/components/StatPointPicker.tsx`（min/max 按钮两种写法都被视觉基线钉住，保留 `boundsVariant` prop）。新增 `team/TeamPage.test.tsx`（10 例）与 `team/teamDrag.test.ts`（9 例）。**零像素变化。**

验证：`npm test` **469 通过**（41 文件）、`npm run build`（含 `tsc -b`）通过、`npm run test:pwa`（offline + team-samples + first-paint-budget）3 通过、`npm run worker:environment:check` 通过。

⚠️ 与上一轮同因：**本 PR 上没有 CI**（`ci.yml` 只在 `pull_request: branches: [main]` 触发，这是 stacked PR），数字来自本机。

## 更早一轮进展（2026-09-07）：hash 路由 · 队伍分享链接 · 反馈入口 · 匿名统计

分支 `feat/hash-routing-share-feedback`（stacked 在 `feat/mc-soft-landing` 之上，PR 待合并）。四件事，一条根因：App 此前**没有任何 URL 状态**，Android 物理返回键直接退出 PWA、无法深链、无法分享、无法按页面统计。

- **hash 路由（不引 react-router）**：`src/lib/hashRoute.ts` 纯函数 + `src/hooks/useHashRoute.ts`。路由表见开发指南 §4.1（`#/env`、`#/env/ranking|methodology|teams`、`#/env/pokemon/:id`、`#/teams[/:teamId]`、`#/tools[/calculator|dex|speed|typechart]`、`#/tools/dex/:id`、`#/profile`、`#/t/:code`）。
  - `AppShell` / `EnvironmentPage` / `TeamPage` / `DexPage` 各自读路由，因此 hook 由模块级 `useSyncExternalStore` 支撑；`navigate` 走 `pushState`（能把深度计数写进 `history.state`），`back()` 只在下一条历史确实是本 app 压的时候才 `history.back()`，否则 replace 到父路由——**冷启动打开分享链接后点返回不会跳出站外**。
  - 只有「去哪个页面」进 URL；筛选 / 搜索 / `battleType` / 弹窗 / 带入预设留在内存。
  - `RulePage` 仍**刻意没有路由也没有入口**。
  - 行为变化：**刷新停在当前页**（以前回首页），`tests/pwa/offline.spec.ts` 已按新行为断言。
- **队伍分享链接**（路线图 P2）：`src/lib/teamShare.ts`，`<origin>/#/t/<code>`。deflate-raw + base64url（前缀 `z1`），无 `CompressionStream` 时降级纯 base64url（`p1`），六只满配约 400 字符。格式与取舍见开发指南 §4.6。
  - 载荷**不含** notes / replicaCode / 任何本地 id。
  - 用字符串 id 而非 catalog 下标：下标换规则后会**静默指向另一个招式**。解码逐字段对当前 catalog 核对，查不到就**保留成员、清该字段、列一条中文 warning**，预览浮层全部展示后再由用户决定导不导。
  - 队伍详情加「分享」按钮（空队伍禁用，优先 `navigator.share`，否则复制链接）；`TeamSource` 新增 `share-link-import`。
- **反馈入口**：`.github/ISSUE_TEMPLATE/`（bug / feature / `blank_issues_enabled: true`）、`branding.ts` 的 `feedbackLinks`；引导第 5 页三个 chip 从 `<span>` 变成真链接，末页「发送反馈」先开 issue 再完成引导；「我的」新增「反馈与建议」卡与「关于」卡（产品 / 规则 / 数据版本 / 构建标识 + 「复制版本信息」）。构建标识由 `vite.config.ts` 的 `define` 注入 `__APP_BUILD__`（git short SHA，取不到退化为时间戳）。
- **匿名使用统计**：Workers Analytics Engine 数据集 `luxraykit_pageviews`，无第三方脚本、无 cookie、无任何标识符。`POST /api/ping` 只收去参数的路由模式 / 是否 PWA / 主题，加 Cloudflare 自己解析的国家码；**不记录 IP、UA 原文、任何 id 或用户内容**。校验白名单直接从 `src/lib/hashRoute.ts` 导入，前后端同一份路由表；非法输入与合法输入一样静默 204。「我的」有开关（`UserPreference.analyticsOptOut`，默认开启），`import.meta.env.DEV` 下不发。字段表与查询方式见开发指南 §6.7。

验证：`npm test` **441 通过**（39 文件）、`npm run build`（含 `tsc -b`）通过、`npm run test:pwa`（offline + team-samples）2 通过、`npm run worker:environment:check` 通过。

视觉基线重建（`visual-baseline.yml`）：**只有 13「我的」变了**（多了统计开关 + 反馈与建议卡 + 关于卡）。**05「队伍详情」没变**——新增的分享按钮是 36×36，占 390×800 视口不到 0.5%，被 2% 像素阈值吞掉了。已在浏览器里用真实构建产物核对：按钮在 x=323 / 36×36，完全在视口内、不压标题，点击能生成链接并弹「链接已复制」toast。这正是 `docs/qa/MOBILE_VISUAL_REGRESSION.md` 里那条「基线没变 ≠ UI 没变」的实例。

⚠️ **本 PR 上没有 CI**：`ci.yml` 只在 `pull_request: branches: [main]` 触发，而这是 stacked 在 `feat/mc-soft-landing` 上的 PR。`test` 与 `visual` 两个门禁要等 PR #61 合并、本 PR 改 base 到 `main` 之后才会跑。上面的数字全部来自本机。

## 更早两轮进展（2026-09-07）：M-C 软着陆 · 回退层新鲜度 · SW 预缓存 manifest · 清理

分支 `feat/mc-soft-landing`（PR 待合并）。目标是**开赛后线上不出现用户视角不可接受的降级**，不做阶段 B（切 `currentRuleSet`、落 M-C catalog 数据）：

- **M-C 窗口进 `schedule.ts`**：`2026-09-09T02:00Z` → `2026-12-02T01:59Z`（[官方公告](https://news.pokemon-home.com/en/page/816.html)）。**不动 `currentRuleSet`、不加 M-6 赛季**（未公布）。`isRegulationRolloverDue` 跟的是 catalog 不是 schedule，所以补了窗口后仍持续报「该滚了」。
- **「图鉴更新中」提示**：schedule 解析出的当前规则与 catalog 的规则不一致时，环境首页头部渲染一条提示（两个规则号都从数据推导，下次滚动无需改文案）。
- **未知宝可梦不再从榜单整行剔除**：以前 `pokemonKeyToId` 查不到就丢行，导致下面所有名次整体上移一位（UI 的名次就是数组下标）。现在保留为 `pokedb:<key>` 哨兵，前端渲染不可点的占位行 + 「图鉴待补」chip，完整榜搜索按页面原名匹配。审计契约不变：key 照旧进 `unknownPokemonKeys`，Worker 零容忍审计该 degraded 仍 degraded。队伍样本 slot 里的未知宝可梦维持剔除，未扩。
- **静态回退层新鲜度**：刷新 PR 脚本以前只在 Worker 不健康时抓取，Worker 一直健康 = 第二层永不更新（实测停在 2026-07-18 的 M-4）。现在额外比较本地快照 `battles.*.updatedAt` 与响应头 `x-luxray-latest-source-updated-at`，落后超过 `STATIC_SNAPSHOT_MAX_LAG_DAYS`（默认 7）天也刷。
- **生成产物刷新到 M-5**：静态环境快照 → 2026-09-07 07:18；`speedTiers.ts` 从 M-3 → M-5（`speedTierSeason` 3→5，SpeedPage 头部文案随之改变）。视觉基线 **未**重建：`visual-baseline.yml` 实测 18 张全部与现状一致，因为速度线用例截图前 `scrollBy(0, 120)` 已把「PokeDB M-{season} 静态参照」头部滚出视口——这条文案不在视觉门禁覆盖范围内，缺口已记入 `docs/qa/MOBILE_VISUAL_REGRESSION.md`。
- **SW 预缓存 manifest**：`sw.js` 里手写的 ~120 条道具图标路径改为构建期从道具 catalog 的 `iconRef` 生成 `dist/precache-manifest.json`（当前 148 条），`CACHE_NAME` 升到 `champions-tool-v8`；新增「新版本已就绪，刷新以更新」toast。
- **CSP**：`public/_headers` 加 `Content-Security-Policy`（同源为主；`style-src`/`font-src` 额外放行 Google Fonts，因为 `styles.css` 的 DM Sans 远程 `@import` 无法被 Vite 内联）。`_headers` 只在 Cloudflare 生效，**上线后需人工在生产 DevTools 确认无违规**。
- **死代码清理**：见下方「已知代码层待办」。

验证：`npm test` 376 通过、`npm run build`（含 `tsc -b`）通过、`npm run test:pwa`（offline + team-samples）2 通过、`npm run worker:environment:check` 通过。

## 更早三轮进展（2026-07-09）：默认双打 · 赛季/规则集中化 · 高分队规则归属

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
- **URL hash 路由**：四个 Tab 与所有二级页面可深链、可收藏、可用物理返回键后退（路由表见开发指南 §4.1）。
- **队伍分享链接** `#/t/<code>`：详情页一键生成，对方先看预览与失效项 warning 再决定导入（格式见开发指南 §4.6）。
- **站内留言**：引导末页与「我的 → 留言」都进 `#/profile/feedback` 表单，**不需要 GitHub 账号**；留言不公开，存 Cloudflare Durable Object SQLite，新留言推 Discord（见开发指南 §6.8）。「我的 → 关于」可一键复制版本信息，并保留一个 GitHub issue 出口。

### 数据

- 当前规则（M-B）allowlist **235 条**（真源 `src/data/seed/regMA/allowlist.ts` 的 `regMaPokemonAllowlistExpectedCount`，有单测门禁）。
- 当前 seed 包含本地宝可梦、形态、招式、learnset、道具、特性、Mega 和来源 manifest。
- 静态环境快照当前为 PokeDB **M-5**（源更新 2026-09-07 07:18）：单打 / 双打各 **235 个排名**，各含前 60 个宝可梦详情统计和队报样本。仓库内静态快照由 automation PR 刷新，线上第一层由 Worker cron + KV 刷新，两者可能不同步；刷新触发条件见开发指南 §7.1。
- Worker 和静态维护脚本均动态探测最新赛季，并复用 PokeDB HTML 解析入口。
- 数据进入 UI 前经过 `EnvironmentDataset` 审计，未知引用会被报告并过滤。

### Cloudflare

- Worker 路由：`/health`、`/api/environment/status`、`/api/environment/latest`、`/api/pokemon/:pokemonId/teams`、受保护的 `/api/environment/refresh`、`POST /api/ping`（匿名页面访问计数）。
- Analytics Engine 数据集 `luxraykit_pageviews`（binding `LUXRAY_ANALYTICS`，preview 与生产共用；AE 首次写入自动创建，Dashboard 无需预建）。
- KV key：`environment:latest`、`environment:status`、`environment:team-index`、`environment:refresh-job`、`environment:pokedb-freshness-probe`（**5 个，赛季变动没有新增 key**，前序名次表放在 `environment:latest` 内部）。
- Cron 探针 + Durable Object 步进：`wrangler.jsonc` 配多个定点 Cron（围绕 PokeDB 每日 00:30 JST 发布窗口 + 稀疏兜底），cron 先发廉价 list 页请求，按「season + 更新日」内容签名（PokeDB 当前无 ETag/Last-Modified）比对；签名未变即廉价退出，有变化才创建刷新 job，再由 `EnvironmentRefreshDurableObject` 的 alarm 每约 1s 步进一次 cursor 分批刷新，完成后自动清理，失败重试上限 6 次（间隔 10min）。详见 `docs/DEVELOPER_GUIDE.md` §6.3。
- Worker 同时托管 Vite `dist`，支持 SPA fallback。
- GitHub Actions（`.github/workflows/ci.yml`）只跑 `npm test` / `npm run build` / Worker 校验，**不负责部署**；`main` 的实际部署由 Cloudflare Workers Builds（Git 集成）以 `cloudflare/environment-worker/wrangler.jsonc` 执行 `wrangler deploy`。
- **自定义域名（`luxraykit.com` / `www.luxraykit.com`）已启用**：`wrangler.jsonc` 的 `routes` 以 `custom_domain: true` 绑定两个裸主机名，deploy 时 Cloudflare 自动建橙云代理 DNS 并签证书。如需停用，注释该 `routes`（注意 deploy 不会自动删除已存在路由，需在 Dashboard 手动删一次）。

### 测试

- Vitest 覆盖 App、IndexedDB、导入导出、环境审计、PokeDB 转换、合法性、SP 与伤害 adapter。
- Playwright 离线用例覆盖环境、队伍持久化、备份，并断言速度线离线可用；`first-paint-budget.spec.ts` 守住环境首页首屏的 JS 预算与禁载 chunk。
- 视觉回归覆盖 18 个移动端状态（CI-only，缺口见 `docs/qa/MOBILE_VISUAL_REGRESSION.md`）。

## 当前边界与已知问题

- 环境页已按 `x-luxray-cache-state` 显示「可能过期」等新鲜度状态；尚无显式手动“检查更新”按钮（每次加载都会带 `If-None-Match` 回源验证，内容没变时拿 304，body 走浏览器 HTTP 缓存）。
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

- **M-C 阶段 B 未做**：`currentRuleSet` 仍是 `reg-mb`，M-C catalog（新宝可梦、道具、allowlist 行）尚未编写。官方完整清单未公布前不动，`isRegulationRolloverDue` 会持续报提醒。落地前榜单里的新宝可梦按 `pokedb:` 哨兵渲染占位行。
- `src/data/schedule.ts` 的 `seasonSchedule` 需在每个赛季更替时追加新条目（缺表的赛季 `sampleRegulation` 返回 `undefined`，其高分队样本只在「全部规则」视图可见，不再静默归 M-A）。**当前补到 M-5**；M-6 的官方公告尚未上线，出现后追加（格式照 M-5 的 `sourceUrl`）。
- （**非待办**）`src/pages/RulePage.tsx` 没有入口是**有意为之**，规则口径页由 owner 主动隐藏，勿改成可达。
- 属性速查工具没有视觉基线（四个工具里唯一未覆盖）。
- 分享链接预览浮层（`#/t/<code>`）没有视觉基线：用例得先决定合法 code 从哪来（写死会随 catalog 变动失效）。当前由 `App.test.tsx` 的 RTL 用例覆盖。
- `#/api/ping` 上线后需人工确认 Analytics Engine 里确实出现 `luxraykit_pageviews` 数据集并有行写入（AE 数据集是首次写入才创建，本地 dry-run 只能验证 binding 存在）。
- `src/styles.css` 首行远程 `@import` Google Fonts（DM Sans）：Vite 无法内联，所以 CSP 必须放行两个字体域名。自托管字体后可收紧。

## 文档索引

- 开发者文档（架构 / Worker / 部署）：`docs/DEVELOPER_GUIDE.md`
- 范围边界：`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`
- 产品路线：`docs/plans/product-roadmap-2026-08.md`
- 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 数据来源：`docs/research/DATA_SOURCE_RESEARCH.md`
- 计算边界：`docs/research/CALC_ENGINE_SPIKE.md`
