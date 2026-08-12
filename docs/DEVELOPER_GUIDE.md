# Luxray Kit 开发者文档

面向贡献者的工程说明。内容以仓库 `main` 当前代码为准核对，覆盖架构、数据流、Worker 刷新管线、脚本与部署。

> 注意：仓库根的 `README.md` 偏产品视角，`docs/progress/DEVELOPMENT_PROGRESS.md` 已明显过期（详见文末「已知过期文档」）。本文档以代码为准。

---

## 1. 项目概览

Luxray Kit 是一个移动端优先的 Pokémon Champions 对战辅助 PWA。核心特征：

- **纯前端 SPA**：React 19 + Vite 7 + TypeScript，无后端业务数据库；用户数据只存本地 IndexedDB。
- **单一 Cloudflare Worker**：`luxraykit-app` 一个 Worker 同时托管 Vite 构建产物（`dist/`）、`/api/*` 环境数据接口，以及定时抓取 PokeDB 的 cron / Durable Object 刷新管线。
- **环境数据三级回退**：在线读 Worker KV 快照 → 静态 JSON 快照 → 仓库内置 seed。即使断网或 Worker 不可用，应用仍可启动。

> 包名仍是历史名 `pokemon-champions-assistant`（`package.json`、IndexedDB 库名沿用），产品名为 Luxray Kit。改名时注意这两处是同一个历史标识，不要误改 IndexedDB 名导致用户数据丢失。

### 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 19 + Vite 7 + TypeScript 5.8 |
| 样式 | Tailwind CSS 3（`tailwind.config.js` / `postcss.config.js`） |
| 图标 | `lucide-react` |
| 导航 | tab + view 本地 state，**无 react-router** |
| 本地存储 | IndexedDB（手写 `src/lib/db.ts`，无 ORM） |
| PWA | 手写 `public/manifest.webmanifest` + `public/sw.js`，`main.tsx` 注册 SW |
| 伤害计算 | `@smogon/calc` Gen9 公式 + 项目自采 Champions 参数 |
| 速度计算 | 自有 Champions SP 公式 |
| 服务端 | Cloudflare Workers（Assets + Functions + Cron + Durable Object + KV） |
| 测试 | Vitest（单元/组件）+ Playwright（PWA / 视觉回归） |
| 部署 | Cloudflare Workers Builds（Git 集成，push `main` 自动构建部署） |

---

## 2. 快速开始

### 环境要求

- **开发平台：macOS**（2026-08 起；此前为 Windows → WSL2）。除视觉回归外，全部命令原生可跑，**不需要 Docker**。
- Node：**24.19.0**，三处已对齐——`.node-version`、`package.json` 的 `engines`、CI（`.github/workflows/ci.yml`）。
  - `.node-version` 同时被 **Cloudflare Workers Builds** 读取，因此它也决定生产构建所用的 Node 版本：改这个文件等于改生产构建环境。
  - npm 11（Node 24 自带）默认拦截依赖的安装脚本，`npm ci` 会打印 `npm warn allow-scripts`（esbuild / sharp / workerd / fsevents）。这些包都走 optionalDependencies 提供的预编译产物，**可以安全忽略**。
- 包管理：npm（仓库提供 `package-lock.json`，CI 用 `npm ci`）。

### 常用命令

```bash
npm install        # 安装依赖
npm run dev        # Vite 开发服务器，绑定 127.0.0.1（移动端优先，建议用手机模拟器调试）
npm run build      # tsc -b 全量类型检查 + vite build → dist/
npm run preview    # 本地预览构建产物
npm test           # Vitest 单元/组件测试（CI 必跑）
npm run test:pwa   # Playwright PWA / 离线测试（用本机 Chrome，不含视觉用例）
```

`npm run test:visual` / `test:visual:update` 是 **CI-only** 的，macOS 本机跑不了也不该跑——见 §8。

> PWA 提示：开发期 Service Worker 可能缓存旧资源。改动未生效时，在 DevTools → Application → Service Workers 注销后硬刷新。

---

## 3. 目录结构

```
src/
  main.tsx              # 入口：挂载 App + 注册 service worker
  App.tsx               # AppShell：Tab/overlay/toolView 路由，环境数据加载，导入流程
  branding.ts           # 产品名等品牌常量
  types.ts              # 全局领域类型（Pokemon/Move/Item/Team/UserPreference 等）
  state/AppContext.tsx  # 全局 store（teams + preferences），封装 IndexedDB 持久化
  lib/                  # 纯逻辑层（无 React 依赖，便于单测）
    db.ts               # IndexedDB repository + schema 迁移
    environmentDataset.ts   # 环境数据结构 + 审计（auditEnvironmentDataset）
    pokedbEnvironment.ts     # PokeDB HTML 解析 + 数据集构建（前端与 Worker 共用）
    environmentImport.ts     # 环境样本 → 本地队伍导入
    calculations.ts / damageAdapter.ts  # 速度 / 伤害计算
    legality.ts / teamSchema.ts / exportImport.ts / statPoints.ts ...
  data/
    index.ts            # re-export seed/regMA
    environment.ts      # 环境数据加载管线（三级回退 + VGCPastes 合并）
    schedule.ts         # ★ 规则/赛季两条时间轴的唯一真源（窗口表 + seasonToRegulation）
    speedTiers.ts       # 生成产物：PokeDB 速度档位（npm run data:pokedb:speed）
    pokemonFacts.ts     # 首页趣味小知识事实池（生成产物见 external/pokeapi/）
    environmentDatasetSeed.ts  # 4 只宝可梦的开发样例，环境数据最后一级回退
    seed/regMA/         # 版本化规则 seed（历史目录名，当前承载 M-B）：catalog/moves/items/abilities/allowlist/metadata...
    external/           # 外部抓取产物（pokedb/ 快照、vgcpastes/ 样本、pokeapi/ 事实、名称映射）
  pages/                # 各页面（懒加载）：Environment / Team / Tools / Calculator / Dex / Speed / TypeChart / Profile / Rule
  components/           # BottomNav / Header / PokemonPicker / onboarding / ui 等
  hooks/                # useAutoHideBottomNav / useVisualViewportMetrics

cloudflare/environment-worker/   # 生产 Worker（前端 + API + cron + DO）
scripts/                         # 数据维护脚本（Node ESM .mjs）
public/                          # 静态资源 + sw.js + manifest + 静态环境快照
tests/pwa/                       # Playwright 规格 + 视觉快照基线
docs/                            # product/ research/ qa/ progress/ automation/ plans/ archive/
                                 #   archive/ 一律不代表现状；plans/ 是待实施计划，同样不是现状
```

---

## 4. 前端架构

### 4.1 组件树与路由

无路由库。`App.tsx` 用本地 state 充当「路由器」：

```
main.tsx
 └─ App
     └─ ErrorBoundary
         └─ AppProvider (state/AppContext)
             └─ AppShell
```

`AppShell` 的关键 state：

- `activeTab: 'environment' | 'teams' | 'tools' | 'profile'` —— 底部 4 Tab。
- `overlay: 'rule' | null` —— 覆盖层（当前规则图鉴页），打开时隐藏底部导航。
  - **`RulePage` 当前没有入口，这是有意的**：`App.tsx` 会在 `overlay === 'rule'` 时渲染它，但全仓库没有任何地方调用 `setOverlay('rule')`——规则口径页由 owner 主动隐藏，代码保留待用。**不要把它「修复」成可达。**
- `toolView: 'calculator' | 'dex' | 'speed' | 'typeChart' | null` —— 工具页内的二级视图（四个工具**全部已上线**，`ToolsPage` 里那个「未开放」分支当前没有任何工具会命中）。
- 队伍成员「带入」工具的预设：`calcPreset`（攻/防方）、`speedPresetMemberId`、`calculatorMemberId`。

页面全部用 `React.lazy` + `Suspense` 懒加载并经 Vite 分包（见 4.4）。

### 4.2 全局状态：`AppContext`

`state/AppContext.tsx` 暴露 `useAppStore()`，提供 `teams`、`preferences` 及一组异步操作（`saveTeam` / `deleteTeam` / `addTeam` / `updateMember` / `replacePreferences` / `replaceTeams` / `clearLocalData` 等）。

设计要点：

- 每个写操作**先更新内存 state，再异步写 IndexedDB**（乐观更新）。
- 队伍排序用 `sortOrder`；新建队伍排到最前（`nextTopSortOrder`）。
- `normalizePreferences` 兜底合并 `defaultPreferences`，保证旧用户缺字段时不崩。
- `useAppStore` 在 Provider 外调用会抛错。

### 4.3 本地持久化：`lib/db.ts`

- IndexedDB 库名 `pokemon-champions-assistant`，`DB_VERSION = 2`。
- 两个 object store：`teams`（keyPath `id`）、`meta`（keyPath `key`，存 `preferences` / `initialized` / `schemaVersion`）。
- 首次启动且未初始化时写入 `defaultTeams` + `defaultPreferences`，并置 `initialized=true`。
- **Schema 迁移**：`onupgradeneeded` 中按 `oldVersion` 升级。v2 迁移把旧 EV 字段迁到 `statPoints`（`migrateLegacyEvStatPoints`）。
- **数据迁移**：`migrateLegacyStarterTeam` 把历史「M-A 测试队」starter 替换为当前 `defaultTeams[0]`。
- 改 schema 时务必递增 `DB_VERSION` 并在 `onupgradeneeded` 补迁移，否则老用户库会报错。

### 4.4 构建分包

`vite.config.ts` 的 `manualChunks` 手动切出大块以优化首屏：

- `calc-engine` ← `@smogon/calc`
- `regma-moves` ← `move-catalog.ts`
- `regma-pokemon-catalog` ← `catalog.ts` / `catalog-batch-*` / `catalog-forms.ts` / `mega-catalog.ts`

> 注意 `manualChunks` 对路径做了 `\\`→`/` 归一化（兼容 Windows）。新增大 seed 文件时考虑是否要并入既有 chunk。

---

## 5. 数据层

### 5.1 Seed（`src/data/seed/regMA/`）

Regulation Set M-A 的版本化静态数据：宝可梦 catalog（分 batch）、形态、Mega、招式、learnset、道具、特性、allowlist、性格、默认队伍、来源 manifest 与 `metadata.ts`（`currentRuleSet` / `currentDataVersion` / `defaultPreferences`）。`src/data/index.ts` 统一 re-export。

`currentRegulation`（`data/environment.ts`）由 `currentRuleSet.id` 推导（`reg-mb` → `M-B`，否则 `M-A`），作为队伍样本浏览的默认视角。

### 5.2 首页趣味小知识事实池

`src/data/pokemonFacts.ts` 只从当前 `pokemon.filter(legalInCurrentRule)` 构造首页事实池。事实全部来自有具体游戏版本标注的图鉴轶闻，不生成种族值变化、能力值排名等“当前规则数据推导”文案。

`scripts/generate-pokemon-facts.mjs` 从当前 allowlist 提取唯一全国图鉴编号，低并发请求 PokeAPI `/pokemon-species/{id}/`，只保留 `zh-hans` 且长度适合横幅的图鉴文本，并按数字、生态、行为与传说细节评分；泛化战斗文案会降权。生成产物是 `src/data/external/pokeapi/pokemon_facts.json`，运行时不请求外站，离线 PWA 可直接使用。

```bash
npm run data:pokemon-facts        # 刷新候选（响应缓存在 gitignored 的 tmp/pokemon-facts-cache/）
npm run data:pokemon-facts:check  # 只校验现有快照，不访问网络；CI 必跑
```

校验门禁要求：快照 `ruleSetId` 必须等于 `currentRuleSet.id`；每条全国图鉴编号必须仍在当前 allowlist；文本、编号不得重复；正文 18–48 字且不得包含任何空白字符（PokeAPI 原始换行与断行空格在生成时统一移除）；来源、游戏版本与兴趣评分齐全；有效 PokeAPI 事实不少于 80 条。规则切换后旧快照会在 CI 响亮失败，必须重新生成。

`PokemonFactBanner` 用 `currentRuleSet.id + UTC 日期` 做确定性洗牌：同一天首次打开看到同一条，点击“换一条”在完整序列走完前不会重复。视觉上“你知道吗？”是独立眉题，宝可梦名与图鉴版本下沉为来源元信息。

52Poké 只用于人工交叉核验，不进入自动抓取：其许可要求署名、非商业性使用、相同方式共享，且 robots 对自动抓取有严格限制。

### 5.3 环境数据加载管线（`src/data/environment.ts`）

`loadEnvironmentState()` 是前端读取环境数据的唯一入口，三级回退：

1. **Worker 快照**：`GET /api/environment/latest?refresh=<ts>`（`cache: 'no-store'`）。读响应头 `x-luxray-cache-state`（`fresh`/`stale`）、`x-luxray-source-status`（`ok`/`degraded`）和 `x-luxray-latest-source-updated-at`（探针已知的上游最新时间）决定 `freshness` / `sourceStatus`。若 Worker 为 `stale` 或 `degraded`，继续读取静态快照并按源更新时间选择更新的一份；静态快照追平探针时间时仍标记为 `fresh`，避免健康的冗余快照被旧 Worker 数据遮蔽或误报为过期。
2. **静态快照**：`/data/pokedb/reg-ma-environment.json`（`cache: 'force-cache'`）。供 Worker 降级比较、纯静态部署与离线使用。
3. **内置 seed**：`environmentFallbackState`（来自 `environmentDatasetSeed.ts`），始终可用的开发样例。

每级成功拿到 base 快照后，再**并行**懒加载 VGCPastes 锦标赛样本（`loadVgcPastesTeamSamples`）合并进去。VGCPastes 按 regulation 拆成独立 build chunk（`reg_ma_*` / `reg_mb_*`），单个文件失败只是少一批样本，不会让整页空白（`loadVgcPastesRegulationFile` 各自 try/catch）。

`PokeDbEnvironmentSnapshotPayload` 支持三种 PokeDB 形态（statistics / trainer-list / open-data ranked-teams），由 `isStatisticsPayload` / `isTrainerListPayload` 分派到对应 builder。

#### 赛季排名变动（`lib/seasonRankDelta.ts`）

快照里可能带一个 `previousSeason` 字段（`SeasonRankSnapshot`：`season` / `seasonNumber` / `ranks.{singles,doubles}` 的 `pokemonId → 名次` 表，单个 battle type 约 3.7KB），由 Worker 在换季时写入（见 §6.3）。前端据此在榜单每行渲染 ↑n / ↓n / NEW chip。

三条硬约束，改动时不要绕过：

- **只对比紧邻的上一个赛季**。`isImmediatePredecessor` 要求 `previousSeason.seasonNumber === 当前 seasonNumber - 1`；跨了赛季就整段丢弃——否则 chip 会在标着 M-6 的页面上悄悄表示「相对 M-4」。
- **没有前序快照就完全不渲染 chip**，不要显示 0 或猜测值。「无数据」和「没变化」必须可区分（后者渲染 `—`）。
- **PokeDB 只公布名次、不公布绝对使用率**，所以 chip 表达的永远是**名次**变化。文案不要写成使用率变化，数据口径页有对应说明。

### 5.4 数据审计（`lib/environmentDataset.ts`）

所有进入 UI 的环境数据先经 `auditEnvironmentDataset(dataset, catalog, expectedMetadata)`：未知的 Pokémon / 招式 / 道具 / 特性 / 性格引用会被记录到 `auditIssues` 并从展示数据中剔除。`environmentCatalog` 从 seed 派生（id 列表）。这是「数据来源与口径明确标注、不混入未知项」的保证机制，也是 Worker 端 `ENVIRONMENT_AUDIT_UNKNOWN_THRESHOLD` 校验的同源逻辑。

`pokedbEnvironment.ts` 的 HTML 解析器（`parsePokeDbPokemonListPage` / `parsePokeDbPokemonDetailPage` / `parsePokeDbTrainerListPage`）**前端、Worker、维护脚本三方共用**——改解析逻辑会同时影响在线刷新和离线快照生成。

---

## 6. Cloudflare Worker（`cloudflare/environment-worker/`）

单 Worker `luxraykit-app`（`wrangler.jsonc`）同时负责：静态资源（`assets` → `../../dist`，SPA fallback）、`/api/*` 与 `/health`（`run_worker_first`）、cron 刷新、Durable Object 步进。

### 6.1 路由（`src/index.ts` 的 `fetch`）

| 方法 + 路径 | 说明 |
| --- | --- |
| `GET /health` | 健康检查 |
| `GET /api/environment/latest` | 最新快照 + `x-luxray-cache-state` / `-source-status` / `-worker-status` / `-latest-source-updated-at` 头 |
| `GET /api/environment/status` | 刷新状态与审计健康 |
| `GET /api/pokemon/:pokemonId/teams?battleType=singles` | 某宝可梦相关队伍（来自 team-index） |
| `POST /api/environment/refresh` | 受保护，手动触发刷新（`Authorization: Bearer <ADMIN_REFRESH_TOKEN>`）；支持 `?step=1&jobId=` 单步 |
| 其它 `/api/*` | 404 JSON |
| 其它 | `env.ASSETS.fetch`（前端） |

### 6.2 KV（namespace `ENVIRONMENT_CACHE`）

| key | 内容 |
| --- | --- |
| `environment:latest` | 当前对外快照（含 `previousSeason` 前序赛季名次表，见 §6.3） |
| `environment:status` | 刷新状态（`refreshedAt` / `sourceUpdatedAt` / `previousSeasonLabel` / 审计） |
| `environment:team-index` | 宝可梦 → 队伍倒排索引 |
| `environment:refresh-job` | 进行中的刷新 job（`stepCount` / `failureCount`） |
| `environment:pokedb-freshness-probe` | 上游新鲜度探针（season + 更新日签名） |

### 6.3 在线刷新管线：cron + Durable Object alarm

> **现状（2026-07）**：生产保留两条独立刷新路径。Worker cron + DO 成功时直接更新 KV，供前端第一层读取；外部维护任务可通过 `automation/pokedb-environment-refresh` PR 更新仓库静态 JSON，随 `main` 部署后成为第二层回退（见 §7.1 与 §9）。上游可能按出口 IP 动态拒绝请求，因此两条路径互为冗余，不能把任一固定执行环境视为唯一来源。诊断时同时检查 `/api/environment/status`、KV 状态和最近的静态快照 PR。

Worker 内刷新由 **cron 触发、Durable Object alarm 步进**，而非自链式 `env.SELF.fetch`。

- **触发**（`scheduled` handler）：cron 触发后加随机抖动（`SCHEDULED_MAX_JITTER_MS`，避开固定整点 bot 节奏），调 `startScheduledRefresh` 先发廉价 list 页探针；按「season + 更新日」内容签名比对，**仅在上游变化时**创建刷新 job。cron 时间见 `wrangler.jsonc`（约 `15:35` / `16:05` UTC 主窗口围绕 PokeDB 每日 00:30 JST 发布，加 `02/08/20:35` 稀疏兜底）。
- **步进**（`EnvironmentRefreshDurableObject.alarm`）：DO alarm 每约 `REFRESH_ALARM_DELAY_MS = 1000ms` 跑一步 `runRefreshJobStep`，直到 job `done` 后自动清理（删 job + 删 alarm）。
- **失败重试**：单步异常累加 `failureCount`，达到 `MAX_REFRESH_JOB_FAILURES = 6` 则放弃（记日志）；否则 `REFRESH_ALARM_FAILURE_RETRY_MS = 10min` 后重试。
- **为何这样设计**：免费计划单次 Worker 调用**最多 50 个外部子请求**，所以宝可梦详情是 cursor 分批抓（`POKEDB_DETAIL_CHUNK_SIZE`）；DO alarm 取代旧的 cron 自链——旧方案里子请求的 `waitUntil` 在 cron 父调用结束时被取消，导致 job 卡住、数据显示「可能过期」。

#### 换季时保留前序赛季名次（`resolvePreviousSeasonRanks`）

`publishRefreshJob` 覆写 `environment:latest` **之前**先读一次旧快照——换季那一刻它是手上唯一一份刚结束赛季的数据。按顺序取前序名次表：

1. 旧快照里已经带着 `seasonNumber === 本次 - 1` 的 `previousSeason` → 直接带过（稳态，零网络）。
2. 旧快照自己就是刚结束的那个赛季 → 就地压缩成名次表（正常换季，零网络）。
3. 都不成立（KV 冷启动、部署晚于换季、快照丢失）→ 现抓 `/pokemon/list?season=<本次-1>`。**PokeDB 会长期保留历史赛季页**（2026-08-05 实测 season=1..4 均可取，各 235 条、解析 0 未知 key），所以这是真正的兜底而不是尽力而为；成功一次后第 1 条就永远短路它。

抓取失败**绝不能让本次发布失败**——记 `environment_previous_season_backfill_failed` 日志、沿用手上已有的值，下次刷新再试。

因此赛季数据不需要人工冻结备份：任何时候都能从 PokeDB 按赛季回补。

### 6.4 自定义域名

`wrangler.jsonc` 的 `routes` 现为 **active**：`luxraykit.com` 与 `www.luxraykit.com` 均 `custom_domain: true`，deploy 时 Cloudflare 自动建橙云代理 DNS + 签证书。（旧进度文档称该 routes 已注释/停用，已不符。）

### 6.5 诊断「数据过期」

```bash
# 看对外新鲜度（fresh = 正常，stale = PWA 显示「可能过期」）
curl -sD - -o /dev/null https://luxraykit.com/api/environment/latest | grep -i x-luxray

# 读 KV（namespace id 见 wrangler.jsonc：43aafe9bdd2c4d01a980325d75eb9630）
npx wrangler kv key get "environment:status" --namespace-id <ns> --remote
npx wrangler kv key get "environment:refresh-job" --namespace-id <ns> --remote
```

- `refresh-job` 的 `stepCount` 应递增、完成后 key 消失；若卡住（stepCount 不动）可删除该 key 解锁。
- 手动刷新需 `ADMIN_REFRESH_TOKEN`（Worker secret，**不可读回**，只能 `wrangler secret put` 重设）；cron/DO 路径不需要它。

### 6.6 本地开发 Worker

```bash
npm run worker:app:dev     # 先 build 再 wrangler dev --test-scheduled
npm run worker:app:check   # build + dry-run 部署校验（CI 用 worker:environment:check）
npm run worker:app:types   # 改 binding 后重新生成 worker-configuration.d.ts
```

`http://localhost:8787/__scheduled` 可本地触发 scheduled handler。

---

## 7. 数据维护脚本（`scripts/`）

Node ESM 脚本，多数支持 `--check`（只校验是否过期、不写文件，用于 CI/巡检）。脚本复用 `lib/pokedbEnvironment.ts` 解析器（通过 esbuild 打包成 `.npm-cache/...tools.mjs`）。

```bash
npm run data:pokedb:environment        # 抓取/刷新 PokeDB 环境静态快照
npm run data:pokedb:environment:check  # 仅校验是否需要更新
npm run data:pokedb:environment:pr     # 刷新静态快照并创建/更新自动化 PR
npm run data:pokedb:speed              # 重新生成速度线参照档 src/data/speedTiers.ts
npm run data:pokedb:speed:check
npm run data:vgcpastes:champions-ma    # 摄入 VGCPastes「Champions M-A」样本
npm run data:vgcpastes:champions-mb    # M-B 同上（--reg=mb）
npm run data:vgcpastes:champions-ma:check  # 只校验 M-A 产物是否与来源一致
npm run data:vgcpastes:champions-mb:check  # M-B 同上
npm run data:vgcpastes:pr              # 默认刷新 M-B 并创建/更新自动化 PR
npm run data:regma:allowlist / :abilities / :moves   # 重生成 seed 派生数据
npm run data:items:audit                # 只读核验 148 条当前规则道具的中英文名称、类别与本地图片
npm run data:items:refresh              # 仅用来源图刷新不匹配的本地道具图片
```

`data:items:audit` 从 PokéBase Champions 当前 M-B 道具列表读取英文名和类别，并用 PokeAPI `zh-hans` 道具名核验普通道具与树果的中文身份（PokeAPI 暂无中文名的妖精之羽按 52Poké 人工核验）；普通道具、进化石图片按 PokéBase 对照，树果图片按 PokeAPI 的 `item id → sprite` 对照，再核验 `catalog.ts` 与 `public/assets/items/`。`--report` 会同时打印本地中文效果摘要与 PokéBase 英文描述，供人工逐项语义校对；跨语言描述不冒充自动判定。网络源不稳定或出现不一致时审计会失败，不作为 CI 门禁。`data:items:refresh` 只替换已确认图片不匹配的本地快照，仍须人工检查 diff 后提交；不要手改 `item-icon-mapping.ts` 或单个图片文件。

`update-pokedb-environment.mjs` 会同时写源码审计快照（`src/data/external/pokedb/current_environment_snapshot.json`）与 public 运行时 JSON（`public/data/pokedb/reg-ma-environment.json`），后者即前端第二级回退。

### 7.1 环境快照自动化 PR（冗余路径）

环境快照维护脚本可以在独立执行环境生成静态回退数据。这是 §6.3 Worker→KV 在线刷新之外的冗余路径，不承载线上流量、不写 Cloudflare KV，也不直接改 `main`；它只推送白名单自动化分支并创建或更新 PR。后续由 GitHub CI 与 `daily-auto-merge.yml` 合入 `main`，再触发 Cloudflare Workers Builds 部署静态 JSON。

手动执行：

```bash
npm run data:pokedb:environment:pr
npm run data:pokedb:environment:pr -- --force  # 忽略 Worker 状态，强制应急刷新
```

该脚本会从最新 `origin/main` 重建 `automation/pokedb-environment-refresh`，然后先请求一次 `https://luxraykit.com/api/environment/latest`：仅当 Worker 返回 `stale` / `degraded`、非 2xx 或健康检查不可达时，才运行 `npm run data:pokedb:environment`。Worker 为 `fresh + ok` 时直接成功退出，因此正常日只产生一次轻量同源健康检查，不访问 PokeDB。`--force` 保留人工应急刷新能力。需要刷新时，脚本只提交以下两个生成文件，并用 `gh` 创建或更新 PR：

```text
src/data/external/pokedb/current_environment_snapshot.json
public/data/pokedb/reg-ma-environment.json
```

如果远端数据与当前快照一致，脚本成功退出且不推送分支、不更新 PR。如果上游返回 403、连接失败、解析失败或 GitHub 鉴权失败，脚本失败，现有生产 Worker 与静态回退不受影响。

可选环境变量：

```bash
export POKEDB_FETCH_ATTEMPTS=5
export POKEDB_FETCH_TIMEOUT_MS=20000
export POKEDB_FETCH_RETRY_DELAY_MS=2000
export POKEDB_PAGE_DELAY_MS=0
```

`POKEDB_PAGE_DELAY_MS=0` 适合只由固定执行环境低频刷新时提速；如上游出现 429 或不稳定，再改成 `150` 或移除此变量，恢复脚本默认的人类化页间延迟。

### 7.2 队伍库自动化 PR

VGCPastes 队伍库刷新与 §7.1 使用相同的白名单分支、PR 和 CI 防线，但两条任务的工作区与调度必须隔离，避免失败后留下的生成文件互相污染。

手动执行：

```bash
npm run data:vgcpastes:pr                 # 默认只刷新活跃增长的 M-B
npm run data:vgcpastes:pr -- --reg=mb,ma  # 明确需要时同时刷新 M-B、M-A
npm run data:vgcpastes:pr -- --dry-run    # 分支/index/worktree 不变，不推送、不创建 PR
```

`scripts/create-vgcpastes-refresh-pr.mjs` 从最新 `origin/main` 重建 `automation/vgcpastes-team-refresh`，运行既有摄入脚本，并只允许提交 `src/data/external/vgcpastes/` 下四个生成 JSON。默认不重跑筛选窗口已冻结的 M-A，以避免约 100 次无效 pokepast.es 请求。

脚本在 push 和创建 ready PR 前读取本轮 audit：任一 regulation 的 issues 超过 10、M-A 少于 90 支或 M-B 少于 20 支都会失败退出且恢复生成文件，不污染后续 cron。通过后，PR 仍须经过契约单测、应用 build、Playwright 队伍库渲染断言和 Worker dry-run；`daily-auto-merge.yml` 只会合并白名单分支上的非 draft、无 `hold` 标签、包含最新 `main` 且指定 CI check 成功的 PR。

需要人工暂停自动合并时，给 PR 添加 `hold` 标签。虽然 workflow 本身也跳过 draft，但刷新脚本下次复用该自动化 PR 时会把它转回 ready，因此 draft 不是持久暂停开关。

VGCPastes 脚本发现脏工作区会直接拒跑；若前一次生成任务失败，应先核对日志和生成文件，不要绕过工作区保护。

---

## 8. 测试

- **单元/组件**：Vitest + jsdom + `@testing-library` + `fake-indexeddb`。`npm test`，CI 必跑；其中 `src/data/vgcpastesTeamSamples.contract.test.ts` 对队伍库生成 JSON 做数量、字段、唯一性与 audit 对齐门禁，`src/data/pokemonFacts.test.ts` 验证事实池只引用当前规则宝可梦且每日序列稳定不重复。CI 还会在测试前运行不联网的 `npm run data:pokemon-facts:check`。配置见 `vite.config.ts` 的 `test` 段与 `vitest.setup.ts`。
  - `npm test` 的收集范围**不止 `src/`**：还包括 Worker 单测 `cloudflare/environment-worker/src/index.test.ts` 与脚本工具单测 `scripts/*.test.mjs`（PokeDB 解析、速度档位、Worker 回退门）。改这两处代码同样由 `npm test` 把关。
  - 例外：`cloudflare/build-notifier/worker.node-test.mjs` 刻意用 `-test.mjs` 而非 `.test.mjs` 命名以避开 vitest 收集，只能手动 `node --test` 跑，**不在 CI 内**。
- **PWA**：`tests/pwa/offline.spec.ts`（离线缓存）+ `tests/pwa/team-samples.spec.ts`（队伍库生成数据渲染）+ `tests/pwa/visual.spec.ts`（移动端视觉回归，18 个状态，基线在 `tests/pwa/visual.spec.ts-snapshots/`，命名含 `visual-mobile-390-linux`）。配置见 `playwright.config.ts`，分成两个 project：
  - `chrome-mobile-390`（`channel: 'chrome'`，`testIgnore` 掉视觉用例）跑功能类冒烟，用机器上已装的 Google Chrome，CI runner 自带因此无需下载浏览器。`npm run test:pwa` 已固定到这个 project。
  - `visual-mobile-390` 只跑视觉用例，用 `@playwright/test` 自带、被 `package-lock.json` 锁死的 Chromium——刻意不用 `channel: 'chrome'`，因为 Chrome stable 会自动升级，任何一次字体/光栅化变更都会悄悄让基线腐烂。
- **视觉回归是 CI-only 能力，本机不跑。** 基线只在 Playwright 官方容器内生成，镜像 tag 由 `scripts/visual-docker.sh` 从已安装的 `@playwright/test` 版本推导（当前 `mcr.microsoft.com/playwright:v1.59.1-noble`），保证浏览器与字体只随依赖升级而变。两个入口都在 GitHub Actions：

  | 目的 | 入口 |
  | --- | --- |
  | 校验 | `.github/workflows/ci.yml` 的 `visual` job（**阻塞门禁**，`needs: test`） |
  | 重建 | `.github/workflows/visual-baseline.yml`（手动 `workflow_dispatch`） |

  ```bash
  # UI 改动让像素动了之后，在对应分支上重建基线：
  gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"
  git pull   # 跑完后拉回工作流提交的 PNG
  ```

  - **为什么不能在本机跑**：① 开发在 macOS，宿主字体栈与镜像不同，直接 `npx playwright test tests/pwa/visual.spec.ts` 只会得到整屏假阳性 diff；② Playwright 的快照文件名只带平台不带 CPU 架构（`…-visual-mobile-390-linux.png`），Apple Silicon 上拉到的 arm64 镜像会用**完全相同的文件名**覆盖掉 CI 的 amd64 基线，静默污染门禁。`scripts/visual-docker.sh` 因此只支持在 amd64 Linux 上手动运行；在没有 Docker 的机器上它会直接报错并指向上面的工作流。
  - `visual-baseline.yml` 拒绝在 `main` 上运行：push `main` 会触发生产部署，新基线必须跟引发它的 UI 改动一起在 PR 里被 review。
  - 历史背景：2026-07 之前基线在 Windows 上生成（`chrome-mobile-390-win32`），只有 Windows 能验证；WSL2 时期改为容器生成；2026-08 迁到 macOS 开发后，容器保留为「基线的定义环境」，但执行位置整体上移到 CI。
- **视觉用例刻意与刷新中的数据解耦**，否则它没法当门禁用——环境快照的时间戳和榜单会直接印进截图，每次数据刷新都会让门禁变红、卡住 daily auto-merge：
  - `tests/pwa/fixtures/environment-snapshot.json` 是 `public/data/pokedb/reg-ma-environment.json` 的冻结副本，用例用 `page.route` 把运行时那次 fetch 拦截掉换成它。要让门禁看到更新后的数据，把线上文件复制过来覆盖 fixture，再重建基线——这是一次有意的动作，不是自动的。
  - `page.clock.setFixedTime` 把时钟钉在 `2026-07-20T12:00:00Z`：赛季/规则 header 和"可能过期"徽标都由挂钟时间推导，不钉住的话跨过赛季窗口或新鲜度阈值时像素会自己变。
  - **残留耦合**：VGCPastes 队伍库是 build-time 动态 `import()` 的 bundle 产物，拦不住。`automation/vgcpastes-team-refresh`（周级）如果改到截图里可见的靠前队伍，视觉门禁会红——这时人工确认后重建基线即可。PokeDB 环境刷新（日级，churn 的大头）已经被 fixture 完全隔离。

---

## 9. 部署与 CI

- **部署**：经 **Cloudflare Workers Builds（Git 集成）**——push 到 `main` 自动构建并 `wrangler deploy`。preview 走**影子 Worker `luxraykit-app-preview`**：它有自己的 Workers Builds 配置（同一 repo，非 main 分支触发，deploy 为 `wrangler versions upload --config cloudflare/environment-worker/wrangler.preview.jsonc`），产出 per-version preview URL（`<版本前8位>-luxraykit-app-preview.<subdomain>.workers.dev`）做 UI+API 冒烟。三个来之不易的事实：①带 Durable Object 的 Worker 不生成 preview URL（生产 Worker 因此无法直接出 preview）；②Workers Builds 把部署钉死在所连接的 Worker 上，不能在生产 Worker 的 builds 里"上传到别的 worker"，preview 触发器必须建在影子 Worker 自己名下；③wrangler 需配置显式 `preview_urls: true`。影子 Worker 刻意不带 DO/cron/自定义域名/admin secret，刷新路径天然失效。**cron 不在 preview 触发**，但 preview 与生产**共享同一 KV**，对 preview 上的 KV 操作要当作直接影响生产、只读对待。
- **Preview Discord 通知**：Cloudflare Event Subscription 把 `luxraykit-app-preview` 的成功构建写入 `luxraykit-build-events` Queue，由无公开路由的 `luxraykit-build-notifier` consumer 通过 Discord Webhook 发送通知。consumer 只接受影子 Worker 的成功事件，排除 `main` 与全部 `automation/` 分支；Webhook URL 只存 Cloudflare secret。源码与运维说明见 `cloudflare/build-notifier/`。
- **CI**（`.github/workflows/ci.yml`）：两个 job，**不部署**。
  - `test`：`npm run data:pokemon-facts:check` + `npm test` + `npm run build` + Playwright 离线与队伍库渲染冒烟 + `npm run worker:environment:check`。
  - `visual`：`needs: test`，跑 `npm run test:visual`（即容器内的视觉回归），**阻塞门禁**；失败时把 expected/actual/diff 三联图作为 `visual-diffs` artifact 上传。挂在 `test` 后面是为了避免构建已经失败时仍拉取大型浏览器镜像。
- **视觉基线重建**（`.github/workflows/visual-baseline.yml`）：仅手动触发，只允许在功能分支更新 Linux 基线并提交回当前分支；拒绝直接改 `main`。
- **daily-auto-merge**（`.github/workflows/daily-auto-merge.yml`）：每日 20:00 UTC 只自动合并 head 为 `automation/pokedb-environment-refresh` 或 `automation/vgcpastes-team-refresh` 的绿色非 draft PR；功能 / Agent PR 一律人工合并。`main` 无分支保护，合并即触发 Workers Builds 生产部署。
- **Claude PR 助手**（`.github/workflows/claude.yml`）：Issue / PR 中出现 `@claude` 时调用 `anthropics/claude-code-action@v1`；action 默认只接受拥有仓库写权限的触发者，凭据只从 GitHub Secret `CLAUDE_CODE_OAUTH_TOKEN` 读取。
- 仓库 `.github/workflows/` 目前共四个 workflow，均不负责生产部署。不要假设 GitHub Actions 负责部署；生产仍只由 Cloudflare Workers Builds 在 `main` 更新后触发。

---

## 10. 文档可信度分级（2026-08-05 全量核对）

判断一份文档能不能当事实引用，先看它属于哪一档：

| 档位 | 范围 | 怎么用 |
| --- | --- | --- |
| **权威** | 本文件、`AGENTS.md`、代码本身 | 冲突时以代码 > 本文件 > 其他 |
| **现状（已核对）** | `README.md`、`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`、`docs/qa/*`、`docs/progress/DEVELOPMENT_PROGRESS.md` | 可引用；发现偏差请就地修 |
| **计划（非现状）** | `docs/plans/*` | 记录**未实施**的意图。其中的「现状事实」章节一律不可信 |

### 仍待清理的已知偏差

- **代码层**：`index.html` 与 `public/manifest.webmanifest` 的描述文案硬编码了赛季号（当前写着 M-3），与 `src/data/schedule.ts` 去硬编码的目标冲突。静态 HTML 无法读运行时赛季，需要人工同步或改为不含赛季的措辞。

> **维护约定**
> - 改了刷新管线 / 路由 / KV / 分支策略后，同步更新 §6 与 §9。
> - 改了测试门禁、Node 版本或视觉回归流程后，同步更新 §2 与 §8。
> - 计划文档只保留仍有效且适合公开协作的内容；实施完毕或包含本地运维细节的工作稿不进入版本库。
