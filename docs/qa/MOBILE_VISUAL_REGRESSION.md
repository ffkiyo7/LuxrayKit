# 移动端视觉回归

更新日期：2026-08-05

## 工具

Playwright 使用 `visual-mobile-390` 项目运行视觉 smoke，浏览器是 `@playwright/test` 自带、被 `package-lock.json` 锁死的 Chromium（**不是** 系统 Chrome：Chrome stable 自动升级会让基线悄悄腐烂）。截图位于：

`tests/pwa/visual.spec.ts-snapshots/`，命名含 `visual-mobile-390-linux`。

允许的最大像素差比例为 `0.02`，动画关闭，光标隐藏。

**基线只在 Playwright 官方容器内生成**（镜像 tag 由 `scripts/visual-docker.sh` 从已安装的 `@playwright/test` 版本推导），但**执行位置只在 CI**——开发在 macOS，本机既跑不出 Linux 基线，Apple Silicon 上的 arm64 容器还会用相同文件名覆盖 CI 的 amd64 基线。详见 `docs/DEVELOPER_GUIDE.md` §8。

## 当前 18 个基线

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
18. 图鉴道具分类筛选。

## 命令

```bash
npm run test:pwa            # 本机：离线 / 队伍库功能冒烟（不含视觉用例）

# 视觉回归是 CI-only，本机不跑：
#   校验 → 开 PR，ci.yml 的 `visual` job 是阻塞门禁
#   重建 → 在对应分支上手动触发工作流
gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"
git pull                    # 拉回工作流提交的新基线
```

`visual` job 失败时，expected/actual/diff 三联图在 `visual-diffs` artifact 里。`visual-baseline.yml` 拒绝在 `main` 上运行——新基线必须跟引发它的 UI 改动一起在 PR 里被 review。

## 数据冻结

用例不吃活数据，否则环境快照一刷新截图就变、门禁会卡住 daily auto-merge：

- `tests/pwa/fixtures/environment-snapshot.json`：`public/data/pokedb/reg-ma-environment.json` 的冻结副本，由 `page.route` 拦截替换。
- `page.clock.setFixedTime('2026-07-20T12:00:00Z')`：钉住赛季 header 与新鲜度徽标。
- 残留耦合：VGCPastes 队伍库是 build-time bundle，拦不住；周级刷新若改到可见队伍会让门禁变红，人工确认后重建基线。

要让门禁看到更新后的环境数据，显式执行（本机改 fixture，基线仍由 CI 重建）：

```bash
cp public/data/pokedb/reg-ma-environment.json tests/pwa/fixtures/environment-snapshot.json
git commit -am "test: refresh visual fixture" && git push
gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"
```

## 更新规则

- 只有确认 UI 变化符合需求后才更新快照。
- 不使用更新快照来掩盖字体、数据源、加载时序或布局回归。
- 环境视觉测试会屏蔽 Service Worker；数据应通过开发服务器稳定提供。
- 改动 Header、底部导航、主题 token、卡片、字体或环境数据展示时，至少运行视觉套件。
- 改动 Service Worker、IndexedDB 或路由入口时，同时运行离线套件（`npm run test:pwa`，本机可跑）。

## 当前缺口

- 属性速查工具没有视觉基线（四个工具里唯一没覆盖的）。
- **赛季排名变动 chip（↑n / ↓n / NEW）没有视觉基线**。视觉用例只走静态快照那条路（只 route `**/data/pokedb/reg-ma-environment.json`），而 `previousSeason` 只有 Worker 会写，静态文件里不会有——所以现有 fixture 加个字段等于伪造一个真实路径不存在的状态。要补这层覆盖得先决定视觉用例怎么表示「Worker 来源」的数据（例如额外 route `/api/environment/latest`），属独立设计题。当前该 chip 由 `EnvironmentPage.test.tsx` 的 RTL 用例覆盖。
- Worker fresh / stale、静态回退和环境加载失败没有视觉基线。
- 首次导入提示和成功 Toast 没有独立视觉基线。
- 浅色主题没有视觉基线。
