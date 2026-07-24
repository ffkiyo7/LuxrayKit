# 移动端视觉回归

更新日期：2026-07-25

## 工具

Playwright 使用 `visual-mobile-390` 项目运行视觉 smoke，浏览器是 `@playwright/test` 自带、被 `package-lock.json` 锁死的 Chromium（**不是** 系统 Chrome：Chrome stable 自动升级会让基线悄悄腐烂）。截图位于：

`tests/pwa/visual.spec.ts-snapshots/`，命名含 `visual-mobile-390-linux`。

允许的最大像素差比例为 `0.02`，动画关闭，光标隐藏。

**基线只在 Playwright 官方容器内生成**（镜像 tag 由 `scripts/visual-docker.sh` 从已安装的 `@playwright/test` 版本推导），因此任何装了 Docker 的机器都能复现同样的像素。宿主机直跑会因字体栈不同产生整屏假阳性 diff。

## 当前 17 个基线

1. 环境首页。
2. 完整宝可梦榜。
3. 宝可梦环境详情。
4. 队伍列表。
5. 队伍详情。
6. 成员编辑。
7. 成员 SP 调整。
8. 工具页。
9. 伤害计算选择器。
10. 规则图鉴。
11. 图鉴详情。
12. 图鉴属性筛选。
13. 我的。
14. 数据口径。
15. 队伍一览（双打）。
16. 试试灵感弹窗。
17. 速度线。

## 命令

```bash
npm run test:visual         # 容器内校验基线
npm run test:visual:update  # 容器内重建基线
npm run test:pwa            # 离线 / 队伍库功能冒烟（不含视觉用例）
```

前置条件：本机有可用的 Docker daemon。WSL2 下装原生 Docker Engine 即可，不需要 Docker Desktop；细节见 `docs/DEVELOPER_GUIDE.md` §8。

CI（`.github/workflows/ci.yml` 的 `visual` job）跑同一条命令，**阻塞合并**；失败时 diff 三联图在 `visual-diffs` artifact 里。

## 数据冻结

用例不吃活数据，否则环境快照一刷新截图就变、门禁会卡住 daily auto-merge：

- `tests/pwa/fixtures/environment-snapshot.json`：`public/data/pokedb/reg-ma-environment.json` 的冻结副本，由 `page.route` 拦截替换。
- `page.clock.setFixedTime('2026-07-20T12:00:00Z')`：钉住赛季 header 与新鲜度徽标。
- 残留耦合：VGCPastes 队伍库是 build-time bundle，拦不住；周级刷新若改到可见队伍会让门禁变红，人工确认后重建基线。

要让门禁看到更新后的环境数据，显式执行：

```bash
cp public/data/pokedb/reg-ma-environment.json tests/pwa/fixtures/environment-snapshot.json
npm run test:visual:update
```

## 更新规则

- 只有确认 UI 变化符合需求后才更新快照。
- 不使用更新快照来掩盖字体、数据源、加载时序或布局回归。
- 环境视觉测试会屏蔽 Service Worker；数据应通过开发服务器稳定提供。
- 改动 Header、底部导航、主题 token、卡片、字体或环境数据展示时，至少运行视觉套件。
- 改动 Service Worker、IndexedDB、路由入口或禁用工具状态时，同时运行离线套件。

## 当前缺口

- 数据口径页没有视觉基线。
- Worker fresh / stale、静态回退和环境加载失败没有视觉基线。
- 首次导入提示和成功 Toast 没有独立视觉基线。
- 浅色主题没有视觉基线。
