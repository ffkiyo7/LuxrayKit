# Luxray Kit 开发进度

更新日期：2026-06-11

## 当前阶段

环境优先重构、Luxray Kit 品牌更新和 Cloudflare Worker 统一部署已进入 `main`。生产站点由 `luxraykit-app` Worker 提供静态资源与 API，环境页在线优先读取 KV 中的 PokeDB snapshot，并保留静态 S1 快照和开发 seed 两级回退。

## 已完成

### 产品与界面

- 默认环境页和 4 Tab 导航。
- 单打 / 双打环境榜、完整榜单、环境详情和数据口径页。
- 上位构筑导入、首次字段覆盖提示、导入后高亮和 Toast。
- 本地队伍 CRUD、成员编辑、配队分析、JSON 备份和分享图。
- 规则图鉴与伤害计算收束到工具页。
- 速度线入口关闭，保留为未开放卡片。
- 深浅主题和滚动时自动隐藏底部导航。

### 数据

- Regulation Set M-A allowlist 213 条。
- 当前 seed 包含本地宝可梦、形态、招式、learnset、道具、特性、Mega 和来源 manifest。
- 静态环境快照包含 PokeDB S1 单打 528 队、双打 71 队，以及本地维护生成的招式统计和队报样本。
- Worker 按 Season 2、Season 1 顺序拉取 ranked-team Open Data，并解析 trainer/list 队报样本。
- 数据进入 UI 前经过 `EnvironmentDataset` 审计，未知引用会被报告并过滤。

### Cloudflare

- Worker 路由：`/health`、`/api/environment/status`、`/api/environment/latest`、`/api/pokemon/:pokemonId/teams`、受保护的 `/api/environment/refresh`。
- KV key：`environment:latest`、`environment:status`、`environment:team-index`。
- 每 6 小时 Cron 刷新。
- Worker 同时托管 Vite `dist`，支持 SPA fallback。
- `main` 推送由 GitHub Actions 执行 `npm test` 后部署。

### 测试

- Vitest 覆盖 App、IndexedDB、导入导出、环境审计、PokeDB 转换、合法性、SP、伤害 adapter 和分享图。
- Playwright 离线用例覆盖环境、队伍持久化、备份和禁用速度线。
- 视觉回归覆盖 13 个移动端状态。

## 当前边界与已知问题

- Worker snapshot 暂未生成静态维护包中的完整 `moveStats`。
- 数据口径页仍硬编码“M-1”，与 Worker 可选择 Season 2 的能力不完全一致。
- UI 尚未显示 Worker fresh / stale 响应头或手动“检查更新”。
- API 和静态快照都失败时使用开发 seed，加载失败页没有重试按钮。
- 速度计算底层仍存在，但产品入口关闭。
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

## 文档索引

- 产品现状：`docs/product/Pokemon Champions PRD.md`
- 范围边界：`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`
- 下一轮：`docs/progress/NEXT_ROUND_PLAN.md`
- 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 数据来源：`docs/research/DATA_SOURCE_RESEARCH.md`
- 计算边界：`docs/research/CALC_ENGINE_SPIKE.md`
