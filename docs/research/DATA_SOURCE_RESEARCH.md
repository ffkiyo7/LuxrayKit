# 数据来源策略

更新日期：2026-06-11

## 当前数据层

### 规则与 catalog

- 官方 Regulation Set M-A 公告和 eligible Pokémon 页面用于规则元数据与 213 条 allowlist。
- PokeAPI 用于结构化宝可梦、招式、性格和部分中文字段。
- PokéBase Champions 用于当前 learnset、道具图片和 Champions 新增 Mega 数据。
- 社区中文资料用于部分说明文本，所有来源记录在 `dataSourceManifest`。
- 当前数据版本为 `v0.2.0-seed`，仍标记 `manual-review`。

### 环境在线数据

Cloudflare Worker：

- 每 6 小时尝试 PokeDB Season 2，再回退 Season 1。
- 只有单打和双打 ranked-team payload 都有效时才采用该赛季。
- 解析 trainer/list 中可用的公开队报样本。
- 在 KV 保存完整 snapshot、刷新状态和宝可梦队伍索引。
- 公共用户只读取缓存，不直接触发 PokeDB 抓取。

### 环境静态数据

`public/data/pokedb/reg-ma-s1-environment.json` 是离线和 API 故障回退：

- Season 1 单打 528 队、双打 71 队。
- 宝可梦样本占比、道具和队友统计。
- 本地维护脚本解析的前 50 宝可梦招式统计。
- 公开队报链接样本。

## 运行时优先级

1. `/api/environment/latest`
2. `/data/pokedb/reg-ma-s1-environment.json`
3. `environmentDatasetSeed`

所有数据在进入 UI 前都通过 `auditEnvironmentDataset`。未知宝可梦、招式和道具引用会被报告并从可用数据中剔除。

## 环境维护命令

```bash
npm run data:pokedb:environment:check
npm run data:pokedb:environment
```

`--check` 只读比较远端和本地结果；写入命令同步更新源码审计 snapshot 与 public 运行时 JSON。

## 表达规则

- 使用“公开上位构筑样本”“样本占比”，不使用“全服使用率”。
- 明确 Season、更新时间、样本队数和数据来源。
- 聚合的招式、性格或 SP 分布不能冒充某支队伍的原作者配置。
- 环境导入只承诺宝可梦和道具。
- 许可风险高的图片和社区文本必须保留来源记录，不得声称官方授权。

## 当前缺口

- Worker 尚未生成静态维护包的完整 `moveStats`。
- UI 没有展示 Worker fresh / stale。
- Worker 选择 Season 2 时，数据口径页仍存在 M-1 硬编码。
- 多赛季历史、趋势和复杂检索尚未启用 D1。
