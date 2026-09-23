# Luxray Kit 开发者文档

面向贡献者的工程说明，描述 `main` 当前的工作方式。冲突时 **代码 > 本文件 > 其他文档**（分级见 §10）；业务机制与红线见 [AGENTS.md](../AGENTS.md)。清单类信息（路由、npm 脚本、chunk、KV key…）以指向的源文件为准。

---

## 1. 项目概览

移动端优先的 Pokémon Champions 对战辅助 PWA：

- **纯前端 SPA**（React 19 + Vite 7 + TS 5.8 + Tailwind 3，`lucide-react` 图标），无后端业务数据库，用户数据只存本地 IndexedDB（手写 `lib/db.ts`，无 ORM）。
- **无 react-router**：URL hash 路由（§4.1）。**手写 PWA**：`public/manifest.webmanifest` + `public/sw.js`（§4.5）。
- 伤害计算用 `@smogon/calc` Gen9 公式 + 自采 Champions 参数；速度用自有 Champions SP 公式。
- **单一 Worker `luxraykit-app`**：同时托管 `dist/`、`/api/*`、cron + Durable Object 刷新管线、Analytics Engine 与留言箱（§6）。经 Cloudflare Workers Builds 在 `main` 更新时部署（§9）。
- **环境数据三级回退**：Worker KV 快照 → 静态 JSON 快照 → 内置 seed，断网或 Worker 不可用仍可启动（§5.3）。
- 包名 `pokemon-champions-assistant` 是历史名，与 IndexedDB 库名同源；改包名时**不要**连带改库名（AGENTS.md §2）。

---

## 2. 快速开始

- **开发平台 macOS**，除视觉回归外全部命令原生可跑，不需要 Docker。
- **Node 24.19.0**：`.node-version`（精确）、`package.json` `engines`（`>=24.0.0`）、CI（`node-version: 24`）三处对齐。`.node-version` 也决定 **Workers Builds** 的生产构建 Node 版本。
- `npm ci` 打印的 `npm warn allow-scripts`（esbuild / sharp / workerd / fsevents）可以忽略。
- 命令见 `package.json` `scripts`。要点：`npm run dev` 绑定 127.0.0.1（建议用手机模拟器调试）；`npm run build` = `tsc -b` 全量类型检查 + `vite build`；`npm run test:pwa` 用本机 Chrome、不含视觉用例；`test:visual*` 是 **CI-only**（§8）。
- `npm run dev` 不注册 SW；但旧 SW 还在时（或 `npm run preview` 下）可能拿到旧资源，在 DevTools → Application → Service Workers 注销后硬刷新。

---

## 3. 目录结构

只列不看文件就猜不到的部分：

```
src/
  App.tsx               # AppShell：从 hash 路由派生页面，环境数据加载，导入 / 分享流程
  state/AppContext.tsx  # 全局 store（§4.2）
  lib/                  # 纯逻辑层（无 React，便于单测）
    hashRoute.ts        # ★ 路由表唯一真源；Worker 的 /api/ping、/api/feedback 白名单也复用它
    pokedbEnvironment.ts # PokeDB HTML 解析——前端、Worker、脚本三方共用（§5.4）
  data/
    schedule.ts         # ★ 规则 / 赛季两条时间轴的唯一真源
    environment.ts      # 环境数据加载管线（§5.3）
    environmentDatasetSeed.ts  # 4 只宝可梦的开发样例，最后一级回退
    pokemonFacts.ts     # 事实池（§5.2，当前无 UI 消费方）
    seed/regMA/         # 版本化规则 seed；目录名是历史遗留，与当前规则无关（§5.1）
    external/           # 外部抓取产物 + 两个手写名称映射（§7）
  components/kit/       # 设计系统组件，见 DESIGN_SYSTEM.md
cloudflare/environment-worker/   # 生产 Worker（§6）
cloudflare/build-notifier/       # preview 构建 → Discord 的 Queue consumer（§9）
scripts/                         # 数据维护脚本（§7）；scripts/archive/ 为历史脚本，不要运行
public/_headers                  # CSP 等响应头，只在 Cloudflare 生效（§4.5）
tests/pwa/                       # Playwright 规格 + fixtures + 视觉基线（§8）
docs/                            # archive/ 不代表现状；plans/ 是待实施计划，同样不是现状（§10）
```

---

## 4. 前端架构

视觉层（颜色 token、字阶、控件档位、材质、`src/components/kit/`）见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)。

### 4.1 组件树与路由

`main.tsx` → `App` → `ErrorBoundary` → `AppProvider` → `AppShell`。路由全集见 `src/lib/hashRoute.ts` 的 `Route` 联合类型与 `parseHashRoute`（纯函数：`parseHashRoute` / `buildHash` / `parentRoute` / `tabForRoute` / `routeForTab` / `routePattern` + 白名单 `routePatterns`）。不直观的点：

- 空或无法识别的 hash 用 `history.replaceState` 归一化到 `#/env`，**不留历史记录**。id 先按 `/` 切段再 `decodeURIComponent`，含斜杠的 id 不会撑破路径。
- 成员编辑器是整页路由 `#/teams/:teamId/members/:memberId`；`RulePage` 从「我的」经 `#/profile/rule` 进入；`#/t/:code` 是分享预览（§4.6）；`#/profile/feedback` 是留言弹层（§6.8）。
- **只有「去哪个页面」进 URL**：筛选、搜索、`battleType`、选人 / 命名弹窗、编辑器的选择页、成员「带入」工具的预设（`calcPreset` / `speedPresetMemberId` / `calculatorMemberId`，带本地成员 id）都留在内存 state。
- `hooks/useHashRoute.ts` 由**模块级 `useSyncExternalStore`** 支撑，同一次渲染里所有消费者读到同一个 route。
  - `navigate()` 用 `pushState` / `replaceState`（不要改成赋值 `location.hash`），把深度写进 `history.state`；同时订阅 `hashchange` + `popstate`。
  - `back()` 只在 `history.state.lkDepth > 0` 时调 `history.back()`，否则 `replace` 到父路由：冷启动打开深链后点「返回」不跳出站外。
- **成员编辑器的同 URL 历史层**（`hooks/useHistoryLayer.ts`，压 `lkDepth + 1`）：
  - **守卫层**在编辑器打开时就压（不要改成第一次改动时才压）。返回键弹出它时：有改动 → 弹「放弃改动确认」并重新压回；没改动 → 离开。
  - 编辑器所有出口（保存、放弃、去速度线 / 伤害计算、移除成员）都必须走 `leave()` = `close(then)`：先 `history.back()` 掉守卫层，**等 popstate 到了**再离开。不要连着调两次 `history.back()`。
  - **选择页层**：招式 / 道具 / 特性 / 性格 / 形态选择页与换宝可梦弹窗各压一条，返回键只关选择页；选择页自己关闭时 `close()` 弹掉它。
  - 卸载时**不**自动 `history.back()`（最坏多留一条同 URL 记录）。**不要推广到所有 Sheet**。
- **弹层键盘与焦点**：`kit/Sheet` 与各处手写 `role="dialog"` 都走 `hooks/useDialogFocus.ts`——打开时焦点移入（已有 autofocus 输入框则不抢），Esc 只关最上层，关闭后焦点还给触发按钮。新弹层用 `Sheet`；非手写不可时容器加 `ref` + `tabIndex={-1}` 并调这个 hook。
- 代码里的 `typeChart` 与 URL 里的 `typechart` 由 `App.tsx` 顶部两张映射表互转，不要在别处再写一份。
- 刷新页面停在当前页（`tests/pwa/offline.spec.ts` 断言）；页面全部 `React.lazy` 懒加载（§4.4）。
- 队伍页子组件在 `src/pages/team/`（编辑器相关在 `team/editor/`）。**没有拖拽排序**：⋯ 菜单「移至首位」写 `sortOrder`。**SP 选择只有一份** `team/editor/StatWheel.tsx`，编辑器与伤害计算器（`pages/calculator/SideEditorPage.tsx`）共用。

### 4.2 全局状态：`AppContext`

`useAppStore()`（Provider 外调用抛错）提供 `teams` / `preferences` / `lastRefreshError` 与写操作（见 `state/AppContext.tsx`）。

- **单队写入乐观更新**（`saveTeam` / `deleteTeam` / `addTeam`）：先改内存再写库；失败只回滚**这一支**（别的队伍的改动保留），`lastRefreshError` 提示「本机存储写入失败」。
- **整体替换先写后显示**（`replaceTeams` / `clearLocalData`）：写失败时存储与界面都停在旧列表。
- 在同一 handler 里连续写入时读 `teamsRef`（最新列表），不要读闭包里的 `teams`。
- IndexedDB 打不开 → 纯内存模式（写入跳过、不逐个 reject），提示「当前仅能使用内存数据」。
- **队伍组成规则**（`lib/teamComposition.ts`：同种只能一只、Mega 算原形态；同一道具一人；SP 上限）只由 `updateMember` 强制——违规返回原因、不写入。`saveTeam`（也承载导入与整队改写）不强制：已违规数据照常落库、只报告，不静默改写。`lib/teamShare.ts` 的 `canShareTeam` 拒绝违规队伍。
- 新建队伍排最前（`nextTopSortOrder`）；`normalizePreferences` 兜底合并 `defaultPreferences`。

### 4.3 本地持久化：`lib/db.ts`

- 库名 `pokemon-champions-assistant`（**永不可改**），`DB_VERSION = 2`；store `teams`（keyPath `id`）与 `meta`（keyPath `key`：`preferences` / `initialized` / `schemaVersion`）。首次启动写入 `defaultTeams` + `defaultPreferences` 并置 `initialized=true`。
- 写入经 `runTransaction`，**以事务 `complete` 为成功**（配额不足以 `abort` 出现）；`replaceTeams` 的 `clear()` 与全部 `put` 同一事务，任一行抛错整体中止。
- 改 schema 必须递增 `DB_VERSION` 并在 `onupgradeneeded` 按 `oldVersion` 补迁移。v2 把旧 EV 迁到 `statPoints`（`migrateLegacyEvStatPoints`）。
- `migrateLegacyStarterTeam` 把旧「M-A 测试队」换成当前 `defaultTeams[0]`，**仅当它从没被编辑过**（`updatedAt` 仍是种子时间 `2026-04-26T16:00:00.000Z`；每次保存都会改写它）。

### 4.4 构建分包

chunk 划分见 `vite.config.ts` 的 `manualChunks`（`vendor-helpers` / `calc-engine` / `regma-moves` / `regma-pokemon-catalog`，路径先做 `\\`→`/` 归一化）。

- 新增大 seed 文件时考虑并入既有 chunk；**新增规则时给虚拟模块（`\0` 开头，如 `\0commonjsHelpers.js`）显式归属**，否则它跟着第一个匹配到的规则走。
- **首屏预算**：`tests/pwa/first-paint-budget.spec.ts` 打开 `#/env`、等 Top 5 榜单与上位构筑卡片渲染完，断言 ① 未请求 `regma-moves` / `calc-engine`，② 实际拉取的 JS（`PerformanceResourceTiming.transferSize`）≤ 260,000 字节。抬预算是产品决定，要带新数字写进 PR。口径是实际下载的 JS，不是 chunk 名。
- 不要从首屏可达的模块静态 import 招式表：`moves` 的 re-export 放在 `seed/regMA/moves.ts`，环境审计用生成的 `move-ids.ts`，招式对象由 `loadEnvironmentMoves()` 进详情时动态 `import()`。
- `@smogon/calc` 只能由 `damageAdapter.ts` 与 lazy 的 `CalculatorPage.tsx` 引用。

### 4.5 Service Worker（`public/sw.js`）

手写，无 Workbox。每个构建一份缓存，install 时预缓存 shell 与**全部** hashed chunk；`/api/*` **永不**读写离线缓存。

- **清单由构建注入 `dist/sw.js`**：`vite.config.ts` 的 `luxraykit-precache-manifest` 插件在 `closeBundle` 调 `scripts/precache-manifest.mjs`，把 `public/sw.js` 开头的占位行 `const BUILD = { version: 'dev', assets: [], itemIcons: [] };` 换成真实值（`assets` = `dist/assets/` 顶层全部文件，约 71 个、2.7 MB 未压缩；`itemIcons` = 道具 `iconRef`，当前 166 条；`version` = 两者 + `index.html` 的 sha256 前 12 位）。占位行找不到就构建失败。清单必须内嵌在 `sw.js` 里（不要改成另发 JSON）：浏览器只在 `sw.js` 字节变化时才安装新版。
- **缓存**：`luxraykit-shell-<version>`（shell + 快照 + chunk，随版本整份替换）；`luxraykit-runtime`（精灵图、道具图标，按 id 命名，跨版本保留）。activate 删其余所有缓存（含旧的 `champions-tool-v*`）。install 复制旧版已有的同名 chunk 不重下；shell 用 `cache: 'reload'` 取，并校验 `index.html` 引用的 `/assets/*` 都在本版清单里，否则 install 失败、保留旧版。chunk 缺失让 install 失败，单个道具图标失败不会。
- **请求策略**：导航一律返回**本版缓存的 shell**（不走网络优先），页面与 chunk 永远同一构建。chunk 缓存优先；快照、精灵图等其余同源 GET 缓存优先 + 后台更新。所有 `caches.match` 必须带 `ignoreVary`（服务器回 `Vary: Origin` 时——`vite preview` 就会——不带就全部 miss）。
- **新版本提示**：**不自动 `skipWaiting`**；新版 waiting 期间已开的标签页继续用旧缓存。`lib/serviceWorker.ts` 在 `updatefound → installed`（或启动时已有 `registration.waiting`）且页面已有 controller 时派发 `luxraykit:service-worker-updated`，`ServiceWorkerUpdateToast` 显示「新版本已下载 · 重载」；点重载发 `SKIP_WAITING`，`controllerchange` 后所有旧标签页必须 reload（旧缓存已删，未加载的 chunk 会 404）。忽略提示则下次冷启动生效。回到前台（`visibilitychange`）主动 `registration.update()`。首次安装不提示。
- **构建号**：`__APP_BUILD__` 取 `git log -1 -- . ':(exclude)public/data'`，不要改成 HEAD——它编进 index chunk，用 HEAD 会让每天的纯数据部署都换 chunk hash、每天弹一次更新。shallow clone 时退化为 HEAD。
- **CSP**（`public/_headers`）以同源为主，只放宽 `style-src 'unsafe-inline'`（React inline style）。字体不放行外域：Manrope 自托管在 `src/assets/fonts/`（拉丁 + 数字子集，OFL），中文走系统字体；不要加远程 `@import`（CSP 会静默丢掉）。`_headers` **只在 Cloudflare 生效**，`vite preview` 与 Playwright 看不到，改动只能上线后在生产 DevTools 人工核对。

### 4.6 队伍分享链接（`lib/teamShare.ts`）

`<origin>/#/t/<code>`，只承载「别人重建这支队伍所需的东西」：队伍名 + 每个成员的 `pokemonId` / `formId` / `abilityId` / `itemId` / `nature` / `moveIds`(≤4) / 6 项 SP / `level`。**不带** `notes`、`replicaCode`、任何本地 `id`（导入时重新生成）。

```
record 0   : 队伍名；record 1.. 每个成员一条，字段定序、缺省留空
分隔符      : record = U+001E，field = U+001F（控制字符，名称里出现直接剔除，无需转义层）
压缩        : deflate-raw → base64url，前缀 z1；无 CompressionStream（老 Safari）时纯 base64url，前缀 p1；解码两种都认
```

- 压缩：`formId === pokemonId` 省略、SP 末尾 0 截掉、`level === 50` 省略、末尾空字段截掉。六只满配约 400 字符。
- **解码上限**：code > `MAX_TEAM_SHARE_CODE_LENGTH`（4096）直接拒；`z1` 边读边解压，超过 `MAX_TEAM_SHARE_PAYLOAD_BYTES`（16 KB）即中止。不要去掉这两个上限。
- 字段一律用字符串 id，不要改成 catalog 下标。`decodeTeamShare` 逐字段对当前 catalog 核对，查不到时**保留成员、清掉该字段、记一条中文 warning**；SP 用 `clampStatPointValue` 夹紧，总量超 66 也记 warning。预览把 warnings 全列出来再让用户决定。
- 导入后 `source.kind = 'share-link-import'`（`types.ts` + `teamSchema.ts` 的 `normalizeTeamSource`）。

---

## 5. 数据层

### 5.1 Seed（`src/data/seed/regMA/`）

当前规则的版本化静态数据（catalog 分 batch、形态、Mega、招式、learnset、道具、特性、allowlist、性格、默认队伍、来源 manifest），`metadata.ts` 提供 `currentRuleSet` / `currentDataVersion` / `defaultPreferences`，`src/data/index.ts` 统一 re-export。目录名 `regMA/` 与当前规则无关。

`currentRegulation`（`data/environment.ts`）由 `currentRuleSet.id` 经显式映射表 `ruleSetRegulationIds` 得出，作为队伍样本浏览的默认视角。**映射缺失直接抛错**，不兜底——规则滚动时必须同时补这张表。

### 5.2 趣味小知识事实池

> `src/data/pokemonFacts.ts` 目前**没有 UI 消费方**；事实池、生成脚本与 CI 校验仍保留。

- 只从 `pokemon.filter(legalInCurrentRule)` 构造；事实全部是有游戏版本标注的图鉴轶闻，不生成「当前规则数据推导」文案（种族值变化、能力值排名等）。
- `scripts/generate-pokemon-facts.mjs` 从 allowlist 取唯一全国图鉴号，低并发请求 PokeAPI `/pokemon-species/{id}/`，只留 `zh-hans` 且长度合适的文本，按数字、生态、行为与传说细节评分（泛化战斗文案降权）；响应缓存在 gitignored 的 `tmp/pokemon-facts-cache/`。产物 `src/data/external/pokeapi/pokemon_facts.json`，运行时不请求外站。
- `data:pokemon-facts:check`（不联网，CI 必跑）要求：`ruleSetId === currentRuleSet.id`；每条图鉴号仍在 allowlist；文本与编号不重复；正文 18–48 字且无任何空白字符；来源、版本、评分齐全；有效事实 ≥ 80 条。规则切换后必须重新生成，否则 CI 失败。
- `createDailyFactSequence` 用 `currentRuleSet.id + 日期` 确定性洗牌：同一天同一条，走完整序列前不重复。
- 52Poké 只用于人工交叉核验，不要自动抓取（许可为署名 / 非商业 / 相同方式共享，robots 限制自动抓取）。

### 5.3 环境数据加载管线（`src/data/environment.ts`）

`loadEnvironmentState()` 是前端读取环境数据的唯一入口：

1. **Worker 快照** `GET /api/environment/latest`：`cache: 'no-cache'`，**不要加 `?refresh=` 之类查询串**；没变时 304（§6.1）。
   - `freshness` / `sourceStatus` 取自响应头 `x-luxray-cache-state`、`x-luxray-source-status`、`x-luxray-latest-source-updated-at`（探针已知的上游最新时间）。
   - body 可能来自 HTTP 缓存，**抓取时间以响应头为准**：`updatedAt` 优先 `x-luxray-refreshed-at`，缺失才用 body 的 `retrievedAt`。SW 对 `/api/*` 直连，这层只靠浏览器 HTTP 缓存。
   - Worker `stale` / `degraded` 时再读静态快照、按源更新时间取较新的一份；静态快照追平探针时间时标 `fresh`。
2. **静态快照** `/data/pokedb/reg-ma-environment.json`（`force-cache`）：Worker 降级比较、纯静态部署与离线用。
3. **内置 seed** `environmentFallbackState`：始终可用。

- 拿到 base 快照后懒加载 VGCPastes 样本（`loadVgcPastesTeamSamples`），按 regulation 拆成独立 build chunk（当前 `reg_mb_*` / `reg_mc_*`），`loadVgcPastesRegulationFile` 各自 try/catch，单文件失败只少一批样本。
- **过渡代码 `backfillStatPointStats`**（标 `TRANSITIONAL`，能力ポイント 解析的 Worker 上线 `main` 后连调用点一起删）：API 快照**所有行**都缺 `statPointStats` 时，按同 battle type / 宝可梦 / **同赛季**从静态快照补，跨赛季不补；字段存在（哪怕空数组）即权威。Worker fresh 时补数据额外以 `no-cache`（不要用 `force-cache`）请求一次静态快照。
- `PokeDbEnvironmentSnapshotPayload` 支持 statistics / trainer-list / open-data ranked-teams 三种形态，由 `isStatisticsPayload` / `isTrainerListPayload` 分派。

#### 未知宝可梦的哨兵占位行

PokeDB 榜单里本地 catalog 查不到的宝可梦**保留为占位行，不要丢**（UI 名次就是数组下标）。

- `parsePokeDbPokemonListPage` 保留查不到映射的行，`pokemonId` = 哨兵 `pokedb:<pokeDbKey>`（如 `pokedb:0812-00`），`pokemonName` 取原名；整页**一个都**映射不上时抛错。
- `audit.unknownPokemonKeys` 照常记录，Worker 零容忍审计照常 degraded——这是补映射的信号，不要放宽。
- `normalizeUsage` 对 `pokedb:` 前缀标 `unresolved: true`、留 `displayName`，记 **`unresolved-pokemon-ref`**（保留）；区别于 `missing-pokemon-ref`（剔除）。
- `EnvironmentPage` 对哨兵行渲染 `UnresolvedRankingRow`：通用头像 +「图鉴待补」，**不是 button**；完整榜搜索按 `displayName` 匹配。
- **队伍样本 slot 里的未知宝可梦照常剔除**。

#### 赛季排名变动（`lib/seasonRankDelta.ts`）

快照可带 `previousSeason`（`SeasonRankSnapshot`：`season` / `seasonNumber` / `ranks.{singles,doubles}` 的 `pokemonId → 名次`，单 battle type 约 3.7 KB），由 Worker 换季时写入（§6.3），前端据此渲染 ↑n / ↓n / NEW。三条硬约束：

- **只对比紧邻上一季**：`isImmediatePredecessor` 要求 `seasonNumber === 当前 - 1`，否则整段丢弃。
- **没有前序快照就完全不渲染 chip**，不显示 0 或猜测值；「无数据」与「没变化」（渲染 `—`）必须可区分。
- **PokeDB 只公布名次、不公布绝对使用率**，chip 永远是名次变化，文案别写成使用率。

### 5.4 数据审计（`lib/environmentDataset.ts`）

进入 UI 的环境数据先经 `auditEnvironmentDataset(dataset, catalog, expectedMetadata)`：未知的宝可梦 / 招式 / 道具 / 特性 / 性格引用记入 `auditIssues` 并从展示中剔除（`environmentCatalog` 由 seed 派生）。Worker `ENVIRONMENT_AUDIT_UNKNOWN_THRESHOLD`（默认 0）用的是同一套逻辑。

`pokedbEnvironment.ts` 的解析器（`parsePokeDbPokemonListPage` / `parsePokeDbPokemonDetailPage` / `parsePokeDbTrainerListPage`）**前端、Worker、脚本三方共用**：改解析逻辑同时影响在线刷新与离线快照生成。

---

## 6. Cloudflare Worker（`cloudflare/environment-worker/`）

`luxraykit-app`（`wrangler.jsonc`）：静态资源（`assets` → `../../dist`，SPA fallback）、`/api/*` 与 `/health`（`run_worker_first`）、cron 刷新、DO 步进。刷新时动态检测 PokeDB 最新赛季，缓存排行 / 详情统计，附带报告关联的上赛季队伍样本。本节是 Worker 的唯一详细说明，[目录内 README](../cloudflare/environment-worker/README.md) 只做索引。

### 6.1 路由（`src/index.ts` 的 `fetch`）

路由全集见 `index.ts` 末尾的 `fetch`：`/health`、`/api/environment/{latest,status,refresh}`、`/api/pokemon/:id/teams`、`/api/ping`（§6.7）、`/api/feedback[/:id]`（§6.8）；其它 `/api/*` 404 JSON，其余交给 `env.ASSETS`。`POST /api/environment/refresh` 与 feedback 的 GET / PATCH 需 `Authorization: Bearer <ADMIN_REFRESH_TOKEN>`；refresh 支持 `?step=1&jobId=` 单步。

**`/api/environment/latest` 的条件请求语义**（`handleLatest`）：

- `ETag`（`buildLatestEtag`）= status 里的**内容身份**字段 `sourceUpdatedAt` / `selectedSeason` / `previousSeasonLabel` 拼串 sha256 取前 16 位。**不要把 `refreshedAt` / `retrievedAt` 加进 ETag**（上游没变时它们也会被重写）。
- **200 的 ETag 取快照自带的 KV metadata**（`putSnapshot` 写入），不要从 status 现算（两个 key 在边缘节点独立缓存，可能读到新 status + 旧快照）。304 按 status 现算的 tag 判断；无 metadata 的老记录回退现算。
- 200 与 304 都是 `cache-control: private, no-cache`。**304 也带全套 `x-luxray-*` 头**，且**不读、不 parse 快照**。
- 审计头 `x-luxray-audit-alert` / `-audit-unknown-count` 优先读 `status.audit`（`publishRefreshJob` 写入）；老记录缺该字段时回退解析快照，且不走 304。`x-luxray-worker-status` = `status.ok && !audit.alert`；`x-luxray-refreshed-at` = `status.refreshedAt`。
- KV 为空时回 503 `environment_snapshot_not_ready`（预热见 §6.6）。

### 6.2 KV（namespace `ENVIRONMENT_CACHE`）

key 定义在 `index.ts` 顶部常量：`environment:latest`（对外快照，含 `previousSeason`）、`:status`、`:team-index`（宝可梦 → 队伍倒排）、`:refresh-job`（`stepCount` / `failureCount`）、`:pokedb-freshness-probe`（season + 更新日签名）。preview 与生产**共享同一 namespace**（AGENTS.md §2）。

### 6.3 在线刷新管线：cron + Durable Object alarm

> **两条独立刷新路径互为冗余**：Worker cron + DO 直接更新 KV（前端第一层）；外部任务经 `automation/pokedb-environment-refresh` PR 更新仓库静态 JSON（第二层，§7.1）。上游可能按出口 IP 拒绝请求，不要把任一固定执行环境当唯一来源。诊断时同时查 `/api/environment/status`、KV 与最近的静态快照 PR。

- **触发**（`scheduled`）：加随机抖动（`SCHEDULED_MAX_JITTER_MS`），`startScheduledRefresh` 先发廉价 list 页探针，按「season + 更新日」签名比对，**仅上游变化时**建 job。cron 见 `wrangler.jsonc`（15:35 / 16:05 UTC 围绕 PokeDB 每日 00:30 JST 发布，另 02/08/20:35 稀疏兜底）。
- **步进**：`EnvironmentRefreshDurableObject.alarm` 每 `REFRESH_ALARM_DELAY_MS`（1000ms）跑一步 `runRefreshJobStep`，`done` 后删 job 与 alarm。
- **重试**：单步异常累加 `failureCount`，达 `MAX_REFRESH_JOB_FAILURES`（6）放弃并记日志，否则 `REFRESH_ALARM_FAILURE_RETRY_MS`（10 min）后重试。
- **限制**：免费计划单次调用**最多 50 个外部子请求**，详情按 cursor 分批（`POKEDB_DETAIL_CHUNK_SIZE`）。步进必须由 DO alarm 驱动，不要改回 `env.SELF.fetch` 自链（子请求的 `waitUntil` 会随 cron 父调用结束被取消）。
- **哨兵 id 不抓详情**：`startRefreshJob`（及 `fetchPokemonStatisticsBattle`）跳过 `pokedb:` 行，但它们仍占 `detailLimit` 名额（top-N 窗口与来源榜单对齐）；`buildPokemonStatisticsPayload` 给它们空 stats + `displayName`（§5.3）。

**换季保留前序名次**（`resolvePreviousSeasonRanks`）：`publishRefreshJob` 覆写 `environment:latest` **之前**先读旧快照，依次：① 旧快照已带 `seasonNumber === 本次 - 1` 的 `previousSeason` → 直接带过；② 旧快照本身就是上一季 → 就地压缩成名次表；③ 都不成立（KV 冷启动、部署晚于换季、快照丢失）→ 现抓 `/pokemon/list?season=<本次-1>`（PokeDB 保留历史赛季页，赛季数据不需要人工备份）。抓取失败**不得让本次发布失败**：记 `environment_previous_season_backfill_failed`、沿用已有值、下次再试。

### 6.4 自定义域名

`routes` 中 `luxraykit.com` / `www.luxraykit.com` 为 `custom_domain: true`，deploy 时自动建橙云 DNS 与证书。pattern 必须是裸主机名，不带 `/*` 与 `zone_name`。

### 6.5 诊断「数据过期」

```bash
curl -sD - -o /dev/null https://luxraykit.com/api/environment/latest | grep -i x-luxray   # fresh 正常；stale = PWA 显示「可能过期」
npx wrangler kv key get "environment:status" --namespace-id 43aafe9bdd2c4d01a980325d75eb9630 --remote
npx wrangler kv key get "environment:refresh-job" --namespace-id 43aafe9bdd2c4d01a980325d75eb9630 --remote
```

`refresh-job` 的 `stepCount` 应递增、完成后 key 消失；卡住（不动）时可删除该 key 解锁。`ADMIN_REFRESH_TOKEN` 是 Worker secret，**不可读回**，只能 `wrangler secret put` 重设；cron / DO 路径不需要它。

### 6.6 本地开发与一次性配置

- `npm run worker:app:dev`（先 build 前端再 `wrangler dev --test-scheduled`；`worker:environment:dev` 不 build），`http://localhost:8787/__scheduled` 触发 scheduled。`worker:app:check` 是 build + dry-run（CI 跑 `worker:environment:check`）。改 binding 后 `npm run worker:app:types` 重生成 `worker-configuration.d.ts`。
- KV、DO、AE 数据集都已建好（id 在 `wrangler.jsonc`）。重建环境时：`npx wrangler login`；`npx wrangler kv namespace create ENVIRONMENT_CACHE [--preview] --config cloudflare/environment-worker/wrangler.jsonc` 并把 id / preview_id 填回；`npx wrangler secret put ADMIN_REFRESH_TOKEN --config cloudflare/environment-worker/wrangler.jsonc`（手动刷新 + 留言管理；可选的 `FEEDBACK_DISCORD_WEBHOOK` 见 §6.8）。
- 生产部署只走 Workers Builds（§9）；`worker:app:deploy` / `worker:environment:deploy` 只是手动逃生口。
- KV 为空时预热：`curl -X POST https://luxraykit-app.ffkiyo7.workers.dev/api/environment/refresh -H "Authorization: Bearer <ADMIN_REFRESH_TOKEN>"`。

### 6.7 匿名使用统计（Analytics Engine 数据集 `luxraykit_pageviews`）

- 无第三方脚本、无 cookie、无任何标识符。路由变化时 `lib/analytics.ts` 发一次 `POST /api/ping`（`sendBeacon`，不可用时 `fetch(..., { keepalive: true })`；错误吞掉；同一路由不重发；`import.meta.env.DEV` 下不发）。
- **记录**：`blob1`/`index1` 去参数路由模式（如 `/env/pokemon/:id`）、`blob2` `pwa`/`browser`、`blob3` `dark`/`light`、`blob4` `request.cf.country`（取不到为空串）、`double1` 恒 1。**不得记录** IP、UA 原文、任何 id（队伍、分享 code、宝可梦）、用户内容，也不得加任何能把两条记录关联起来的字段。
- **校验**：Worker 用 `hashRoute.ts` 的 `routePatterns` 做白名单 + 长度上限，body 经 `readBodyCapped`（512 B）；不合法的 body 与合法的一样静默回 204（恒定 `no-store`）。binding 不存在时 no-op。
- **可关**：`UserPreference.analyticsOptOut`（默认 `false` = 开启），「我的 → 显示 → 匿名使用统计」。
- **查询**：Dashboard → Workers & Pages → Analytics Engine，或 SQL API（token 需 `Analytics Read`）。AE 是采样存储，**聚合用 `sum(_sample_interval)`，不要用 `count()`**：

  ```bash
  curl -s "https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql" -H "Authorization: Bearer <token>" \
    -d "SELECT blob1 AS route, blob2 AS mode, sum(_sample_interval) AS views FROM luxraykit_pageviews
        WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY route, mode ORDER BY views DESC"
  ```

- 数据集首次写入时自动创建。preview 与生产共用同一个数据集。

### 6.8 站内留言箱（Durable Object SQLite）

「我的 → 留言」→ `#/profile/feedback`（`pages/profile/FeedbackSheet.tsx`）。**私信箱**：用户只看到「已收到」，留言站内任何地方都不展示。表单提示 trim 后最低 5 字，不足或发送中禁用；离线只提示不阻止；失败显示错误、保留草稿、可重试。

- **存储**：DO 自带 SQLite，`new_sqlite_classes` 迁移在 deploy 时自动建库，无需 Dashboard 操作。
- **绑定** `FEEDBACK_INBOX` → `FeedbackInboxDurableObject`，单实例 `idFromName('feedback-inbox')`，migration tag `v2`（**v1 不可改**）。表 `feedback`（`id` / `created_at` / `kind` ∈ bug·idea·other / `message` / `contact` / `route` / `app_build` / `data_version` / `ua_family` / `country` / `client_key` / `status` ∈ new·read），在 `blockConcurrencyWhile` 里建表。
- **preview 没有这个绑定**：三个端点恒 503 `feedback_unavailable`，前端显示「留言服务暂时不可用。草稿已保留，稍后重试。」——这不是故障。
- **入口检查**（`handleFeedbackSubmit`，先于解析）：带 `Origin` 且非本站 → 403（无 Origin 的非浏览器客户端放行，由限流兜底）；非 `application/json` → 415；`readBodyCapped` 读 body，声明的 `Content-Length` 超限直接 413，chunked 读到超限即停。
- **校验**（`parseFeedbackBody`）：body ≤ 4 KB（UTF-8，1000 汉字约 3 KB）；`message` trim 后 5–1000；`contact` ≤ 120；`appBuild` / `dataVersion` ≤ 40；`route` 不在 `routePatterns` 就**置空不报错**。`website` 是蜜罐：非空时回与真成功**形状相同**的 201 但不落库。
- **限流**在 DO 内做（单实例串行，无需加锁）：同一 `client_key` 5 条 / 天，全站 200 条 / UTC 日，越界 429 `feedback_rate_limited`。
- **隐私**（与 §6.7 同一条线）：`client_key` = SHA-256(固定盐 + `cf-connecting-ip` + UTC 日期) 前 16 位，**在 Worker 里算完**，DO 只见派生值，每天轮换；不要存 IP 原文。`ua_family` 只落 iOS / Android / Windows / macOS / other；`country` 用 `request.cf.country`；响应全部 `no-store`。
- **Discord 推送**：设了 `FEEDBACK_DISCORD_WEBHOOK` 才用 `ctx.waitUntil` 发 embed（kind、正文截 1500、联系方式、来源页、构建、数据版本、国家、设备、id、UTC+8 时间），未设静默跳过；失败只记 `feedback_discord_push_failed`，不影响 201。**Webhook 绑专用频道**（如 `#luxraykit-feedback`），不要复用 `luxraykit-dev` / build-notifier 那个。频道「整合 → Webhook → 新建」拿 URL 后 `npx wrangler secret put FEEDBACK_DISCORD_WEBHOOK --config cloudflare/environment-worker/wrangler.jsonc`。
- **管理**（复用 `ADMIN_REFRESH_TOKEN`；提交成功回 201 `{ id, createdAt }`；列表 `status=new|read|all`，默认 `new`、`limit` ≤ 200、按 `created_at` 倒序）：

  ```bash
  curl -H "Authorization: Bearer $ADMIN_REFRESH_TOKEN" https://luxraykit.com/api/feedback?status=new
  curl -X PATCH -H "Authorization: Bearer $ADMIN_REFRESH_TOKEN" -H 'content-type: application/json' -d '{"status":"read"}' https://luxraykit.com/api/feedback/<id>
  ```

- **代码与测试**：`src/feedbackInbox.ts` 把校验、`client_key` 派生、UA 归类、限流判定、Discord payload 导出为纯函数，SQL 收在 `FeedbackRepository` 后；`feedbackInbox.test.ts` 用只认这几条语句的内存 `SqlLike` 假实现，`index.test.ts` 用 stub 的 `FEEDBACK_INBOX.get().fetch` 覆盖路由、鉴权、503、蜜罐与 body 上限。

---

## 7. 数据维护脚本（`scripts/`）

命令全集与说明见 `package.json` 的 `data:*`（多数有 `--check` 变体：只校验、不写文件）与各脚本文件头。需要 TS 源码的脚本用 esbuild 现场打包再 import（全程离线）：PokeDB 解析器随 Worker `index.ts` 打成 `.npm-cache/pokedb-environment-worker-tools.mjs`，VGCPastes 用 `.npm-cache/vgcpastes-tools.mjs`；网络响应也缓存在 `.npm-cache/`（pokeapi / pokebase / 52poke-abilities）。

**手工维护、没有生成脚本的数据**（直接改文件）：

- `seed/regMA/allowlist.ts`：新规则的行手工追加。
- `seed/regMA/mega-catalog.ts`、`mega-catalog-mb.ts`、`mega-catalog-mc.ts`。
- `external/pokedbItemNameMap.ts` / `pokedbResourceKeyMap.ts`：见 AGENTS.md §5。

**`scripts/archive/`**：一次性脚本（`update-mb-assets` / `update-mc-assets` / `generate-natures` / `generate-form-catalog` / `generate-mega-forms`），只作出处记录，**不要运行**（见[该目录 README](../scripts/archive/README.md)）。

各脚本的坑：

- **`data:regma:catalog-batch`**：默认批次号 = 已有最大 + 1、取 40 只；`--size=all` 处理 allowlist 全部未入库条目；`--batch=N --dry-run`；`--source-refs=a,b,c` 必须是 `dataSourceManifest` 已有的 id，否则审计报 `unresolved-source-ref`。示例：`npm run data:regma:catalog-batch -- --source-refs=reg-mc-official-eligible-pokemon,pokeapi-pokemon-data,pokeapi-official-artwork,manual-seed-review`。
- **`data:regma:abilities`**：扫描目录处理 `catalog.ts` + 全部 `catalog-batch-*.ts`（不要改成手写文件列表）；`:check` 看覆盖范围。Champions 独有特性（`firemane` / `eelevate` / `piercing-drill` / `spicy-spray` …）在 PokeAPI 是 404，按「PokeAPI 没有」处理、中文名回落到神奇宝贝百科或现有 catalog 行；其余 HTTP 状态仍致命。
- **`data:regma:hidden-abilities`**：`hiddenAbilities.ts` 只做「梦特」标记，不增删特性；`--offline` 只用本地缓存。
- **`data:regma:physical-metrics`**：表按 `nationalDexNo` 索引（`DexPage.tsx` 也按本体 dex 号取），每个 dex 号只取**默认形态** `/pokemon/<dexNo>/` 一行，异种形态不建行。每次新增宝可梦后跑一次。
- **`data:regma:moves`**：每只宝可梦抓一次 PokéBase Available Moves 页（首次全量必走网络）。两个形态的 slug 与 PokeAPI 不同名，直接用 catalog id 会拿到 soft-404 壳页（HTTP 200、约 349 KB、无招式行），下次刷新复查两张表：`POKEBASE_SLUG_OVERRIDES`（`basculegion-male` → `basculegion`）；`POKEBASE_LEARNSET_CARRY_FORWARD`（`tauros-paldea-combat-breed`：物种页**合并**列出斗战 / 火炽 / 水澜三种招式，不能用；learnset 沿用上一版 `move-catalog.ts`，有招式在新抓取里不存在则报错）。
- **`data:regma:move-ids`**：只写出 id 数组，供环境审计使用（§4.4）。门禁在 `src/lib/dataAudit.test.ts`：`moveIds` 必须等于 `moves.map(m => m.id)`，改招式表没跑脚本则 `npm test` 红。
- **`data:items:audit`**：从 PokéBase 当前规则道具列表读英文名与类别，用 PokeAPI `zh-hans` 核验普通道具与树果的中文身份（无中文名的妖精之羽按 52Poké 人工核验）；普通道具 / 进化石图片按 PokéBase、树果按 PokeAPI `item id → sprite` 对照，再核验 `catalog.ts` 与 `public/assets/items/`。`--report` 打印本地中文效果与 PokéBase 英文描述供人工语义校对。网络源不稳定时会失败，不作 CI 门禁。`data:items:refresh` 只替换确认不匹配的图片，仍须人工看 diff；不要手改 `item-icon-mapping.ts`（用 `data:items:icon-mapping` 离线重生成）或单个图片。
- **`data:vgcpastes:champions-*`**：M-C sheet gid `2001945654`；默认 `--reg=mc`。

### 7.1 环境快照自动化 PR（冗余路径）

`npm run data:pokedb:environment:pr [-- --force]`：在独立执行环境（VPS）生成静态回退数据，不写 KV、不直接改 `main`，从最新 `origin/main` 重建 `automation/pokedb-environment-refresh` 并创建 / 更新 PR，经 CI 与 daily-auto-merge 上线。先请求一次 `https://luxraykit.com/api/environment/latest`，由 `scripts/pokedb-worker-fallback-gate.mjs` 判定，**两类触发条件**：

1. **Worker 不健康**：`stale` / `degraded`、非 2xx 或不可达 → 由 `data:pokedb:environment` 直接抓 PokeDB（`--force` 同理）。PokeDB 对 VPS（AWS 地址）回 403，这条路径需在能访问 PokeDB 的机器上手动跑。
2. **静态快照落后**：Worker 健康，但本地 `reg-ma-environment.json` 的 `battles.*.updatedAt` 最大值落后响应头 `x-luxray-latest-source-updated-at` 超过 `STATIC_SNAPSHOT_MAX_LAG_DAYS`（默认 7，0 = 每次上游更新都刷）天 → 直接复制 Worker 的 `/api/environment/latest`（要求 `x-luxray-worker-status: ok`），**不访问 PokeDB**。本地文件缺失 / 损坏也触发；响应头缺失则**不**触发。

- 都不满足时直接成功退出，不访问 PokeDB。
- 提交前统一过 `assertPublishableSnapshot`：singles / doubles 都在且有排行、审计 unknown 为 **0**，不通过就还原文件、失败退出。
- 高分队伍样本只在上游明确回「该赛季没有公开队伍」时才往前一季找；403 / 超时直接失败，不静默写空 `teamSamples`。
- 只提交 `generatedSnapshotPaths` 两个文件：`src/data/external/pokedb/current_environment_snapshot.json`（源码审计快照）与 `public/data/pokedb/reg-ma-environment.json`（前端第二级回退）。数据没变则不推送；403、连接 / 解析 / GitHub 鉴权失败则脚本失败，生产不受影响。
- 抓取调参环境变量（默认值）：`POKEDB_FETCH_ATTEMPTS=5`、`POKEDB_FETCH_TIMEOUT_MS=20000`、`POKEDB_FETCH_RETRY_DELAY_MS=2000`、`POKEDB_PAGE_DELAY_MS`。`POKEDB_PAGE_DELAY_MS=0` 可提速；上游出现 429 或不稳定时改 `150` 或移除（恢复默认页间延迟）。

### 7.2 队伍库自动化 PR

`npm run data:vgcpastes:pr [-- --reg=mc,mb | --dry-run]`：与 §7.1 同样的白名单分支与 CI 防线；两条任务的工作区与调度必须隔离。从最新 `origin/main` 重建 `automation/vgcpastes-team-refresh`，只允许提交 `src/data/external/vgcpastes/` 下四个生成 JSON（M-B / M-C 各一对 samples / audit）。默认只跑 M-C（脚本默认值 `--reg=mc`，规则滚动时要跟着改）；`--dry-run` 不动分支 / index / worktree、不推送。当前没有 M-A 队伍库。

- **push 前门禁**：任一 regulation 的 audit issues > 10（`MAX_AUDIT_ISSUES`）或 M-B / M-C 少于 20 支（`MIN_IMPORTED_TEAMS`）即失败并恢复生成文件。之后 PR 仍须过契约单测、build、Playwright 队伍库渲染与 Worker dry-run。
- **暂停自动合并用 `hold` 标签**，不要用 draft（脚本下次复用该 PR 时会把它转回 ready）。
- 发现脏工作区直接拒跑；上次失败时先核对日志和生成文件，不要绕过工作区保护。
- **队伍名在摄入端截断**：`shortenTitle` 先在剩余部分仍可用时砍掉 `Team Description` 结尾的括号，再按词边界截到 64 字；`tournament` / `eventRank` / `author` 不动。卡片标题另有 `min-w-0 truncate` 兜底（PokeDB 天梯样本与用户导入的队伍不受 64 字上限约束），标题必须保持单行。
- **排序默认按时间最新**（首页「上位构筑」与队伍库），不要改成 `sortTeamSamplesByScore`（它会把带分数的 PokeDB 天梯样本全排在赛事队前）。「按分数」可一键切换。

---

## 8. 测试

**单元 / 组件**（`npm test`，Vitest + jsdom + `@testing-library` + `fake-indexeddb`，配置在 `vite.config.ts` 的 `test` 段与 `vitest.setup.ts`）：

- 收集范围**不止 `src/`**：还有 `cloudflare/environment-worker/src/*.test.ts` 与 `scripts/*.test.mjs`。**例外**：`cloudflare/build-notifier/worker.node-test.mjs` 不被 vitest 收集，只能手动 `node --test`，**不在 CI 内**。
- 数据门禁：`src/data/vgcpastesTeamSamples.contract.test.ts`（队伍库 JSON 数量、字段、唯一性、audit 对齐）、`src/data/pokemonFacts.test.ts`、`src/lib/dataAudit.test.ts`（`move-ids` 防漂移、Mega 石映射、资源 PNG 哈希等）。
- `src/sw.test.ts` 把注入清单后的 `public/sw.js` 用 `new Function` 跑起来（假 `self` / `caches` / `fetch` / `Request`，内存 CacheStorage），覆盖 §4.5 的全部行为，并断言源码不含已下线的 `/data/vgcpastes/`、`reg-ma-s1-environment.json` 与手写 `'/assets/items/` 列表；页面侧提示 / SKIP_WAITING / reload 时机在 `src/lib/serviceWorker.test.ts`。
- `src/lib/teamShare.test.ts` 必须跑在 **node** environment（jsdom 没有 `CompressionStream`，会静默走 `p1` 分支）；`p1` 另有独立用例。
- `vitest.setup.ts` 每个用例前 `history.replaceState` 清掉 hash 与 `lkDepth`（jsdom 的 URL 与会话历史在同一文件内跨用例保留）。

**PWA**（`playwright.config.ts` 两个 project）：

- `chrome-mobile-390`：`offline` / `team-samples` / `first-paint-budget` 冒烟，`channel: 'chrome'` 用机器已装的 Chrome（CI runner 自带）；`npm run test:pwa` 固定到它。
- `visual-mobile-390`：只跑 `visual.spec.ts`（24 个状态，含 6 个浅色主题；基线 `tests/pwa/visual.spec.ts-snapshots/*-visual-mobile-390-linux.png`；`maxDiffPixelRatio: 0.02`），用 lockfile 锁死的 Playwright 自带 Chromium；**不要改成 `channel: 'chrome'`**（Chrome stable 自动升级会改变渲染）。

**视觉回归是 CI-only**：校验 = `ci.yml` 的 `visual` job（阻塞门禁，§9）；重建 = `gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"`，跑完 `git pull` 拉回 PNG。

- 基线只在 Playwright 官方容器生成，镜像 tag 由 `scripts/visual-docker.sh` 从已装版本推导（当前 `mcr.microsoft.com/playwright:v1.59.1-noble`），浏览器与字体只随依赖升级而变。
- **不要在本机跑或重建**：macOS 字体栈与镜像不同，会得到整屏假阳性；快照名只带平台不带架构，arm64 镜像会用相同文件名覆盖 CI 的 amd64 基线。`visual-docker.sh` 只支持 amd64 Linux，没有 Docker 时报错并指向工作流。
- `visual-baseline.yml` 拒绝在 `main` 上跑。`mode` 默认 `changed`（只重写超出 2% 的快照）；像素差在阈值内但内容过期（如规则轮换只改了 header 几个字）时报 "nothing to commit"，改用 `-f mode=all`。
- **视觉用例吃冻结数据**：
  - `tests/pwa/fixtures/environment-snapshot.json` 是 `reg-ma-environment.json` 的冻结副本，`page.route` 拦截 fetch 换成它。要让门禁看到新数据：手动复制线上文件覆盖 fixture、再重建基线。
  - `page.clock.setFixedTime` 钉在 **`currentRuleSet.startAt` + 11 天 12:00 UTC**（由 `metadata.ts` 推导，不写字面量；落在上一规则窗口会渲染反向的「规则已切换」提示）。fixture 的时间戳与赛季标签在 `page.route` 里按该时钟改写。换规则后需 `-f mode=all` 重建。
  - `tests/pwa/fixtures/vgcpastes/*_team_samples.json` 经 `import()` 打进 `assets/<文件名>-<hash>.js`，用例拦截该 chunk 请求返回 `export default <fixture>`；拦截落空时 `openApp` 的断言失败。
  - PokeDB / VGCPastes 数据 PR 不改截图，CI 对它们跳过 `visual`。

---

## 9. 部署与 CI

部署红线（合并进 `main` 即上线、preview 共享生产 KV 须只读）见 AGENTS.md §2，这里只记机制。

- **生产**：Cloudflare Workers Builds（Git 集成），`main` 更新即构建并 `wrangler deploy` `luxraykit-app`。`.github/workflows/` 的四个 workflow **都不部署**。
- **preview = 影子 Worker `luxraykit-app-preview`**：自己的 Workers Builds 配置（同 repo、非 `main` 分支触发），deploy 为 `wrangler versions upload --config cloudflare/environment-worker/wrangler.preview.jsonc`。有 per-version URL（`<版本前8位>-luxraykit-app-preview.ffkiyo7.workers.dev`）与按分支固定的别名（`<分支 slug>-…`，Discord 推的是它）。平台约束：① 带 DO 的 Worker 不生成 preview URL（所以生产 Worker 不出 preview）；② Workers Builds 只能部署到所连接的 Worker，preview 触发器必须建在影子 Worker 名下；③ wrangler 需显式 `preview_urls: true`。影子 Worker 不带 DO / cron / 自定义域名 / admin secret：刷新路径不可用、留言恒 503，但与生产共享 KV 与 AE 数据集。
- **Preview Discord 通知**：Event Subscription 把影子 Worker 的成功构建写入 Queue `luxraykit-build-events`，consumer `luxraykit-build-notifier` 推到 `luxraykit-dev`，排除 `main` 与 `automation/` 分支（[README](../cloudflare/build-notifier/README.md)）。
- **`main` 保护**：ruleset「Protect main」——必须走 PR、禁止 force-push 与删除，必需 check 为 `Test, build, and validate Worker` 与 `Mobile visual regression`；owner 的 bypass 也只在 PR 内生效。
- **CI**（`ci.yml`）三个 job，步骤见文件本身。不直观的点：
  - `test` 在 `npm test` 前跑 `data:pokemon-facts:check`，最后跑 `worker:environment:check`。
  - `changes` 用**排除名单**：只有改动**全部**落在已知不影响渲染的路径（`docs/`、`*.md`、`cloudflare/`、`scripts/*.mjs`、其余 workflow、已被 fixture 冻结的 `public/data/pokedb/` 与 `src/data/external/vgcpastes/`）才跳过 `visual`；新目录或配置默认触发；push `main` 总是运行。
  - `visual` 与 `test` 并行、阻塞门禁；被判跳过时 skipped 视同通过，`changes` 自身失败则照常运行；失败上传 `visual-diffs`（expected/actual/diff）。**跳过只能用 job 级 `if:`，不要用 workflow 级 `paths-ignore`**（必需 check 会永远停在 Expected）。
- **daily-auto-merge**（每日 20:00 UTC）：只合并 head 为 `automation/pokedb-environment-refresh` 或 `automation/vgcpastes-team-refresh`、绿色、非 draft、无 `hold`、来自本仓库（非 fork）、包含最新 `main`、且改动文件**全部**在对应脚本 `generatedSnapshotPaths` 内的 PR；多一个文件就留给人工。功能 / Agent PR 一律人工合并。
- **Claude PR 助手**（`claude.yml`）：`@claude` 触发 `anthropics/claude-code-action`（钉在 v1 的 commit SHA，升级手动改）；默认只接受有写权限的触发者，凭据只来自 Secret `CLAUDE_CODE_OAUTH_TOKEN`。

---

## 10. 文档可信度分级（本文件 2026-09-23 核对）

| 档位 | 范围 | 怎么用 |
| --- | --- | --- |
| **权威** | 本文件、`AGENTS.md`、代码本身 | 冲突时以代码 > 本文件 > 其他 |
| **现状（已核对）** | `README.md`、`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`、`docs/qa/*`、`docs/progress/DEVELOPMENT_PROGRESS.md` | 可引用；发现偏差就地修 |
| **计划（非现状）** | `docs/plans/*` | 记录**未实施**的意图，其中的「现状事实」章节一律不可信 |
| **归档** | `docs/archive/*` | 历史记录，不代表现状 |

维护约定：改刷新管线 / 路由 / KV / 分支策略 → 同步 §6 与 §9；改测试门禁、Node 版本或视觉回归流程 → 同步 §2 与 §8；计划文档只留仍有效且适合公开协作的内容，实施完毕或含本地运维细节的工作稿不进版本库。
