# Luxray Kit 设计系统（2026-09）

这份文档**描述已经落地的 UI**（`dev` → `main` 已上线的 2026-09 改造成果），不是新规范。它把散在 `tailwind.config.js` / `src/styles.css` / `src/styles/p*.css` / `src/components/kit/` 里的既成事实收成一处，用于：写新页面时不再自创值、review 时有对照、判断某个值是不是「系统里的」。

**取信顺序不变**（见 [ui-redesign-2026-09.md](plans/ui-redesign-2026-09.md)）：
`01`–`09` 定稿帧 ＞ 补画帧 ＞ **本文档** ＞ 设计项目的 `readme.md` / `tokens` / `ui_kits`。
帧里同一类控件在不同页用不同档位是**有意的**，本文档记录的是「系统里存在哪些档位」，不是「全站必须统一成一档」。拿本文档去改帧里的控件，属于 AGENTS.md §3 的红线②。

---

## 1. 画布与节奏

| 项 | 值 | 位置 |
| --- | --- | --- |
| 画布宽 | `max-w-[430px]`，`mx-auto`，`min-h-screen` | `App.tsx` `<main className="app-shell …">` |
| 页面左右留白 | **24px**（`px-6`），全站唯一档 | 171 处 |
| Tab 根页顶部 | `pt-11`（44px）后接 `PageHeader` | `ProfilePage` / `ToolsPage` / `EnvironmentStates` |
| 二级页顶部 | `px-6 pt-5` → 36px 圆返回钮 → `PageHeader className="pt-3.5"` | `profile/SubPageHeader.tsx` |
| 区块间距 | `pt-5`（20）/ `pt-[22px]` / `pt-6`；卡片列表 `gap-3.5`（14） | 各页 |
| 底部安全区 | `.safe-bottom` = `84px + max(env(safe-area-inset-bottom), 34px)` | `styles.css` |

`safe-bottom` 的 34px 下限是**修 bug 的产物**，不是审美值：Safari 里 `env(safe-area-inset-bottom)` 会在工具栏收起 / 弹回时在 0 与 34 之间跳，跟随它的 padding 会让文档高度突变、滚动位置被夹断（R34）。不要改成 `env(...)` 裸值。

底部导航（`.lk-nav-pill`）：展开 54px 高 / `min(380px, 100% - 50px)` 宽，收起 48px / 212px；`bottom: 18px + safe-area`；上方 `40px + safe-area` 的渐隐带 `.lk-nav-fade`。它是全站唯一使用玻璃（`backdrop-filter`）的表面。

---

## 2. 颜色

### 2.1 三层结构

1. **语义 token** — `src/styles.css` 的 `--color-*`，以 `R G B` 三元组存放，由 `tailwind.config.js` 映射成 `bg-surface` / `text-textLabel` 这类 class（支持 `/<alpha-value>`）。**新页面优先只用这一层。**
2. **主题差异变量** — 同文件里的 `--select-fill` / `--raised-*` / `--sheet-*` 等，凡是**两套主题 alpha 不同**的填充都在这里，通过 `.lk-*` class 使用（Tailwind 的 `/<alpha-value>` 无法按主题变）。
3. **页面局部变量** — `src/styles/p2.css`（环境 / 上位构筑）、`p3.css`（队伍）、`p3b.css`（配置编辑器）、`p4a.css`（工具 / 图鉴）、`p4b.css`（属性速查）、`p6.css`（我的 / 全局）、`calculator.css`。只给对应帧用，彼此不互相引用。

判断新值该放哪一层：**两套主题同一个 alpha → 第 1 层；alpha 不同 → 第 2 层；只有一屏用得到 → 第 3 层。**

### 2.2 语义 token

深色是默认主题（`:root`），浅色是 `:root[data-theme='light']`；**两套只换中性梯度与墨色深浅，尺寸和字重完全一致**。

| token | 角色 | 深 | 浅 |
| --- | --- | --- | --- |
| `page` | 页底 | `#0b0b0c` | `#fbfbfd` |
| `surface` | 卡面 / 输入框 / 胶囊底 | `#17171b` | `#f2f2f5` |
| `sunken` | 分段控件、内嵌列表所在的「井」 | `#0f0f12` | `#ededf0` |
| `textPrimary` | 主文字 | `#f5f5f7` | `#1c1c1e` |
| `textLabel` | 亮一档的次级墨（数值、chip 文字、次按钮标签） | `#c7c7cc` | `#48484a` |
| `textSecondary` | 说明文字、小标题 | `#8e8e93` | `#6e6e73` |
| `chevron` | 暗一档的次级墨（箭头、静态图标） | `#6e6e73` | `#c7c7cc` |
| `btn1 / btn2 / btn3` | 次按钮三档地板，按帧高 50 / 48 / 44 命名；`btn1` 兼作关闭钮与小徽标底 | `#22222a` / `#1f1f23` / `#17171b` | `#ededf0` / `#f2f2f5` / `#f2f2f5` |
| `btnDisabledInk` | 禁用态墨 | `#5a5a60` | `#aeaeb4` |
| `accent` | 主按钮的板（近白 / 墨），**已不是彩色** | `#f5f5f7` | `#1c1c1e` |
| `select` | 唯一的紫：选中 chip 的环 + 填充、输入框聚焦环 | `#9b9ac4` | `#62618a` |
| `data` | 琥珀：**只给投入的能力点与它影响的数值** | `#e0a23c` | `#aa6300` |
| `fnBlue / fnTeal / fnAmber / fnPink` | 功能色，只用于图标砖与纯文字页的标记，**永不表示数值** | 见 `styles.css` | 同左，压深到 4.5:1 |
| `success / danger / warning` | 状态 | `#47c07f` / `#e2635f` / `#e0a23c` | `#12784a` / `#c0392f` / `#aa6300` |
| `track / knob / segmentOn` | 开关轨 / 拨钮 / 分段选中砖 | — | — |
| `--hairline` / `--hairline-strong` | 唯一的分隔线（列表行 `border-b`） | 白 7% / 10% | `#ededf0` / 黑 8% |

### 2.3 颜色纪律

- **中性承担结构**。彩色只在三处出现：`select`（选中）、`data`（能力点）、`fn-*`（图标砖）。旧的蓝紫 accent 已全线退役，不要再引入「品牌色按钮」。
- **一个颜色一个职责**。`data` 出现在非 SP 的数字上、`select` 出现在非选中语义上，都算越界。
- **浅色只压墨，不换色相**：琥珀与绿在浅色下压深是为了在纸面上守住 4.5:1，不是换了一种颜色。

### 2.4 属性色

18 个宝可梦属性色写在 `src/components/ui.tsx` 的 `typeColors`，**两套主题同一份值**，只通过 `TypeDot`（9px，双属性行 7px）和光晕使用；不做成属性徽标底色。

---

## 3. 字体与字阶

`Manrope` 自托管（仅拉丁 + 数字子集，可变字重 200–800，~25 KB），中文回落 `PingFang SC` / `Noto Sans SC`。**不放行任何字体外域**（CSP + 离线可用）。

| 尺寸 / 行高 / 字重 / 字距 | 角色 |
| --- | --- |
| 44 / 1 / 800 / −0.02~−0.03 `tabular` | 环境详情的名次、伤害结果的百分比 |
| 34 / 42 / 800 / −0.02 | 页面标题（`PageHeader`，全站唯一 H1 规格） |
| 28 / 1 / 800 / −0.02 `tabular` | 速度值、倍率、工具卡主数字 |
| 22 / 30 / 800 / −0.01 | Sheet 标题、页内分组标题 |
| 20 / 28 / 800 / −0.01 | 卡片标题、空状态标题、榜单名次 |
| 17 / tight / 700–800 / −0.01 | 列表行主标题（`ListRow`） |
| 15 / — / 700–800 | 按钮标签、正文强调 |
| 13 (`text-[13px]`) / — / 600 | 页面副标题、胶囊、最常用的说明文字 |
| 12 (`text-xs`) / — / 600 | 列表行副标题、meta |
| 11 / — / 800 / **+0.14em** 大写 | `SectionLabel` 小标题 |

- 字重只用 `600 / 700 / 800` 三档（`font-semibold / bold / extrabold`）；`medium` 与 `normal` 只出现在占位符与页面副标题。
- **所有数字加 `tabular-nums`**（`.tabular` 或 Tailwind `tabular-nums`），列表里的数值不许跳动。
- 文本输入在 coarse pointer 下强制 ≥16px（`styles.css` 有 `!important` 规则），否则 iOS 聚焦会自动放大且不回弹；`<select>` 有意排除。

---

## 4. 形状与尺寸

**圆角**（按使用量）：`full`（胶囊 / 头像 / 圆钮）＞ `14px`（按钮、输入框、Toast）＞ `16px`（`rounded-2xl`，面板）＞ `20px`（卡片、titled sheet 顶）＞ `18px` ＞ `12px`（`rounded-xl`，分段井）＞ `9px`（分段砖）＞ `24px`（`rounded-3xl`，handle sheet 顶）＞ `3–4px`（迷你条）。

**控件高度**（帧量出来的档位，不要归一）：

| 控件 | 高 |
| --- | --- |
| 主 / 次按钮 | 50 / 48 / 44（对应 `btn1/2/3`），小胶囊 32 |
| 列表行 | 68（宝可梦 / 招式）、64（带标签字段）、60（档位 / SP 行）、44（数值行） |
| 搜索框 | 44 |
| 胶囊 `Pill` | 34（默认） |
| 分段控件 | 井 `p-1` + 砖 34 |
| 开关 | 48 × 28，拨钮 24 |
| 圆形图标钮 | 36（页头返回 / hero）、30（sheet 关闭）、22（搜索清除） |
| 滑杆 | 轨 6，拨钮 24（速度）/ 26（SP） |
| 图标砖 | 32（`.lk-tile`） |

**间距**：`gap-2`(8) / `gap-2.5`(10) / `gap-3`(12) 是主力，`gap-1.5`(6) 用于图标与文字，`gap-3.5`(14) 用于卡片列表。图标尺寸主力 `18 / 17 / 16 / 15`（lucide-react）。

---

## 5. 材质与高度

**这是深浅两套主题唯一的结构性差异，也是最容易做错的地方：**

- **深色靠明度分层，不用阴影。** `.surface-shadow` 在深色下被显式置空；卡片就是比页底亮一档的平面。
- **浅色靠阴影分层。** 白卡在 `#fbfbfd` 上不投影就读不出来，所以 `--raised-shadow` / `--lk-card-shadow` 等在浅色下才有值。
- **主按钮反过来**：深色用 `inset` 高光把近白板从页面里「切」出来（`--btn-primary-shadow`），浅色改成一道柔和外投影——深色那套 inset 印在浅底墨块上会出现一道白缝。

常用材质 class（全部在 `styles.css`，跨页共用）：

| class | 用途 |
| --- | --- |
| `.lk-raised` / `.lk-card-face` | 抬起的卡 / 平卡面 |
| `.lk-sheet` `.lk-sheet--deep` `.lk-sheet-overlay` | 底部 sheet 两种面 + 遮罩 |
| `.lk-chip` `.lk-row-active` `.lk-marker` | chip 填充、选中行、轴标记 |
| `.lk-pill-on` / `.lk-field-on` | 选中胶囊 / 聚焦输入框（紫填充 + 1.5px 环） |
| `.lk-btn-primary` / `.lk-segment-on` / `.lk-float-pill` | 主按钮板 / 分段选中砖 / 浮动胶囊 |
| `.lk-damage-bar` `.lk-damage-pill` | 伤害条与胶囊 |
| `.lk-speed-slider` | 原生 `input[range]` 皮肤（保留 slider role / 键盘步进 / 读屏播报） |
| `.lk-toast` `.lk-panel` `.lk-field` `.lk-tile--*` `.lk-dialog-overlay` | 全局反馈与「我的」页（p6） |

原生控件一律**只换皮不换语义**：滑杆画在 `input[type=range]` 上，开关是 `role="switch"` 的 `<button>`，sheet 是 `role="dialog" aria-modal`。

---

## 6. 组件（`src/components/kit/`）

统一从 `src/components/kit` 导入。

| 组件 | 规格 | 关键约定 |
| --- | --- | --- |
| `PageHeader` | 34/42/800 标题 + 13/18 副标题 | 全站页面标题唯一入口 |
| `SectionLabel` | 11/800 大写 +0.14em | `trailing` 放同基线右侧提示 |
| `ListRow` | 高度**由调用方传**（68/64/60/44） | `bleed` 让选中高亮撑满 24px 留白（`-mx-6` + `w-[calc(100%+3rem)]` + `px-6`，只左移不变宽是 R2 的修法） |
| `KitButton` | `primary`（accent 板）/ `secondary`（btn1-3 三档）；`shape="pill"` 为 32px 胶囊 | 高度决定地板色，不要手挑 |
| `Pill` | 34px 胶囊；`tone="select"` 紫，`tone="plain"` 中性 | 紫只出现在这里和聚焦输入框 |
| `SegmentedTabs` | `sunken` 井 + `p-1` + 34px 砖 | 浅色下选中砖必须有 `--segment-on-shadow`，否则白砖在白井里看不见 |
| `SearchField` | 44px，有内容即亮紫环 + 22px 清除钮 | 输入框 16px、光标用原生（IME / 选择行为不改） |
| `Switch` | 48×28 / 拨钮 24 | `role="switch"` + `aria-checked` |
| `Sheet` | `titled`（20px 圆角，24/24/28 内距，30px 关闭钮）/ `handle`（24px 圆角，38×4 抓手，更深的面） | 跟随 **visual viewport**（iOS 键盘只压缩 visual viewport）；带 `data-bottom-nav-lock` |
| `Toast` | 顶部 `inset-x-4 top-4`，14px 圆角，8px 状态点 | 三种结果同一张卡，只换点的颜色；从顶部出现以免压住浮动导航 |
| `Sprite` | 裸贴图，失败回落首字 | 按 `src` 记失败态、**不加 `decoding="async"`**（否则列表重挂载会闪空位） |
| `SpriteDisc` | 贴图 + 卡面圆盘 + 细环，默认 26px（侧卡 30px） | 贴图内缩 4px，环不裁图 |
| `TypeDot` | 9px（双属性行 7px） | 代替填充式属性徽标 |
| `auraStyle(types, iconRef?)` | 输出 `--lk-aura-c1/c2` | 见 §7 |

页面级的组合件（`RoundIconButton`、`SubPageHeader`、`TeamPickerSheet`、`StatWheel`、伤害结果卡等）留在各自页面目录；**升进 `kit/` 的门槛是「至少两处页面用同一规格」**。

---

## 7. 光晕（aura）

宝可梦相关的大面积表面（队伍成员展开卡、成员编辑器顶卡、形态选择、图鉴大图、环境首屏 hero、环境详情头部）共用一套光晕：

```
radial-gradient(90% 120% at 86% 6%,
  color-mix(in srgb, var(--lk-aura-c1) <s1>, transparent),
  color-mix(in srgb, var(--lk-aura-c2) <s2>, transparent) 52%,
  transparent 74%)
```

- 颜色来自 `auraStyle(types, iconRef)`：优先取该贴图采样出的**本体色**（`src/data/seed/regMA/pokemonColors.ts`，344 条，`npm run data:regma:pokemon-colors` 生成，改脚本不改产物），没有采样行才回落属性色。Mega / 地区形态有自己的贴图，因此有自己的颜色。
- 浓度分档：深色 `22% / 12%`，浅色降一档（队伍 `18% / 10%`、环境 `16% / 9%`、编辑器 `20%`）——**浅色纸面必须还是纸**。
- 渐变写在使用它的 class 上，不写在 `:root`：自定义属性在**声明处**替换 `var()`，放 `:root` 会取到那里的灰色回落值。

---

## 8. 运动

克制到几乎没有。全站只有四处：

| 位置 | 时长 / 曲线 |
| --- | --- |
| 导航胶囊展开 / 收起 | width+height 220ms `cubic-bezier(.2,0,0,1)` |
| 导航选中胶囊滑动 | transform 280ms `cubic-bezier(.32,.72,0,1)` |
| SP 滚轮项 | transform / color / opacity 140ms ease-out |
| 属性矩阵格 | background / color / box-shadow 140ms ease |

规则：**动的只能是 `transform` 和 `opacity`**（导航胶囊自身的宽高是唯一例外，它只有 4 个 flex 子项、不触发文本重排）；每一处都要有 `prefers-reduced-motion: reduce` 的关闭分支。R19 的教训：让尺寸 / 内距随状态变化会让 scroll-snap 点在手指底下移动。

---

## 9. 无障碍与触摸

- 目标尺寸：交互元素最小 44px（列表行 / 搜索框 / 按钮最低档都是 44）；22px 的清除钮和 30px 的关闭钮是帧里的例外，位于大目标内部。
- 对比度：两套主题的正文与次级墨都按 4.5:1 校过（琥珀 / 绿在浅色下压深就是为此）。
- 语义：`aria-pressed`（胶囊 / 分段）、`role="switch" + aria-checked`、`role="dialog" aria-modal`、`role="status" aria-live="polite"`（Toast、结果计数）。装饰性元素（属性点、纯图形头像回落）挂 `aria-hidden`。
- 路由 push 时回顶（`useScrollResetOnPush`），返回交给浏览器恢复；整页选择器用 `useScrollResetWhileMounted`。
- 底部按钮的 `bottom` 必须含 `env(safe-area-inset-bottom)`，否则被导航胶囊压住（R21）。

---

## 10. 怎么扩展

1. **先找帧**。`01`–`09` / 补画帧里有的，照帧做；帧里没有的元素，默认是有意舍弃，不要「补回来」。
2. **先找 token，再找 `.lk-*`，最后才写新值**。新值按 §2.1 的三层规则落位，并在声明处写清「为什么现有 token 不够」——现有文件里每个局部变量都有这样一行注释，保持它。
3. **不要造「全站统一规格」**。不同页的同类控件档位不同是设计意图。
4. **视觉改动由 owner 肉眼在 preview 验收**（AGENTS.md §3）：Agent 交付时写清改了哪些页面 / 状态、路由与操作步骤，不自行截图或跑 Playwright 验收，也不为视觉改动新增回归用例。

---

## 11. 已知缺口

- **焦点可见性**：全站只有 `TeamListCard` 显式画了 `focus:ring`，其余交互元素依赖浏览器默认环，而多数按钮又是自定义背景 —— 键盘用户的可见焦点没有统一方案。**这是当前最大的一致性缺口。**
- **死 token**：`secondary`、`divider`、`legalBg`、`reviewBg`、`missingBg`、`overlay`、`onOverlay`、`fnGreen` 在 `tailwind.config.js` 里仍然映射，但 `src/` 里 Tailwind class 与 CSS `var()` 引用均为 0。`border` / `card` 各只剩 1 处引用。清理前需确认没有 `dist/` 之外的消费方。
- **推定值**：`05-04` 两列选择卡（`calculator.css`）与 `N01-14` 数据状态的浅色值没有对应浅色帧，是按同角色 token 推的，已在各自文件里标注。
- **玻璃材质只有导航一处**，没有第二个使用场景来验证它是否成体系。
