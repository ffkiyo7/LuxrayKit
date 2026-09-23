# UI 整体改造（2026-09）

> 改造已于 2026-09-20 上线。本文只留开放项、仍生效的 UI 规则与已知坑、待 owner 拍板项；已完成阶段（P0–P7、R1–R37）的记录见 `git show 9a26196:docs/plans/ui-redesign-2026-09.md`。已上线 UI 的规范见 [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md)。

## 设计依据

- 设计来源：Claude Design 项目「PWA 视觉重做方向选择」。`Luxray Kit 现状复刻` 是草稿，不作依据。最新导出：`~/Downloads/PWA 视觉重做方向选择-handoff5.zip`（用 `ditto -x -k` 解压）。
- `01`–`09` 帧是**定稿**，照做，不「纠正」；`补画 · 01/02/03/04/05/06/07/08/浅色` 是第二依据；`readme.md` 与帧冲突时以帧为准。
- **取信顺序**：`01`–`09` 帧 + 下方 UI 规则 ＞ 补画帧 ＞ `readme.md` ＞ `tokens/*.css` ＞ `components/*.jsx`、`ui_kits/`。
- 01-05 / N01-15 的两行注释小字（「共 241 只上榜…」「用名次第一的…SP 留空」）不画。
- 视觉由 owner 在 preview 上肉眼验收（`AGENTS.md` §3），验收前先刷新一次（Service Worker 缓存）。

## 三条红线

1. repo 现有、稿里没有的元素 = 有意舍弃，不加回去（例：上位构筑卡的来源徽标 / 队报按钮 /「可导入」胶囊）。
2. 不拿 readme 或「统一规范」去改帧里的控件——不同页用不同分段 / 胶囊 / 按钮档位，照各自的帧做。
3. 界面里只放产品文案，不写解释设计意图、交互规则、数据来源的小字。

## UI 规则

**数据显示**

| 数据 | 显示 |
| --- | --- |
| 宝可梦整体排行 | 名次 + 名次变化（NEW / ↑n / ↓n / –），不显示数值 |
| 常见队友 | 只排序，不标数字 |
| 招式 / 道具 / 特性 / 性格 | 百分比，一位小数，**仅名次前 60**（`detailCount`） |
| 样本占比 / 出现队伍 | 不显示 |

**产品**

- 属性速查三个 tab = 单属性 / 双属性 / 完整矩阵；矩阵 44px 格、拖拽平移、吸附表头、键盘导航。双属性「代表宝可梦」= 该组合里环境名次最高者，无上榜取图鉴号最小者。
- **满 6 只才能生成分享链接**；少于 6 只的旧分享链接仍可导入。
- **队伍码 = 游戏内租借码**（`src/lib/teamShare.ts`），app 不生成、不反查；有才显示、可复制，与成员数无关。导入入口是「粘贴分享链接 / 分享码」（`#/t/<code>`）。
- 道具冲突 = **转移**，暂存到保存为止，取消则两只都回滚。
- 编辑配置是整页；返回箭头 = 取消，有未保存改动弹一次「放弃改动？」。
- 规则页主入口在「我的」，环境页数据更新行作次入口。
- 已删、不要加回：Onboarding、「你知道吗」横幅、前三名奖牌、彩蛋弹窗、队伍卡一键删除（走 ⋯ 菜单 + 确认）、队伍拖拽排序（⋯ 菜单「移至首位」代替）、招式选择页「清空」（招式槽只能换，不能清空；道具页「清空」保留）。
- 伦琴猫预设队首次出现是 02-02 特殊卡（琥珀流光、大精灵框、「接着补齐这支」），打开过一次后退化成普通卡（N02-15）。
- 队伍卡空成员位留白；成员展开卡「编辑配置 ›」用淡蓝 `#7fa8d9`；速度线 / 伤害计算入口在成员编辑页右上角 ⋯ 锚定菜单（速度线 / 伤害计算 / 分隔线 / 删除这个成员）——从菜单进工具先保存未保存改动，草稿不合法（SP 超限）时两项置灰。
- `hasCompletedOnboarding` 字段留在 IndexedDB 不动。

**工程**

- 字体：Manrope 自托管（拉丁 + 数字子集），中文走系统字体；不放行任何字体外域。
- 默认主题深色，不跟随系统。
- Tab bar 保留 `useAutoHideBottomNav` 的全部锁定（键盘 / 输入聚焦 / sheet 打开 / 空闲回弹 / reduced-motion）；「收起」= 缩成图标胶囊。
- 尺寸从对应帧量，不自定「全稿统一」规格。

## 开放项

- [ ] ⬜ **删 R33 的 `TRANSITIONAL` 回填**：删 `src/data/environment.ts` 的 `backfillStatPointStats` 及 `:369` 起为它做的额外取数、`environment.test.ts` 对应用例（代码里有 `TRANSITIONAL` 注释）。前置已满足：生产 `/api/environment/latest` 已带 `statPointStats`（2026-09-23 核对）。

## 已知坑

- **SP 分配缩写**：H=HP A=攻击 B=防御 C=特攻 D=特防 S=速度；大写 = 主投项，`+` 后小写 = 吃余点的项。
- **`hasRemainder`**：上游把「满投项相同、余点去向不同」的配置合并成一条时只印满投项、余点印「余り」，不能画成完整分配；这类行条尾留虚线空段 + 「余 N 点」虚线 chip（N 用 `MAX_TOTAL_STAT_POINTS` 算）。
- **`statPointStats` 校验**：缺失 / 未知字母 / 单项 > 32 / 总和 > 66 → 只丢那一条，不进 Worker 零容忍 audit，issue code `invalid-stat-point-spread`；字段缺失或空数组 → 整节不渲染。单打的炽焰咆哮虎没有这一节是预期（不在单打前 60）。
- **兜底 JSON 缓存**：取兜底 JSON 若用 `cache: 'force-cache'`，浏览器缓存过旧版就永远拿旧版，`sw.js` 的后台重取沿用同一 cache mode、也不会自愈；Safari 标签页与 PWA 是两套独立缓存。SW 先回旧缓存再后台更新，这类修复上线后要刷新两次才出现。
- **首屏预算**：不要把新依赖拉进 `#/env` 首屏（预算 260 KB，`regma-moves` 曾因此超标）；备份模块与环境详情页保持按需加载。
- **视觉基线**：`visual-baseline.yml` 用 `GITHUB_TOKEN` push，不会触发 CI，重建后要再推一个普通提交 PR 上才有检查。fixture 队伍首次出现是 02-02 预设卡（`<section>`），视觉用例要点「接着补齐这支」才进详情。
- **队伍规则**（`src/lib/teamComposition.ts`）：同队宝可梦唯一（按 `pokemonId`，形态 / Mega 算同一只）、道具不重复、SP 单项 ≤32 / 总计 ≤66；`updateMember` 返回 `MemberWriteResult`，违规不落库；存量违规队伍只在详情顶部提示、不能分享、不自动改；导入不拦。
- **加入队伍**一律先弹选队 sheet（`src/components/TeamPickerSheet.tsx`），道具撞车则留空；不要静默写进 `teams[0]`。
- **滚动**：所有页面共用 window 滚动。路由 push 时回顶（`useScrollResetOnPush`，返回交给浏览器恢复）；非路由整页选择器进入回顶、关闭还原（`useScrollResetWhileMounted`）。常见队友跳转 push，上一名 / 下一名翻页 replace。
- **图片**：`Sprite` 失败态按 src 记；图片解码完成前隐藏且不挂 `drop-shadow`（WebKit 会把它画成整个盒子的影子）。
- **速度线默认对象** `resolveDefaultSpeedSubject`：最近更新队伍的首个成员 → 当前对战类型使用率第一 → 目录第一条，只定「是谁」、不带成员配置。搜索纯数字 = 速度种族值精确匹配。
- **梦特** `src/data/seed/regMA/hiddenAbilities.ts`（`npm run data:regma:hidden-abilities`）只是标记表，不增删 Champions 的特性。
- **上位构筑**：只有 PokeDB 排位样本显示分数（`teamSampleLadderScore`），VGCPastes 赛事样本显示「冠军 / 亚军 / N 强 / 第 N 名」（VGCPastes 的 `rank` 与 `score` 都是赛事名次）。队报链接只认 `http(s)://` 开头的 `reportUrl`。
- **SP 滚轮**：各项固定 60px 宽、远近只用 `transform` 缩放，不改字号 / 内边距；鼠标滚轮累计 40px 步进一项。
- **工具页示例**：常量在 `src/lib/toolSamples.ts`，由 `toolSamples.test.ts` 用 `computeDamage` 现算对账；工具页运行时不引入 `calc-engine`；速度示例不画 sparkline（`speedTiers` 209 kB）；最近记录 key `luxraykit.recentTools.v2`。
- **本体色光晕**：`npm run data:regma:pokemon-colors`（`:check`）由 `scripts/generate-pokemon-colors.mjs` 生成 `src/data/seed/regMA/pokemonColors.ts`（key = `iconRef` 文件名）；`auraStyle(types, iconRef?)` 表里没有则回退属性色；颜色表是独立 chunk，不进首屏；手工指定颜色写脚本顶部 `overrides`。
- **iOS 键盘**：iOS 只认手势内同步的 `focus()`；懒加载页要先聚焦临时输入框再交接（`src/lib/keyboardHandoff.ts`）。
- **图鉴属性关系**：默认「受击时」，选择按 entry id 记；攻击时数据用 `offensiveProfile`；跨组不合并，同组同倍率合并成一个 chip、来源写「火 · 格斗」。`SegmentedTabs` 写死等宽 34px。可学会招式默认露前 `MOVE_PREVIEW_COUNT` = 8 条，有搜索词时显示全部命中。
- **颜色**：NEW 用 `text-fnBlue`；浅色 `btn-1` 与 `sunken` 同为 `#ededf0`，按钮落在 sunken 卡上要另给底。
- **Safari 底部**：`env(safe-area-inset-bottom)` 在 Safari 标签页里不是常数（工具栏在 = 0、收起 ≈ 34px）。文档流里的底部留白用 `calc(84px + max(env(safe-area-inset-bottom), 34px))`（`.safe-bottom`）；必须跟真实 inset 的（图鉴详情 sticky 按钮条）在下方加高度 `max(env, 34px) - env` 的占位块；fixed 元素（`.lk-nav-pill` 的 `bottom`、`.lk-nav-fade`）跟随真实 inset，不改。

## 待 owner 拍板（均已按最保守的理解实现）

**帧之间互相矛盾**

- **07-02 的浅色语言与其他浅色帧不是一套**：玫瑰色 `#90646a` 导入按钮、白卡 + 发丝环的圆钮 / 搜索框 / 胶囊、选中胶囊无紫环、琥珀 `#8a5c0f`。01-04 的同一个返回钮却是 `#f2f2f5`。现状：全站统一走 token，07 页没有单开变体。
- **02-04（⋯ 锚定浮层）vs 02-09（sheet）**：现状用 sheet。
- **开关关态轨浅色**：05-02 `#f2f2f5`（现状）vs NL-06 `#e8e8ec`。
- **04-04「仅 Mega」chip vs N04-05 / N04-06 开关**：现状是合并规则（抽屉关 = chip，抽屉开 = 开关）。

**帧没画、需要你定要不要**

- 环境页右上角筛选钮：N01-13 画了筛选生效后的胶囊，但没有任何一帧画选择器本身 → 整个入口没做。
- 成员 ⋯ 菜单（N02-20）：没有任何帧画它的触发点 → 没做。
- N01-14「看缺哪 18 只」、N08-10「重试更新」、08-10「输入队伍码」主按钮、N05-17「还能留多少余量」、N05-18「已经算过的组合」：背后没有对应功能 / 算法 → 没画。
- 「添加到主屏幕」只有 iOS 图文（帧只画了 iOS），Android / 桌面 Chrome 也看到这套说明。
- 「我的」子页与编辑配置页不显示 tab bar（帧里都没画）。

**产品 / 文案**

- 「关于与数据」里的 GitHub issue 外链按 08-02 删了，但 `branding.ts` 把它写成明确的产品决策。要留就加回一行。
- 02-07 提示语改了半句：帧写「队伍码与分享在 6/6 时才生成」，与「队伍码与成员数无关」的决策冲突 → 现为「分享链接在 6/6 时才能生成」。
- 工具首页伤害卡副标题是「确定两击击杀 · 87.6%」，帧里是「确二 · 87.6%」——要不要做一套 HKO 短文案。
- 「伤害计算」从成员卡进入固定代入进攻方（原来的选边弹窗帧里没有）。
- 选 Mega 形态会连带把道具换成进化石、选回普通形态清掉进化石（照 N03-14 文案，行为新增）。
- 老数据里已有的重复道具不再阻止保存（只有主动选冲突道具才走转移）。
- 属性速查：两个槽选同一属性 = 交换；默认属性从火改成龙（照 06-01）；代表宝可梦取当前规则默认对战形式的名次。
- 道具「撤销转移」（N03-13）只在本次会话内有效，要跨会话需要往 IndexedDB 加字段。
- 兜底 JSON 另外两条取数路径（`loadEnvironmentState` 的 Worker stale / degraded 分支、Worker 不可用分支）仍是 `force-cache`：兜底数据手工刷新后，回访用户在这两条路径上拿不到新版。要不要改 `no-cache`。
- `RulePage` 文案未动，等你过一遍：chip `当前赛季 / 双打为主 / Mega 每场 1 次 / 道具不可重复 / Lv.50`；按钮 `暂不支持远程刷新`；整句「当前版本使用本地 seed 数据，远程官方数据刷新入口将在接入审核流程后开放。」；末尾 `机制待确认`。

**没有对应帧、浅色值是推的（验收时重点看）**

速度线「我」那一行的底与环、「回到我」浮动胶囊、图鉴筛选带与属性速查轨道带（现为 `#ffffff`）、chip × 徽章底、环境页提示条（白 + 发丝环）、Service Worker 更新条、页面骨架（浅色下 3–4% 的块几乎看不见）、队伍页空状态卡。

## 已知待定

- Tab bar 收起对哪些页面生效（现状：仅环境与图鉴）、收起态点图标是否直接切 tab（现状：是）——未定，先保持现状。
- 道具筛选：03-08 / 04-07 画的是 6 个类别 + 7 个「效果」chip，数据里只有三种类别（常规道具 / 树果 / Mega 进化石）。图鉴与编辑器现按真实数据的 3 类做，「效果」chip 没画；要 03-08 的效果筛选需要维护一份手工分类表，owner 定。
- `useAutoHideBottomNav` 的触发阈值仍是 28px（设计稿 24px），随 Tab bar 行为定稿时一并调整。
