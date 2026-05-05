# PWA 离线验收

更新时间：2026-05-06

## 当前策略

- `public/manifest.webmanifest` 提供安装元信息。
- `public/sw.js` 预缓存 app shell，并 runtime cache 同源 GET 响应。
- IndexedDB 保存队伍、偏好和 benchmark 收藏。
- IndexedDB 当前版本为 v2，保留旧 EV-like `statPoints` 到 Champions SP 的迁移。
- 当前版本不提供远程刷新，刷新入口保持 disabled。

## 手动验收

- [ ] 在线打开本地预览地址。
- [ ] 确认 service worker 注册。
- [ ] 创建或编辑队伍。
- [ ] 收藏 benchmark。
- [ ] 切换浏览器离线。
- [ ] 刷新页面，确认 app shell 可打开。
- [ ] 进入组队页，确认本地队伍仍可见。
- [ ] 进入速度线页，确认收藏仍可见。
- [ ] 进入设置页，确认缓存状态可读。

## 自动化

```bash
npm run test:pwa
```

自动化覆盖：

- service worker 注册。
- 离线刷新后 app shell 存活。
- IndexedDB 队伍读取。
- benchmark 收藏读取。
- IndexedDB v1 -> v2 SP 迁移。

## 已知限制

- 首次访问前不能离线打开。
- 清除站点数据会删除本地队伍和收藏。
- PWA 不负责远程数据刷新。
