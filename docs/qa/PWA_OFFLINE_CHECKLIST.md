# PWA 离线验收清单

更新日期：2026-06-11

## 当前策略

- Service Worker cache 名称为 `champions-tool-v2`。
- 安装时预缓存 `/`、`/index.html`、manifest、图标和静态环境快照。
- 道具图片逐个尝试预缓存，单个失败不会阻止安装。
- 同源 GET 请求采用缓存优先并后台更新；网络失败时回退缓存。
- 环境页在线优先请求 Worker API，失败后读取预缓存的静态 S1 snapshot。
- 队伍和偏好保存在 IndexedDB v2。

## 自动化

```bash
npm run test:pwa
```

当前 `tests/pwa/offline.spec.ts` 验证：

- Service Worker 已激活。
- 在线重载后环境页可见。
- 创建的本地队伍在离线重载后仍存在。
- “我的”中的备份和离线缓存入口可见。
- 速度线在线和离线都保持禁用。

## 手动验收

- [ ] 首次在线打开，确认环境页完成加载。
- [ ] 打开完整榜单、环境详情、规则图鉴和伤害计算，让相关 lazy chunks 进入缓存。
- [ ] 创建并编辑一支队伍。
- [ ] 导出本地备份。
- [ ] 切换为离线并重载。
- [ ] 环境页使用静态 snapshot，而不是开发 seed。
- [ ] 队伍仍可查看和编辑。
- [ ] 图鉴与伤害计算已访问页面仍可打开。
- [ ] “我的”页可见，主题和本地数据正常。
- [ ] 速度线仍显示“敬请期待 / 未开放”。
- [ ] 恢复网络后 Worker API 可再次读取。

## 已知限制

- 首次安装前完全离线无法使用。
- 未访问过的异步 chunk 不保证在离线状态可用。
- Worker API 响应不在安装时预缓存；离线依赖静态 S1 snapshot。
- Service Worker 未提供显式的缓存版本迁移 UI。
- UI 暂未显示当前来自 Worker、stale KV、静态 snapshot 还是开发 seed。
