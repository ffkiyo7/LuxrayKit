# 下一轮开发计划

更新日期：2026-06-11

## 目标

让 Worker 在线环境数据与静态离线快照在数据口径、详情丰富度和状态表达上保持一致，同时继续守住本地优先和工具边界。

## P0：环境数据一致性

- 移除数据口径页的 `M-1` 硬编码，展示 snapshot 实际赛季。
- 把 Worker `dataFreshness`、KV fresh / stale 状态映射到前端状态标签。
- 明确 Worker、静态快照和开发 seed 三种来源。
- 为环境加载失败提供重试入口。
- 确认在线 Worker snapshot 缺少 `moveStats` 时的 UI 行为。

## P0：自动化与发布

- 在 GitHub Actions 中增加 `npm run build` 和 `npm run worker:app:check`。
- 评估是否把 Playwright 离线 smoke 加入发布前检查。
- 为 Worker refresh、Season 2 回退 Season 1、trainer/list 部分失败增加自动测试。
- 部署后检查 `/health` 和 `/api/environment/status`。

## P1：丰富 Worker 产物

在以下方案中选定一种：

1. 将本地详情页解析逻辑移入定时 Worker。
2. 在 CI 生成完整 JSON，再由 Worker 缓存。
3. 保持 Worker 只存 ranked teams，并从独立产物补充招式统计。

任何方案都必须保留：

- 公开用户只读缓存，不直接触发 PokeDB 抓取。
- 未知宝可梦、道具和招式引用的审计。
- API 失败时的静态离线回退。

## P1：产品与 QA

- 增加数据源 / stale / offline 状态截图。
- 修正 README 中速度线、视觉截图数量和部署架构的旧描述。
- 复核分享图、品牌图标和 Open Graph 元数据。
- 清理未再路由使用的 `SpeedPage`、`SettingsPage` 前先确认是否保留作为后续实现基础。

## 暂不做

- 完整战斗模拟器。
- 用户账号、云同步和跨设备队伍。
- 多赛季趋势与 D1 历史库，除非产品确实需要多条件检索或历史分析。

## 验收标准

- 在线、Worker 故障、完全离线三种路径都能解释当前数据来源。
- Worker 与前端不再对赛季产生冲突文案。
- 所有测试、构建和 Worker dry-run 通过。
- 文档与当前入口、API、部署和测试数量一致。
