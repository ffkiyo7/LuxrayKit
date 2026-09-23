# 数据来源策略

更新日期：2026-09-23（原始定稿 2026-06-18）

管线细节（刷新 job、KV 键、回退比较、脚本参数）以 [DEVELOPER_GUIDE](../DEVELOPER_GUIDE.md) 为准；本文只记来源分工与表达规则。

## 当前数据层

### 规则与 catalog

- 当前规则与数据版本一律读 `src/data/seed/regMA/metadata.ts` 的 `currentRuleSet` / `currentDataVersion`（2026-09-23：Regulation Set M-C，`v0.4.0-mc-seed`，仍标记 `manual-review`）。
- 官方规则公告用于规则元数据；官方 Eligible Pokémon web-view 是 allowlist 的合法性来源（M-C 262 行）。PokéBase 的 regulation 标签不完整，不得作为合法性来源。
- PokeAPI 用于结构化宝可梦、招式、性格和部分中文字段。
- PokéBase Champions 用于当前种族值 / 属性 / 特性 / learnset、道具图片和 Champions 新增 Mega 数据。
- 社区中文资料用于部分说明文本。所有来源及许可风险记录在 `dataSourceManifest`。

### 环境在线数据

Cloudflare Worker（`cloudflare/environment-worker/`）：

- 由 cron 触发动态探测 PokeDB 最新赛季：集中在 PokeDB 每日发布（约 15:30 UTC）前后，外加 02:35 / 08:35 / 20:35 UTC 的兜底检查（`wrangler.jsonc` 的 `triggers.crons`）。
- 抓取单打和双打 Pokemon ranking/detail statistics（详情默认前 60，`POKEDB_DETAIL_LIMIT`），并补充公开队报样本。
- Worker 与静态维护脚本共用 PokeDB HTML 解析入口。
- 在 KV 保存完整 snapshot、刷新状态和宝可梦队伍索引；snapshot 另携带上一赛季排名（`previousSeason`，只存一季、只存名次），用于名次变动。
- 公共用户只读取缓存，不直接触发 PokeDB 抓取。

### 环境静态数据

`public/data/pokedb/reg-ma-environment.json` 是离线和 API 故障回退：

- 最新赛季 Pokemon ranking/detail statistics。
- 默认抓取单打 / 双打各前 60 个宝可梦详情页。
- 包含招式、道具、队友、特性、性格统计。
- 补充上一完整赛季公开队报链接样本；该赛季没有队报时继续往前回溯（`POKEDB_SAMPLE_SEASON` 可钉死赛季）。

### 锦标赛样本

VGCPastes 样本按 regulation 生成到 `src/data/external/vgcpastes/`（当前 M-B / M-C），构建时打进独立 chunk，在 base 快照加载后合并进上位构筑；刷新走 `automation/vgcpastes-team-refresh` PR。

## 运行时优先级

1. `/api/environment/latest`（Worker fresh 且 `sourceStatus` 正常时直接使用）
2. `/data/pokedb/reg-ma-environment.json`（Worker stale / degraded 时与其比较来源时间，取较新的一份；Worker 不可达时直接使用）
3. `environmentDatasetSeed`

所有数据在进入 UI 前都通过 `auditEnvironmentDataset`。未知宝可梦、招式和道具引用会被报告并从可用数据中剔除。

## 环境维护命令

```bash
npm run data:pokedb:environment:check
npm run data:pokedb:environment
```

`--check` 只读比较远端和本地结果；写入命令同步更新源码审计 snapshot（`src/data/external/pokedb/current_environment_snapshot.json`）与 public 运行时 JSON。

## 表达规则

- 使用“公开上位构筑样本”“样本占比”，不使用“全服使用率”。当前榜单只给名次和名次变化，页面明示「不是官方使用率」；环境详情前 60 名的招式 / 道具等统计以「使用率 x%」展示（PokeDB 详情页数据）。
- 明确 Season、更新时间、样本队数和数据来源。
- 聚合的招式、性格或 SP 分布不能冒充某支队伍的原作者配置。
- 环境导入：PokeDB 样本只含宝可梦和道具；样本自带性格 / SP / 配招时一并带入（配招过滤到当前规则可学、最多 4 个）。导入成员一律标 `needs-review`（`src/lib/environmentImport.ts`）。
- 许可风险高的图片和社区文本必须保留来源记录，不得声称官方授权。

## 当前缺口

- UI 会提示 stale（「可能过期」）、degraded（「数据源异常」）和离线，数据口径页区分 PokeDB 与开发 seed，但不区分当前数据来自 Worker 还是静态 snapshot。
- 多赛季历史、趋势和复杂检索尚未启用 D1（Worker 只保留上一赛季名次）。
