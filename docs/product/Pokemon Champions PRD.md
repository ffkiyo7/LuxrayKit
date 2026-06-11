# Luxray Kit 产品需求文档

更新日期：2026-06-11

## 产品定位

Luxray Kit 是面向 Pokémon Champions 玩家的移动端优先 PWA。产品主线是环境理解、公开上位构筑参考和本地队伍管理；规则图鉴与伤害计算是辅助查询工具。

当前规则数据集为 Regulation Set M-A，数据版本为 `v0.2.0-seed`。应用是非官方粉丝工具，不提供官方机制、合法性或赛事结论。

## 当前用户路径

1. 打开应用后默认进入环境页。
2. 在单打 / 双打之间切换，查看宝可梦榜、完整榜单、环境详情和数据口径。
3. 从公开队报样本导入宝可梦与道具骨架，再在本地队伍中补充形态、特性、性格、SP 和招式。
4. 使用规则图鉴和伤害计算验证配置。
5. 在“我的”中切换主题、导入 / 导出 JSON 备份或清除本地数据。

## 已交付范围

### 环境

- Worker API `/api/environment/latest` 为在线首选数据源。
- API 不可用时回退到 `public/data/pokedb/reg-ma-s1-environment.json`，再失败时使用开发 seed。
- 展示样本占比、队伍数、常用招式、携带道具、常见队友和公开队报样本。
- 提供独立“数据口径”页，说明样本池与百分比分母。
- Worker 每 6 小时尝试刷新 PokeDB Season 2，失败时回退 Season 1，并把结果写入 Cloudflare KV。

### 队伍

- IndexedDB 本地持久化、队伍 CRUD、最多 6 名成员。
- 成员支持形态、特性、道具、性格、4 个招式、Champions SP 和备注。
- 支持环境样本导入、JSON 导入 / 导出、完整本地备份和分享图。
- 首次导入环境样本时明确提示：只稳定带入宝可梦和道具。

### 工具

- 规则图鉴：宝可梦、招式、道具、特性查询，支持搜索、属性筛选、Mega 筛选和 learnset。
- 伤害计算：基于 `@smogon/calc` Gen9 的实验性主线近似，用户显式选择双方配置和战斗条件。
- 速度线：底层计算和旧页面仍保留，但当前产品入口已关闭并显示“敬请期待”。

### PWA 与部署

- Service Worker 缓存应用壳、环境静态快照和道具图片。
- Cloudflare Worker 同时提供静态资源、API、KV 缓存和 Cron。
- `luxraykit.com` 与 `www.luxraykit.com` 指向 `luxraykit-app` Worker。
- 推送 `main` 后，GitHub Actions 运行 `npm test` 并部署 Worker。

## 产品边界

- 环境统计是公开上位构筑样本，不是全服实时使用率。
- 环境样本不保证包含原作者的完整性格、SP、特性和配招。
- 伤害计算只处理单次招式，不模拟换人、回合、队友行动、命中率或完整状态机。
- 天气、场地、能力阶级、HP、异常状态、会心和保护状态由用户输入；除少数招式或特性本身的直接规则外，不自动推导战斗流程。
- 本地队伍和偏好不跨设备同步，没有账号系统。

## 当前验收

```bash
npm run data:pokedb:environment:check
npm test
npm run build
npm run worker:app:check
npm run test:pwa
npm run test:visual
```

## 成功标准

- 在线环境数据失败时仍能使用内置快照。
- 离线重载后环境、队伍、图鉴、伤害计算和本地备份仍可访问。
- 所有数据来源、计算近似和导入缺失字段都以克制、可核对的文案表达。
- `main` 始终保持测试、构建和 Worker 部署可通过。
