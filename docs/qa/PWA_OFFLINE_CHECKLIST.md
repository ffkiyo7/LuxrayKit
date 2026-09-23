# PWA 离线验收清单

更新日期：2026-09-23（原始定稿 2026-06-18）

策略细节与理由以 [DEVELOPER_GUIDE §4.5](../DEVELOPER_GUIDE.md) 为准，本节只列验收要点。

## 当前策略

- 每个构建一份缓存 `luxraykit-shell-<version>`（version 由构建注入 `dist/sw.js`，只在代码或 index 变化时变）；精灵图与道具图标在跨版本保留的 `luxraykit-runtime`。activate 删除其余缓存（含旧的 `champions-tool-v*`）。
- 安装时预缓存 `/`、manifest、图标、静态环境快照和 **`dist/assets/` 下全部 chunk**——没打开过的页面离线也能进；道具图标逐个尝试，单个失败不阻止安装。
- 导航返回本版缓存里的 shell，hashed chunk 缓存优先，其余同源 GET 缓存优先 + 后台更新。
- 新版本提示：新 SW 装好后 waiting，页面显示「新版本已下载 · 重载」，点重载才接管并自动刷新；忽略则下次完全关闭 App 后生效。App 回到前台时主动检查更新。首次安装不提示。纯 PokeDB 数据部署不换版本、不提示。
- 环境页在线优先请求 Worker API，失败后读取预缓存的最新赛季静态 snapshot。
- 队伍和偏好保存在 IndexedDB v2。

## 自动化

```bash
npm run test:pwa
```

当前 `tests/pwa/offline.spec.ts` 验证：

- Service Worker 已激活。
- 在线重载后环境页可见。
- **离线重载后停在重载前那个页面**（`#/tools`）——导航状态在 URL hash 里，重载不再回首页；SPA fallback 对 hash 路由天然生效（hash 不发给服务器）。
- 创建的本地队伍在离线重载后仍存在。
- 在线时从没打开过的伤害计算页，离线时能直接打开（chunk 来自 install 预缓存）。
- “我的”中的备份和离线缓存入口可见。
- 速度线工具在线和离线都可用（`toBeEnabled()` + 档位内容渲染）。

`src/sw.test.ts` 跑通 install / activate / fetch 全流程（见开发指南 §8）；`src/lib/serviceWorker.test.ts` 守住提示与 reload 时机；`scripts/precache-manifest.test.mjs` 守住清单内容、版本号只随代码变、占位行注入。

## 手动验收

- [ ] 首次在线打开，确认环境页完成加载。
- [ ] 创建并编辑一支队伍。
- [ ] 导出本地备份。
- [ ] 切换为离线并重载，确认停在重载前那个页面而不是回首页。
- [ ] 离线状态下按 Android 物理返回键，确认在 App 内层层后退而不是直接退出。
- [ ] 环境页使用静态 snapshot，而不是开发 seed。
- [ ] 队伍仍可查看和编辑。
- [ ] 图鉴与伤害计算（包括在线时没打开过的）可打开。
- [ ] “我的”页可见，主题和本地数据正常。
- [ ] 速度线与属性速查可正常打开（四个工具均已开放，无“未开放”态）。
- [ ] 恢复网络后 Worker API 可再次读取。
- [ ] `dist/sw.js` 开头的 `BUILD` 占位行已被替换（构建日志 `sw.js <version>: N assets, M item icons`）；DevTools > Application > Cache Storage 有 `luxraykit-shell-<version>`（含 `/assets/*` chunk）与 `luxraykit-runtime`（道具图标），没有 `champions-tool-v8`。
- [ ] 部署新版本后，保持旧标签页打开并切到后台再回来，确认出现「新版本已下载」toast；点「重载」后页面自动刷新到新构建（关于页构建号变化）。
- [ ] 只有 PokeDB 静态快照变化的部署不弹更新提示。

## 已知限制

- 首次安装前完全离线无法使用。
- Worker API 响应不在安装时预缓存；离线依赖最新赛季静态 snapshot。
- 首次访问会在后台下载全部 chunk（约 2.7 MB 未压缩）；之后每次代码部署只下载变了 hash 的 chunk。
- 升级前还开着旧版页面（旧 `main.tsx`）的用户看不到新提示：新 SW 会 waiting 到 App 完全关闭，下次打开即是新版。
- UI 暂未显示当前来自 Worker、stale KV、静态 snapshot 还是开发 seed。
