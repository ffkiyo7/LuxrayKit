# 移动端视觉回归

更新日期：2026-09-23（上次 2026-09-07）

## 工具

Playwright 使用 `visual-mobile-390` 项目（Pixel 5，视口 390×844）运行 `tests/pwa/visual.spec.ts`，浏览器是 `@playwright/test` 自带、被 `package-lock.json` 锁死的 Chromium（**不是** 系统 Chrome：Chrome stable 自动升级会让基线悄悄腐烂）。截图位于：

`tests/pwa/visual.spec.ts-snapshots/`，命名含 `visual-mobile-390-linux`。

允许的最大像素差比例为 `0.02`，动画关闭，光标隐藏，Service Worker 屏蔽（`serviceWorkers: 'block'`）。

**基线只在 Playwright 官方容器内生成**（镜像 tag 由 `scripts/visual-docker.sh` 从已安装的 `@playwright/test` 版本推导），但**执行位置只在 CI**——开发在 macOS，本机既跑不出 Linux 基线，Apple Silicon 上的 arm64 容器还会用相同文件名覆盖 CI 的 amd64 基线。详见 `docs/DEVELOPER_GUIDE.md` §8。

## 当前 24 个基线

深色（默认主题，`captures the mobile visual regression smoke set`）：

1. 环境首页。
2. 完整使用排行。
3. 宝可梦环境详情（烈咬陆鲨）。
4. 队伍列表。
5. 队伍详情（含分享按钮）。
6. 成员编辑。
7. 成员 SP 调整（速度 SP 滑杆）。
8. 工具页。
9. 伤害计算选择器。
10. 规则图鉴。
11. 图鉴详情。
12. 图鉴属性筛选。
13. 我的（含匿名使用统计开关、留言、关于与数据入口）。
14. 数据口径（`#/env/methodology`）。
15. 上位构筑浏览。
16. 随机一队弹窗。
17. 速度线。
18. 图鉴道具分类筛选。

浅色（`captures the light-theme set`，经「我的 · 主题」开关切换，一类表面一张）：

19. 我的。
20. 完整使用排行。
21. 队伍详情。
22. 成员编辑。
23. 工具页。
24. 图鉴详情。

## 命令

```bash
npm run test:pwa            # 本机：离线 / 队伍库 / 首屏预算冒烟（不含视觉用例）

# 视觉回归是 CI-only，本机不跑：
#   校验 → 开 PR，ci.yml 的 `visual` job 是阻塞门禁
#   重建 → 在对应分支上手动触发工作流
gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"
git pull                    # 拉回工作流提交的新基线
```

`visual` job 失败时，expected/actual/diff 三联图在 `visual-diffs` artifact 里。`visual-baseline.yml` 拒绝在 `main` 上运行——新基线必须跟引发它的 UI 改动一起在 PR 里被 review。

PR 只改了不影响渲染的路径时，`ci.yml` 的 `changes` job 会跳过 `visual`（deny-list：`docs/`、`*.md`、`cloudflare/`、`scripts/*.mjs`、其他 workflow、`public/data/pokedb/`、`src/data/external/pokedb/`、`src/data/external/vgcpastes/`）；push 到 `main` 总会跑。

## 数据冻结

用例不吃活数据，否则环境快照或队伍库一刷新截图就变、门禁会卡住 daily auto-merge：

- `tests/pwa/fixtures/environment-snapshot.json`：`public/data/pokedb/reg-ma-environment.json` 的冻结副本，由 `page.route` 拦截替换；排名与计数原样返回，只把时间戳和赛季标签改写成与冻结时钟一致。
- `tests/pwa/fixtures/vgcpastes/*.json`：VGCPastes 队伍库（`reg_mb_…` / `reg_mc_…_team_samples`）的冻结副本，拦截对应的 `assets/<文件名>-*.js` chunk；用例会断言两个 chunk 都由 fixture 提供，chunk 改名会直接失败而不是悄悄吃活数据。
- 固定时钟：`currentRuleSet.startAt` 之后第 11 天 12:00 UTC（从 catalog 推导，不是字面量），钉住赛季 header、更新时间与规则滞后提示；时钟落到规则窗口外时用例直接抛错。`src/data/schedule.ts` 缺少覆盖该时刻的赛季时也会抛错。

要让门禁看到更新后的数据，显式执行（本机改 fixture，基线仍由 CI 重建）：

```bash
cp public/data/pokedb/reg-ma-environment.json tests/pwa/fixtures/environment-snapshot.json
# 队伍库同理：cp src/data/external/vgcpastes/<name>_team_samples.json tests/pwa/fixtures/vgcpastes/
git commit -am "test: refresh visual fixture" && git push
gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"
```

## 更新规则

- 只有确认 UI 变化符合需求后才更新快照。
- 不使用更新快照来掩盖字体、数据源、加载时序或布局回归；也不要为了让截图跟上最新数据去改用例或放宽阈值。
- 改动 Header、底部导航、主题 token、卡片、字体或环境数据展示时，以 PR 上的 `visual` job 为准（本机不跑）。
- 改动 Service Worker、IndexedDB 或路由入口时，同时运行离线套件（`npm run test:pwa`，本机可跑）。
- **2%（`0.02`）的像素阈值会吞掉小改动**：一个按钮、一行文案这种局部变化很可能不足以让基线变红（实例：36×36 分享按钮未让基线 05 变红；旧版队伍一览新增「M-C」规则筛选 chip 未让基线 15 变红——该 chip 已随 2026-09 改版移除）。所以「基线没变」**不等于**「UI 没变」——视觉改动由用户在 preview 链接上肉眼验收（AGENTS.md §3），不要拿门禁当验收。
- 不为视觉改动新增用例；增删基线只在用户明确要求时做。

## 当前缺口

- 属性速查工具没有视觉基线（四个工具里唯一没覆盖的）。
- 分享链接预览浮层（`#/t/<code>`）没有视觉基线：它需要先造一个合法 code 再走 URL 进入，用例得先决定 code 从哪来（写死一个会随 catalog 变动而失效）。当前由 `App.test.tsx` 的 RTL 用例覆盖。
- **赛季排名变动 chip（↑n / ↓n / NEW）没有视觉基线**。视觉用例只走静态快照那条路（只 route `**/data/pokedb/reg-ma-environment.json`），而 `previousSeason` 只有 Worker 会写，静态文件里不会有——所以现有 fixture 加个字段等于伪造一个真实路径不存在的状态。要补这层覆盖得先决定视觉用例怎么表示「Worker 来源」的数据（例如额外 route `/api/environment/latest`），属独立设计题。当前该 chip 由 `EnvironmentPage.test.tsx` 的 RTL 用例覆盖。
- Worker fresh / stale、静态回退和环境加载失败（离线 / 可能过期 / 数据源异常提示）没有视觉基线。
- 导入成功 Toast（「已导入「…」」）没有独立视觉基线（原「首次导入提示」随 2026-09 改版的去 onboarding 一并移除，424209b）。
- 浅色主题只覆盖 6 张（19–24），其余页面仅有深色基线。
- **速度线头部文案不在基线内**：用例 17 截图前 `scrollBy(0, 120)` 把头部滚出视口，这行怎么改都不会被视觉门禁抓到（2026-09-07 `speedTierSeason` 3→5 后重跑 `visual-baseline.yml`，18 张全部报「已一致」）。2026-09-20 该行改为「热门速度线参照 · 上下滑动看档位」，不再渲染赛季号，`speedTierSeason` 也不再被 `SpeedPage.tsx` 引用——原先「赛季号回归无人兜底」的隐患随之消失（`SpeedPage.test.tsx` 从未断言过这行）。
