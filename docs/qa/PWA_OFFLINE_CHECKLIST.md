# PWA 离线验收清单

更新日期：2026-09-07（原始定稿 2026-06-18）

## 当前策略

- Service Worker cache 名称为 `champions-tool-v8`（真源见 `public/sw.js` 的 `CACHE_NAME`，改版本时同步本行）。
- 安装时预缓存 `/`、`/index.html`、manifest、图标和静态环境快照。
- 道具图片列表**构建期生成**：`vite.config.ts` 的 `luxraykit-precache-manifest` 插件从道具 catalog 的 `iconRef` 写出 `dist/precache-manifest.json`（`{ generatedAt, itemIcons }`），SW 在 install 时 fetch 它再逐个 `cache.add`。此前是 `sw.js` 里手写的数组，每次加道具都会漂移。图片逐个尝试，单个失败不阻止安装；manifest 缺失或无法解析时也只是不预缓存图标，不阻止安装。
- 新版本提示：SW 保持 `skipWaiting` + `clients.claim`，`src/main.tsx` 监听 `controllerchange`——**此前已有 controller** 的页面首次换控制权时派发 `luxraykit:service-worker-updated`，由 `ServiceWorkerUpdateToast` 渲染「新版本已就绪，刷新以更新」。首次安装不提示。
- 同源 GET 请求采用缓存优先并后台更新；网络失败时回退缓存。
- 环境页在线优先请求 Worker API，失败后读取预缓存的最新赛季静态 snapshot。
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
- 速度线工具在线和离线都可用（`toBeEnabled()` + 档位内容渲染）。

`src/sw.test.ts` 另外守住：不预缓存已下线的 `/data/vgcpastes/` 与 `reg-ma-s1-environment.json`、道具图标只走 manifest（`sw.js` 里不得再出现 `'/assets/items/` 字面量）、`/api/*` 永不读写离线缓存。`scripts/precache-manifest.test.mjs` 守住 manifest 内容与 catalog 一致。

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
- [ ] 速度线与属性速查可正常打开（四个工具均已开放，无“未开放”态）。
- [ ] 恢复网络后 Worker API 可再次读取。
- [ ] `dist/precache-manifest.json` 存在且 `itemIcons` 数量与道具 catalog 一致（当前 148）；DevTools > Application > Cache Storage 里 `champions-tool-v8` 能看到这些图标。
- [ ] 部署新版本后，保持旧标签页打开，确认出现「新版本已就绪，刷新以更新」toast，点刷新后加载新构建。

## 已知限制

- 首次安装前完全离线无法使用。
- 未访问过的异步 chunk 不保证在离线状态可用。
- Worker API 响应不在安装时预缓存；离线依赖最新赛季静态 snapshot。
- Service Worker 未提供显式的缓存版本迁移 UI（新版本 toast 只提示刷新，不做迁移）。
- UI 暂未显示当前来自 Worker、stale KV、静态 snapshot 还是开发 seed。
