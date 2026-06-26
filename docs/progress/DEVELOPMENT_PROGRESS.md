# Luxray Kit 开发进度

更新日期：2026-06-26

> 工程细节（架构 / Worker 刷新管线 / 部署）以 `docs/DEVELOPER_GUIDE.md` 为准，本文件只记录进度概要。

## 当前阶段

环境优先重构、Luxray Kit 品牌更新和 Cloudflare Worker 统一部署已进入 `main`。生产站点由 `luxraykit-app` Worker 提供静态资源与 API，环境页在线优先读取 KV 中的 PokeDB snapshot，并保留最新赛季静态快照和开发 seed 两级回退。

## 已完成

### 产品与界面

- 默认环境页和 4 Tab 导航。
- 单打 / 双打环境榜、完整榜单、环境详情和数据口径页。
- 上位构筑导入、首次字段覆盖提示、导入后高亮和 Toast。
- 本地队伍 CRUD、成员编辑、配队分析、JSON 备份和分享图。
- 规则图鉴、伤害计算与速度线收束到工具页，速度线已上线（超速反哺建议、环境参照档）。
- 深浅主题和滚动时自动隐藏底部导航。

### 数据

- Regulation Set M-A allowlist 213 条。
- 当前 seed 包含本地宝可梦、形态、招式、learnset、道具、特性、Mega 和来源 manifest。
- 静态环境快照已刷新为 PokeDB M-3：单打 228 个排名、双打 211 个排名，各含前 60 个宝可梦详情统计和队报样本。
- Worker 和静态维护脚本均动态探测最新赛季，并复用 PokeDB HTML 解析入口。
- 数据进入 UI 前经过 `EnvironmentDataset` 审计，未知引用会被报告并过滤。

### Cloudflare

- Worker 路由：`/health`、`/api/environment/status`、`/api/environment/latest`、`/api/pokemon/:pokemonId/teams`、受保护的 `/api/environment/refresh`。
- KV key：`environment:latest`、`environment:status`、`environment:team-index`、`environment:refresh-job`、`environment:pokedb-freshness-probe`。
- Cron 探针 + Durable Object 步进：`wrangler.jsonc` 配多个定点 Cron（围绕 PokeDB 每日 00:30 JST 发布窗口 + 稀疏兜底），cron 先发廉价 list 页请求，按「season + 更新日」内容签名（PokeDB 当前无 ETag/Last-Modified）比对；签名未变即廉价退出，有变化才创建刷新 job，再由 `EnvironmentRefreshDurableObject` 的 alarm 每约 1s 步进一次 cursor 分批刷新，完成后自动清理，失败重试上限 6 次（间隔 10min）。详见 `docs/DEVELOPER_GUIDE.md` §6.3。
- Worker 同时托管 Vite `dist`，支持 SPA fallback。
- GitHub Actions（`.github/workflows/ci.yml`）只跑 `npm test` / `npm run build` / Worker 校验，**不负责部署**；`main` 的实际部署由 Cloudflare Workers Builds（Git 集成）以 `cloudflare/environment-worker/wrangler.jsonc` 执行 `wrangler deploy`。
- **自定义域名（`luxraykit.com` / `www.luxraykit.com`）已启用**：`wrangler.jsonc` 的 `routes` 以 `custom_domain: true` 绑定两个裸主机名，deploy 时 Cloudflare 自动建橙云代理 DNS 并签证书。如需停用，注释该 `routes`（注意 deploy 不会自动删除已存在路由，需在 Dashboard 手动删一次）。

### 测试

- Vitest 覆盖 App、IndexedDB、导入导出、环境审计、PokeDB 转换、合法性、SP、伤害 adapter 和分享图。
- Playwright 离线用例覆盖环境、队伍持久化、备份，并断言速度线离线可用。
- 视觉回归覆盖 17 个移动端状态。

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

## 文档索引

- 开发者文档（架构 / Worker / 部署）：`docs/DEVELOPER_GUIDE.md`
- 产品现状：`docs/product/Pokemon Champions PRD.md`
- 范围边界：`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`
- 下一轮：`docs/progress/NEXT_ROUND_PLAN.md`
- 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 数据来源：`docs/research/DATA_SOURCE_RESEARCH.md`
- 计算边界：`docs/research/CALC_ENGINE_SPIKE.md`
