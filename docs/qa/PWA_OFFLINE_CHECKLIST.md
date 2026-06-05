# PWA 离线验收

更新时间：2026-06-05

## 当前策略

- `public/manifest.webmanifest` 提供安装元信息。
- `public/sw.js` 预缓存 app shell，并 runtime cache 同源 GET 响应。
- IndexedDB 保存队伍、偏好和 benchmark 收藏。
- IndexedDB 当前版本为 v2，保留旧 EV-like `statPoints` 到 Champions SP 的迁移。
- 当前环境数据使用内置 PokeDB Open Data bundled snapshot；离线时读取同一份本地打包快照，不提供远程刷新。

## 手动验收

- [ ] 在线打开本地预览地址。
- [ ] 默认进入环境页，确认宝可梦榜、PokeDB 上位构筑快照来源和真实样本队伍可见。
- [ ] 确认 service worker 注册。
- [ ] 进入队伍页。
- [ ] 创建或编辑队伍。
- [ ] 进入工具页，再进入速度线计算。
- [ ] 收藏 benchmark。
- [ ] 进入我的页，确认本地备份和离线缓存状态可读。
- [ ] 切换浏览器离线。
- [ ] 刷新页面，确认 app shell 可打开。
- [ ] 默认环境页仍可打开。
- [ ] 进入队伍页，确认本地队伍仍可见。
- [ ] 进入工具页的速度线计算，确认收藏仍可见。
- [ ] 进入我的页，确认离线缓存状态可读。

## 自动化

```bash
npm run test:pwa
```

自动化覆盖：

- service worker 注册。
- 离线刷新后 app shell 存活。
- 默认环境页可访问。
- IndexedDB 队伍读取。
- benchmark 收藏读取。
- IndexedDB v1 -> v2 SP 迁移。

## 已知限制

- 首次访问前不能离线打开。
- 清除站点数据会删除本地队伍和收藏。
- PWA 不负责远程数据刷新。
