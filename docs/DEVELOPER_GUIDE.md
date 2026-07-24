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

- Node：`.node-version` 锁定 **22.16.0**（建议本地用此版本）。
  - ⚠️ 不一致点：CI（`.github/workflows/ci.yml`）使用 Node **24**。两处目前不一致，改动 Node 版本时请同步两边，或视作已知偏差。
- 包管理：npm（仓库提供 `package-lock.json`，CI 用 `npm ci`）。

### 常用命令

```bash
npm install        # 安装依赖
npm run dev        # Vite 开发服务器，绑定 127.0.0.1（移动端优先，建议用手机模拟器调试）
npm run build      # tsc -b 全量类型检查 + vite build → dist/
npm run preview    # 本地预览构建产物
npm test           # Vitest 单元/组件测试（CI 必跑）
npm run test:pwa   # Playwright PWA / 离线测试（不含视觉用例）
npm run test:visual        # 移动端视觉回归，在 Playwright 官方 Docker 容器内跑
npm run test:visual:update # 重建视觉基线（同样在容器内）
```

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
    seed/regMA/         # Regulation Set M-A 版本化 seed（catalog/moves/items/abilities/allowlist/metadata...）
    external/           # 外部抓取产物（pokedb/ 快照、vgcpastes/ 样本、名称映射）
  pages/                # 各页面（懒加载）：Environment / Team / Tools / Calculator / Dex / Speed / Profile / Rule
  components/           # BottomNav / Header / PokemonPicker / onboarding / ui 等
  hooks/                # useAutoHideBottomNav / useVisualViewportMetrics

cloudflare/environment-worker/   # 生产 Worker（前端 + API + cron + DO）
scripts/                         # 数据维护脚本（Node ESM .mjs）
public/                          # 静态资源 + sw.js + manifest + 静态环境快照
tests/pwa/                       # Playwright 规格 + 视觉快照基线
docs/                            # 产品/研究/QA/进度文档（部分过期）
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
- `toolView: 'calculator' | 'dex' | 'speed' | null` —— 工具页内的二级视图。
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

### 5.2 环境数据加载管线（`src/data/environment.ts`）

`loadEnvironmentState()` 是前端读取环境数据的唯一入口，三级回退：

1. **Worker 快照**：`GET /api/environment/latest?refresh=<ts>`（`cache: 'no-store'`）。读响应头 `x-luxray-cache-state`（`fresh`/`stale`）、`x-luxray-source-status`（`ok`/`degraded`）和 `x-luxray-latest-source-updated-at`（探针已知的上游最新时间）决定 `freshness` / `sourceStatus`。若 Worker 为 `stale` 或 `degraded`，继续读取静态快照并按源更新时间选择更新的一份；静态快照追平探针时间时仍标记为 `fresh`，避免健康的冗余快照被旧 Worker 数据遮蔽或误报为过期。
2. **静态快照**：`/data/pokedb/reg-ma-environment.json`（`cache: 'force-cache'`）。供 Worker 降级比较、纯静态部署与离线使用。
3. **内置 seed**：`environmentFallbackState`（来自 `environmentDatasetSeed.ts`），始终可用的开发样例。

每级成功拿到 base 快照后，再**并行**懒加载 VGCPastes 锦标赛样本（`loadVgcPastesTeamSamples`）合并进去。VGCPastes 按 regulation 拆成独立 build chunk（`reg_ma_*` / `reg_mb_*`），单个文件失败只是少一批样本，不会让整页空白（`loadVgcPastesRegulationFile` 各自 try/catch）。

`PokeDbEnvironmentSnapshotPayload` 支持三种 PokeDB 形态（statistics / trainer-list / open-data ranked-teams），由 `isStatisticsPayload` / `isTrainerListPayload` 分派到对应 builder。

### 5.3 数据审计（`lib/environmentDataset.ts`）

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
| `environment:latest` | 当前对外快照 |
| `environment:status` | 刷新状态（`refreshedAt` / `sourceUpdatedAt` / 审计） |
| `environment:team-index` | 宝可梦 → 队伍倒排索引 |
| `environment:refresh-job` | 进行中的刷新 job（`stepCount` / `failureCount`） |
| `environment:pokedb-freshness-probe` | 上游新鲜度探针（season + 更新日签名） |

### 6.3 在线刷新管线：cron + Durable Object alarm

> **现状（2026-07）**：生产保留两条独立刷新路径。Worker cron + DO 成功时直接更新 KV，供前端第一层读取；外部维护主机可通过 `automation/pokedb-environment-refresh` PR 更新仓库静态 JSON，随 `main` 部署后成为第二层回退（见 §7.1 与 §9）。上游会按出口 IP 动态拒绝请求，最近实测曾出现 Worker 刷新成功而东京 Lightsail 出口被拒，因此两条路径互为冗余，不能把任一固定主机视为唯一来源。诊断时同时检查 `/api/environment/status`、KV 状态和最近的静态快照 PR。

Worker 内刷新由 **cron 触发、Durable Object alarm 步进**，而非自链式 `env.SELF.fetch`。

- **触发**（`scheduled` handler）：cron 触发后加随机抖动（`SCHEDULED_MAX_JITTER_MS`，避开固定整点 bot 节奏），调 `startScheduledRefresh` 先发廉价 list 页探针；按「season + 更新日」内容签名比对，**仅在上游变化时**创建刷新 job。cron 时间见 `wrangler.jsonc`（约 `15:35` / `16:05` UTC 主窗口围绕 PokeDB 每日 00:30 JST 发布，加 `02/08/20:35` 稀疏兜底）。
- **步进**（`EnvironmentRefreshDurableObject.alarm`）：DO alarm 每约 `REFRESH_ALARM_DELAY_MS = 1000ms` 跑一步 `runRefreshJobStep`，直到 job `done` 后自动清理（删 job + 删 alarm）。
- **失败重试**：单步异常累加 `failureCount`，达到 `MAX_REFRESH_JOB_FAILURES = 6` 则放弃（记日志）；否则 `REFRESH_ALARM_FAILURE_RETRY_MS = 10min` 后重试。
- **为何这样设计**：免费计划单次 Worker 调用**最多 50 个外部子请求**，所以宝可梦详情是 cursor 分批抓（`POKEDB_DETAIL_CHUNK_SIZE`）；DO alarm 取代旧的 cron 自链——旧方案里子请求的 `waitUntil` 在 cron 父调用结束时被取消，导致 job 卡住、数据显示「可能过期」。

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
npm run data:pokedb:environment:pr     # 外部主机刷新静态快照并创建/更新自动化 PR
npm run data:pokedb:speed              # 重新生成速度线参照档 src/data/speedTiers.ts
npm run data:pokedb:speed:check
npm run data:vgcpastes:champions-ma    # 摄入 VGCPastes「Champions M-A」样本
npm run data:vgcpastes:champions-mb    # M-B 同上（--reg=mb）
npm run data:vgcpastes:champions-ma:check  # 只校验 M-A 产物是否与来源一致
npm run data:vgcpastes:champions-mb:check  # M-B 同上
npm run data:vgcpastes:pr              # 外部主机默认刷新 M-B 并创建/更新自动化 PR
npm run data:regma:allowlist / :abilities / :moves   # 重生成 seed 派生数据
```

`update-pokedb-environment.mjs` 会同时写源码审计快照（`src/data/external/pokedb/current_environment_snapshot.json`）与 public 运行时 JSON（`public/data/pokedb/reg-ma-environment.json`），后者即前端第二级回退。

### 7.1 外部环境快照刷新器（冗余路径）

环境快照可以由一台低配外部主机生成静态回退数据。这是 §6.3 Worker→KV 在线刷新之外的冗余路径，不是唯一生产来源：外部主机不承载线上流量、不写 Cloudflare KV，也不直接改 `main`；它只运行维护脚本，推送自动化分支并创建/更新 PR。后续由 GitHub CI 与 `daily-auto-merge.yml` 合入 `main`，再触发 Cloudflare Workers Builds 部署静态 JSON。截至 2026-07，机械刷新与 Hermes 服务合并在同一台 AWS Lightsail VM，但使用独立的 `/home/ubuntu/LuxrayKit-maintenance` clone 与系统 cron；Hermes 策展 agent 仍使用 `/home/ubuntu/LuxrayKit` 和 Hermes 内置调度器。这是运维合并，不是数据路径合并。上游仍可能按出口 IP 动态拒绝任一主机；失败时 Worker 在线路径与已有静态回退独立可用。

VPS 端一次性准备：

```bash
sudo apt-get update
sudo apt-get install -y git gh
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# 512MB Lightsail 实例建议加 1GB swap，避免 npm ci 内存吃紧。
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

GitHub 凭据建议使用 fine-grained PAT，仓库访问只选 LuxrayKit。测试 clone 阶段只需要 `Contents: Read-only`；自动 PR 阶段需要 `Contents: Read and write`、`Pull requests: Read and write`、`Metadata: Read`。如果同一凭据还供 Hermes watchdog 读取 CI / auto-merge run，额外给 `Actions: Read-only`。不要给 `Administration`、`Actions: Read and write`、`Secrets`、`Workflows` 或全仓库权限。

VPS clone 后安装依赖并做一次冒烟：

```bash
npm ci --no-audit --no-fund
npm run data:pokedb:environment:check -- --detail-limit=3 --skip-team-samples
npm run data:pokedb:environment:check
```

确认完整 `--check` 能抓完单/双各 60 个详情页和队伍样本后，配置 `gh`：

```bash
echo "$GITHUB_PAT" | gh auth login --with-token
gh auth setup-git
git config user.name "LuxrayKit VPS Refresh Bot"
git config user.email "luxraykit-vps-refresh-bot@users.noreply.github.com"
```

手动跑一次自动 PR：

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

cron 示例（Ubuntu 默认按系统时区；若保持 UTC，请安排在 Worker 主刷新窗口之后；cron 每日执行门控检查，但只在 Worker 失败时抓取 PokeDB）：

```cron
PATH=/usr/local/bin:/usr/bin:/bin
30 17 * * * cd /home/ubuntu/LuxrayKit-maintenance && npm run data:pokedb:environment:pr >> /home/ubuntu/pokedb-environment-refresh.log 2>&1
```

可选环境变量：

```bash
export POKEDB_FETCH_ATTEMPTS=5
export POKEDB_FETCH_TIMEOUT_MS=20000
export POKEDB_FETCH_RETRY_DELAY_MS=2000
export POKEDB_PAGE_DELAY_MS=0
```

`POKEDB_PAGE_DELAY_MS=0` 适合只由固定 VPS 低频刷新时提速；如上游出现 429 或不稳定，再改成 `150` 或移除此变量，恢复脚本默认的人类化页间延迟。

### 7.2 外部主机队伍库刷新器

VGCPastes 队伍库的每周机械刷新复用 §7.1 当前配置的外部维护主机、maintenance clone、`gh` 认证和 bot git 身份；这是部署选择，不表示 PokeDB 环境快照只来自该主机。即使机械刷新与 Hermes 服务位于同一台 VM，队伍库刷新也与低频策展 agent 保持独立 clone、调度器和职责。策展职责与 draft PR 规则见 `docs/automation/TEAM_LIBRARY_CURATION.md`。

手动执行：

```bash
npm run data:vgcpastes:pr                 # 默认只刷新活跃增长的 M-B
npm run data:vgcpastes:pr -- --reg=mb,ma  # 明确需要时同时刷新 M-B、M-A
npm run data:vgcpastes:pr -- --dry-run    # 分支/index/worktree 不变，不推送、不创建 PR
```

`scripts/create-vgcpastes-refresh-pr.mjs` 从最新 `origin/main` 重建 `automation/vgcpastes-team-refresh`，运行既有摄入脚本，并只允许提交 `src/data/external/vgcpastes/` 下四个生成 JSON。默认不重跑筛选窗口已冻结的 M-A，以避免约 100 次无效 pokepast.es 请求。

脚本在 push 和创建 ready PR 前读取本轮 audit：任一 regulation 的 issues 超过 10、M-A 少于 90 支或 M-B 少于 20 支都会失败退出且恢复生成文件，不污染后续 cron。通过后，PR 仍须经过契约单测、应用 build、Playwright 队伍库渲染断言和 Worker dry-run；`daily-auto-merge.yml` 只会合并白名单分支上的非 draft、无 `hold` 标签、包含最新 `main` 且指定 CI check 成功的 PR。

需要人工暂停自动合并时，给 PR 添加 `hold` 标签。虽然 workflow 本身也跳过 draft，但刷新脚本下次复用该自动化 PR 时会把它转回 ready，因此 draft 不是持久暂停开关。

两个外部刷新 cron 共用一个 clone：VGCPastes 脚本发现脏工作区会直接拒跑；现有 PokeDB 脚本若半途失败，可能留下脏生成文件，进而让下一次队伍库刷新响亮失败。PokeDB 后续成功运行会从 `origin/main` 重建分支并自愈；若要提前恢复，先核对失败日志和生成文件，不要绕过工作区保护。

UTC 时区的每周一 cron 示例（与每日 PokeDB 刷新错开）：

```cron
PATH=/usr/local/bin:/usr/bin:/bin
30 16 * * 1 cd /home/ubuntu/LuxrayKit-maintenance && npm run data:vgcpastes:pr >> /home/ubuntu/vgcpastes-team-refresh.log 2>&1
```

---

## 8. 测试

- **单元/组件**：Vitest + jsdom + `@testing-library` + `fake-indexeddb`。`npm test`，CI 必跑；其中 `src/data/vgcpastesTeamSamples.contract.test.ts` 对队伍库生成 JSON 做数量、字段、唯一性与 audit 对齐门禁。配置见 `vite.config.ts` 的 `test` 段与 `vitest.setup.ts`。
- **PWA**：`tests/pwa/offline.spec.ts`（离线缓存）+ `tests/pwa/team-samples.spec.ts`（队伍库生成数据渲染）+ `tests/pwa/visual.spec.ts`（移动端视觉回归，17 个状态，基线在 `tests/pwa/visual.spec.ts-snapshots/`，命名含 `visual-mobile-390-linux`）。配置见 `playwright.config.ts`，分成两个 project：
  - `chrome-mobile-390`（`channel: 'chrome'`，`testIgnore` 掉视觉用例）跑功能类冒烟，用机器上已装的 Google Chrome，CI runner 自带因此无需下载浏览器。`npm run test:pwa` 已固定到这个 project。
  - `visual-mobile-390` 只跑视觉用例，用 `@playwright/test` 自带、被 `package-lock.json` 锁死的 Chromium——刻意不用 `channel: 'chrome'`，因为 Chrome stable 会自动升级，任何一次字体/光栅化变更都会悄悄让基线腐烂。
- **视觉基线只在 Playwright 官方容器内生成**，镜像 tag 由 `scripts/visual-docker.sh` 从已安装的 `@playwright/test` 版本推导（当前 `mcr.microsoft.com/playwright:v1.59.1-noble`），保证浏览器与字体只随依赖升级而变：
  - 校验：`npm run test:visual`
  - 重建：`npm run test:visual:update`
  - 前置条件：本机有可用的 Docker daemon。WSL2 下可直接装原生 Docker Engine（`apt` 装 `docker-ce`，由 systemd 托管，不需要 Docker Desktop）；若走代理拉镜像，需给 dockerd 配 `/etc/systemd/system/docker.service.d/http-proxy.conf` 并 `systemctl restart docker`（`enable --now` 对已在运行的服务不会重启，改完 drop-in 必须显式 restart）。
  - 不要在宿主机直接 `npx playwright test tests/pwa/visual.spec.ts`：宿主字体栈与镜像不同，只会得到整屏假阳性 diff。
  - 历史背景：2026-07 之前基线是在 Windows 上生成的（`chrome-mobile-390-win32`），只有 Windows 能验证；迁到 WSL2 开发后改为容器生成，任何平台都能复现。
- **视觉用例刻意与刷新中的数据解耦**，否则它没法当门禁用——环境快照的时间戳和榜单会直接印进截图，每次数据刷新都会让门禁变红、卡住 daily auto-merge：
  - `tests/pwa/fixtures/environment-snapshot.json` 是 `public/data/pokedb/reg-ma-environment.json` 的冻结副本，用例用 `page.route` 把运行时那次 fetch 拦截掉换成它。要让门禁看到更新后的数据，把线上文件复制过来覆盖 fixture，再重建基线——这是一次有意的动作，不是自动的。
  - `page.clock.setFixedTime` 把时钟钉在 `2026-07-20T12:00:00Z`：赛季/规则 header 和"可能过期"徽标都由挂钟时间推导，不钉住的话跨过赛季窗口或新鲜度阈值时像素会自己变。
  - **残留耦合**：VGCPastes 队伍库是 build-time 动态 `import()` 的 bundle 产物，拦不住。`automation/vgcpastes-team-refresh`（周级）如果改到截图里可见的靠前队伍，视觉门禁会红——这时人工确认后重建基线即可。PokeDB 环境刷新（日级，churn 的大头）已经被 fixture 完全隔离。

---

## 9. 部署与 CI

- **部署**：经 **Cloudflare Workers Builds（Git 集成）**——push 到 `main` 自动构建并 `wrangler deploy`。preview 走**影子 Worker `luxraykit-app-preview`**：它有自己的 Workers Builds 配置（同一 repo，非 main 分支触发，deploy 为 `wrangler versions upload --config cloudflare/environment-worker/wrangler.preview.jsonc`），产出 per-version preview URL（`<版本前8位>-luxraykit-app-preview.<subdomain>.workers.dev`）做 UI+API 冒烟。三个来之不易的事实：①带 Durable Object 的 Worker 不生成 preview URL（生产 Worker 因此无法直接出 preview）；②Workers Builds 把部署钉死在所连接的 Worker 上，不能在生产 Worker 的 builds 里"上传到别的 worker"，preview 触发器必须建在影子 Worker 自己名下；③wrangler 需配置显式 `preview_urls: true`。影子 Worker 刻意不带 DO/cron/自定义域名/admin secret，刷新路径天然失效。**cron 不在 preview 触发**，但 preview 与生产**共享同一 KV**，对 preview 上的 KV 操作要当作直接影响生产、只读对待。
- **CI**（`.github/workflows/ci.yml`）：两个 job，**不部署**。
  - `test`：`npm test` + `npm run build` + Playwright 离线与队伍库渲染冒烟 + `npm run worker:environment:check`。
  - `visual`：`needs: test`，跑 `npm run test:visual`（即容器内的视觉回归），**阻塞门禁**；失败时把 expected/actual/diff 三联图作为 `visual-diffs` artifact 上传。挂在 `test` 后面是为了别在构建已经挂掉时还白拉一次 2GB 镜像——本仓库是 private，Actions 分钟数是计量的（近 30 天约 62 次运行，加上这个 job 后月用量约 500/2000 分钟）。
- **daily-auto-merge**（`.github/workflows/daily-auto-merge.yml`）：每日 20:00 UTC 只自动合并 head 为 `automation/pokedb-environment-refresh` 或 `automation/vgcpastes-team-refresh` 的绿色非 draft PR；功能 / Agent PR 一律人工合并。`main` 无分支保护，合并即触发 Workers Builds 生产部署。
- 仓库 `.github/workflows/` 目前只有上述两个 workflow（无独立 deploy workflow）。不要假设 GitHub Actions 负责部署或自动跑端到端。

---

## 10. 已知过期文档（核对结论）

写本文档时核对了现有文档与代码，以下为已确认的偏差，供清理时参考：

- `docs/progress/DEVELOPMENT_PROGRESS.md`（标注 2026-06-19）多处过期：
  - 称「速度线入口关闭，保留为未开放卡片」——实际速度线工具已上线且功能完整（`SpeedPage`，`App.tsx` 的 `toolView==='speed'`）。
  - 称 cron 为每小时 `17 * * * *`——实际为 `wrangler.jsonc` 中 5 个定点时间，且刷新改由 **Durable Object alarm** 步进。
  - 称自定义域名 routes「已注释/停用」——实际 `routes` 已启用（`custom_domain: true`）。
- `cloudflare/environment-worker/README.md`：称「Cron refreshes ... once per day」未覆盖 DO + alarm 步进与失败重试机制（见 §6.3）；其余一次性 Cloudflare 配置步骤仍有效。
- 根 `README.md`：偏产品/功能介绍，技术细节不足以指导开发；`data:vgcpastes` 只列了 M-A，实际还有 M-B（`data:vgcpastes:champions-mb`）。

> 维护约定：改了刷新管线 / 路由 / KV / 分支策略后，请同步更新本文件 §6 与 §9，避免再次出现「文档与代码漂移」。
