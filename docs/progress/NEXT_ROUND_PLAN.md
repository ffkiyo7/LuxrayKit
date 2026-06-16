# 下一轮开发计划 / TASKS

更新日期：2026-06-16

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

## 任务清单

### Task A — 首页宝可梦榜 top4 → top5（就绪 · 独立 · 前端）

- **目标**：环境首页「宝可梦榜」从展示 top4 改为 **top5**（4 行偶数看着别扭，top5 更符合直觉）。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`。
- **改动要点**：
  - `:687` `const visibleRankings = rankings.slice(0, 4);` → `slice(0, 5)`。该段是首页平铺区（Task H 已定首页不分档），只多渲染一行，无其它副作用。
- **验收**：首页榜展示 5 行；点第 5 行能进详情；`npm test` 通过；`npm run test:visual` 更新首页环境快照（`02-environment` 一带）。
- **注意**：若 `EnvironmentPage.test.tsx` / `App.test.tsx` 有断言首页榜「4 行」的用例，同步改成 5。

### Task B — 上位构筑卡片：队报链接降级为图标，导入配置独占整行（就绪 · 独立 · 前端）

- **目标**：上位构筑样本卡片里「导入配置」与「队报链接」当前是等宽并排的两个按钮，分量不对——导入是主操作，队报链接只是「去外站看原帖」的次操作。把队报链接收成卡片**右上角的小图标链接**，「导入配置」**独占整行**做主操作。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`TeamSampleCard`，:166-208）；测试 `src/App.test.tsx`。
- **改动要点**：
  - `TeamSampleCard` 外层 `Card` 设为可定位容器，在右上角放一个 `ExternalLink` 小图标按钮跳 `sample.reportUrl`（`target=_blank`、`rel=noopener,noreferrer`）；**务必保留无障碍名 `aria-label="队报链接"`**（现有测试按名字查得到，别让它消失）。
  - 底部 `grid grid-cols-2`（:196-205）改为**单个全宽**「导入配置」按钮，删掉原并排的「队报链接」`Button`。
  - **不动**导入弹窗 `ImportCoverageNoticeDialog`（`src/App.tsx:52-67`）里的「队报链接」按钮——那是导入流程内的上下文操作，保持现状。
- **验收**：样本卡片只有一个全宽「导入配置」主按钮 + 右上角队报链接小图标；图标可点开外链且有可访问名；`npm test` 通过；`npm run test:visual` 更新对应快照。

### Task C — 编辑页校验瘦身：只留 SP + 同队道具去重，其余不展示（就绪 · 前端）

> **出发点**：编辑页的招式/特性/道具本就**预过滤**——不能学的招式、不具备的特性、当前赛季外的道具根本不出现在可选项里；Mega 石也按宝可梦门控（只有可 Mega 的宝可梦才出现对应 Mega 石）。所以那张「校验结果」卡片里的招式/特性/道具/Mega 不匹配等提示是重复劳动，对用户是噪音。只保留两条用户真正会踩的规则：**SP 上限** 与 **同队重复携带道具**（对战潜规则）。

- **涉及文件**：`src/pages/TeamPage.tsx`（`MemberEditor` 及队伍卡片详情区）；可能少量触及 `src/lib/legality.ts`（见下，倾向不改签名）。
- **删除/改动**：
  - **删「校验结果」卡片**：`MemberEditor` 里的整张校验结果 `Card`（:660-676，含合法/非法/需复核/缺少配置徽章 + issue 文案列表）移除。
  - **删过期文案**：`:539`「字段级校验会在保存前实时更新」、`:657`「单项最多 32 · 超过 66 会在校验中报错」这类说明按需删除或改写为中性提示。
  - **删过期注释行**：`:209`「数据版本：{team.dataVersionId}」整行删掉（dv-reg-ma-seed 调试痕迹）。
  - **保留 SP 计数**：顶部 `已用 {totalStatPoints}/{MAX_TOTAL_STAT_POINTS}`（:188、:638-640）保留；超 66 维持标红（现有 `text-danger` 逻辑）。
  - **保留并新增拦截**：保存时若 **SP 单项 > 32 或总量 > 66**、**或同队重复携带同一道具**，**禁止保存**（主保存按钮 `disabled`）。
  - **同队道具去重的提示落点**：不进大卡片，改为在道具选择字段下方一行小红字（如「同队已有成员携带该道具」），仅在命中时出现。
  - **其余校验全部不展示也不拦截**（招式/特性/道具不在规则、Mega 不匹配、seed 需复核、缺字段等）——由预过滤兜底。
- **`legalityStatus` 存储字段处理（实现时定，倾向最小改动）**：`onSave` 仍写 `legalityStatus`（`src/types.ts:206` 是存储字段，`DexPage`/`damageAdapter` 等仍引用）。**倾向**：继续用 `evaluateMemberLegality` 算出 status 静默存储、只是不再渲染 issue 列表——这样不动 `legality.ts` 签名、不波及其它消费方；编辑页的「能否保存」用一个独立的轻量判断（SP + 同队道具）。**不要**为了瘦身去改 `legality.ts` 的对外行为。
- **验收**：编辑页无「校验结果」卡片、无合法性徽章、无「数据版本」行；SP 计数保留、超 66 标红且禁止保存；同队重复道具有内联小红字且禁止保存；其它非法配置不再弹任何提示；`npm test` 通过（更新/删除涉及校验展示的断言）；`npm run test:visual` 更新编辑页快照。

### Task D — 砍掉生成图片 + 队伍卡片去按钮化（就绪 · 前端）

> **出发点**：生成图片是低价值功能，砍掉。砍掉后队伍卡片底部那排「编辑配置 / 生成图片」大按钮就没必要了——卡片本身已经 `onClick={onEdit}`（`TeamPage.tsx:763`），点卡片即进编辑本就成立。改为**卡片点击进编辑 + 右上角小 edit 图标**作显式暗示，列表更聚焦。

- **涉及文件**：`src/pages/TeamPage.tsx`、`src/lib/teamImage.ts`、`src/lib/teamImage.test.ts`、`src/App.test.tsx`、`src/pages/ProfilePage.tsx`。
- **改动要点**：
  - **删生成图片**：队伍卡片「生成图片」按钮（:840-848）、`TeamImageResultDialog`（:854-882）、`shareImage` state（:990）、其渲染（:1290）、`onGenerateImage` 链路与 `TeamShareImage`/`teamImage` 相关 import 全部移除。
  - **删生成图片底层**：`src/lib/teamImage.ts` 与 `src/lib/teamImage.test.ts` 删除；清理任何残留 import。
  - **去按钮化**：删掉卡片底部 `grid grid-cols-2` 那排按钮（含原「编辑配置」——它和卡片 `onClick` 同为 `onEdit`，冗余）。卡片整体点击继续进编辑（保留 `:763` `onClick={onEdit}` 与键盘可达 `onKeyDown`）。
  - **加 edit 图标暗示**：在卡片右上角、删除图标（:766-777）旁加一个小 `Edit3`（或 `Pencil`）图标按钮，`aria-label="编辑 {team.name}"`，点击 `stopPropagation` 后 `onEdit()`——作为「这张卡可编辑」的显式入口；样式与删除图标保持一致量级。
  - **清文案**：`ProfilePage.tsx:131` 那句「队伍详情页生成的是分享图片，和这里的备份文件分开处理」删掉或改写（分享图功能已不存在）。
  - **改测试**：`App.test.tsx` 中生成图片相关用例（:308-314 队伍分享图弹窗、:327 导入卡含「生成图片」按钮）删除或改为断言不再存在；卡片交互断言对齐新「点卡片即编辑 + edit 图标」。
- **验收**：队伍卡片无底部按钮排、无「生成图片」；点卡片或点右上角 edit 图标都能进编辑；删除图标仍在且独立；全仓 grep 无 `teamImage`/`生成图片`/`分享图` 悬挂引用；`npm test`、`npm run build` 通过；`npm run test:visual` 更新队伍页快照。

### Task E — 图鉴特性搜索支持按宝可梦名反查（就绪 · 独立 · 前端）

> **出发点**：特性 tab 每条特性已经展示「拥有该特性的宝可梦」（`abilityEntries`，反向关系现成），但搜索只匹配特性自己的名字。希望搜宝可梦名（如「喷火龙」）时直接列出它能有的特性——反查关系已存在，接进搜索即可。

- **涉及文件**：`src/pages/DexPage.tsx`；测试 `src/App.test.tsx`。
- **改动要点**：
  - 一次性 `useMemo` 建 `abilityId → owner 名字串`（owner 的 `chineseName/englishName/japaneseName` 拼接）索引，源用现有 `dexEntries`（已含 mega 形态）。
  - `filteredAbilities`（:671-674）的 `matchesSearch` 追加该 owner 名字串入参：`matchesSearch(a.chineseName, a.englishName, abilityOwnerNames.get(a.id))`。特性名命中与宝可梦名命中两条路并存。
  - 不动数据层；空态「没有找到相关特性」保留。
  - **命中 owner 提前**：有搜索词时，把命中的 owner 分到 `abilityEntries` 最前（`[...命中, ...未命中]` 拼接，稳定保序），让头像预览（`previewEntries`，:866）先展示用户搜的那只、不被折进「+N」；无搜索词时保持原图鉴序。命中判定的名字字段（CN/EN/JP）必须与上面建索引的字段**完全一致**，避免「搜得到特性却没把那只提前」。
- **验收**：特性 tab 搜宝可梦中/英/日名 → 列出该宝可梦可有的特性，且该宝可梦头像出现在 owner 预览最前；搜特性名行为不变；`npm test`（在 `App.test.tsx:851` 共享搜索用例旁加一条按宝可梦名反查 + 断言命中 owner 排在预览首位）通过；`npm run build` 通过。

### Task F — 伤害计算页排版重规划（低优先级 · 前端 · 算法不动）

> **出发点**：伤害计算页算法基本够用、不需大改，但**页面排版不满意**，要重新规划。优先级不高，可后置。

- **涉及文件**：`src/pages/CalculatorPage.tsx`（仅展示/排版层）；**不动** `src/lib/damageAdapter.ts` 等计算逻辑。
- **范围/约束**：
  - 只重排版式与信息层级（进攻/防守方卡片、招式区、对战条件、伤害结果的布局与视觉），计算结果与口径不变。
  - 可走 `frontend-design` 技能定方向；保持与全站 `text-xs/text-sm` 设计语言一致。
  - **与 Task G 有重叠**（溢出/字号），两者若并行需协调：G 先把字号/溢出根因解掉，F 在干净基线上重排，避免互相打架。建议 G 先于 F。
- **验收**：排版调整后 `npm run build` 通过；`npm run test:visual` 更新计算页快照；计算结果与改前一致（已有计算单测不应回归）。

### Task G — PWA 表单字号/溢出修复（就绪 · 前端 · 保留移动端 no-zoom）

> **更正既有认知**：并非「整个 PWA 字号被放大」。`src/styles.css:91-97` 只对触摸设备的 `input/select/textarea` 强制 `font-size:16px !important`（防 iOS 聚焦自动缩放）。副作用有二：①所有表单控件被顶到 16px，比 `text-xs/text-sm` 设计大一截 → 字号不统一；②叠加缺失的 `min-w-0` 造成溢出。

- **涉及文件**：`src/styles.css`；`src/pages/CalculatorPage.tsx`（重灾区 `:414-426` 招式 select）；并扫一遍其它含 `select`/紧凑栅格的页面。
- **复现（确认）**：计算页成员编辑，进攻方选「幽尾玄鱼」、招式选「水流喷射」→ 招式 `<select>`（`CalculatorPage.tsx:414`）的 option 文案长（`水流喷射 / Aqua Jet · 40 · 水`），该 select 是 `flex-1` **但无 `min-w-0`**，固有宽度被最长 option 撑开、再被 16px 放大 → 顶破右边界。
- **改动要点（方向，实现时按真机验证微调）**：
  - **收窄 16px 规则**：iOS 聚焦缩放只针对文本输入类（text/search/number/textarea）；原生 `<select>` 弹滚轮选择器、不触发。把 `styles.css` 的 `font-size:16px` 规则**排除 `select`**（让 select 回到设计字号），仅保留在文本输入类上。**真机确认 select 不会重新触发缩放**后定稿。
  - **修溢出**：给招式 select 补 `min-w-0` + 截断（`truncate`/`text-overflow`），必要时缩短 option 文案；`grid`/`flex` 紧凑单元普遍补 `min-w-0`。
  - 全站扫一遍其它 `select`/`input` 是否还有同类偏大/溢出。
- **验收**：移动端聚焦搜索/文本框仍不缩放；表单控件字号回到设计语言、与周围组件一致；计算页成员编辑招式行不再溢出右边界；`npm run build`、`npm test` 通过；`npm run test:visual` 更新受影响快照。

### Task H — 伤害计算「从队伍选择成员」支持选队 + 确认配置代入（就绪 · 前端）

> **更正既有认知**：「从队伍选择」入口**已存在**（`CalculatorPage.tsx:881-911`），且 `buildCalcConfigFromTeamMember`（`damageAdapter.ts:687`）**已把宝可梦/形态/特性/道具/招式/性格/SP 全量代入**，用户无需重配——这条**保持现状别动**。真正缺口是选队体验。

- **涉及文件**：`src/pages/CalculatorPage.tsx`。
- **改动要点**：
  - `recommended`（:798-806）当前把**所有队伍成员拍平 + `.slice(0, 8)` 截断**，导致多队时有人被藏、且无法指定队伍。改为**让用户先选队**（队伍下拉/分段），再列该队成员；或**按队伍分组**展示并显示队名。
  - 渲染按钮现仅显示宝可梦中文名（:905），**已算出的 `teamName` 未展示**；补上队名（尤其同一只宝可梦出现在多队时要能区分）。
  - **去掉 `.slice(0, 8)` 硬上限**（在选队/分组后单队成员数有限，不再需要全局截断）。
  - 配置代入逻辑（`pickTeamMember` → `buildCalcConfigFromTeamMember`）不动，仅确认仍正确携带全量配置。
- **验收**：多队场景下能选择具体队伍并看到队名；从某队成员添加进计算后，特性/道具/招式/性格/SP 与队伍编辑页一致（无需重配）；`npm test`、`npm run build` 通过。

## 上线前联合核验（Claude + Codex 一起做 · 不拆细 spec · 时间敏感）

> **背景**：明天（2026-06-17）宝可梦冠军移动端上线，项目希望卡这个点在社媒宣传，故需确认已具备上线条件。**本节按用户要求不写细 spec、不单独丢给 codex，由 Claude + Codex 一起过。**

核验维度（高层，不展开成逐条任务）：

- **数据 0 错误**：全量可浏览内容（宝可梦/招式/道具/特性/环境榜等）数据正确，无错条目、无 audit 报警遗留。
- **功能无故障**：所有可开放、可点击、可浏览的入口与交互走查一遍，无崩溃/死链/空白。
- **前端体验**：无遮挡、无溢出、无错位影响体验的地方（与 Task G 联动）。
- **数据来源口径规范化**：核实当前各类数据**从哪里来**、**还能不能复用**，并统一对外口径表述（沿用环境页已确立的「来源/范围/排行/详情/构筑」口径，扩展到全站）。

产出：一份联合走查结论（问题清单 + 是否阻断上线 + 处置），不预先细化为子任务，发现问题再就地拆。

## 暂不做

- 引入新数据源 / 完整战斗模拟器 / 用户账号 / 云同步 / 多赛季趋势库（沿用上轮判断）。
- 升级 Workers Paid（免费分批方案已够用）。
- 队伍分析（上轮已下线）。
- 生成/分享图片（本轮砍掉，暂无需求；若日后要回归再重评落点）。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run test:visual        # 涉及 UI 改动
```

- Task A：首页榜 5 行、点第 5 行可进详情；快照更新。
- Task B：样本卡片单个全宽「导入配置」+ 右上角队报链接小图标（有可访问名）；导入弹窗内队报链接不变。
- Task C：编辑页无校验结果卡片/合法性徽章/数据版本行；SP 计数保留、超 66 标红禁存；同队重复道具内联红字禁存；其它非法配置不再提示。
- Task D：队伍卡片去按钮化、生成图片整链删净、edit 图标可进编辑、点卡片可进编辑；无悬挂引用。
- Task E：特性 tab 按宝可梦名能搜出其特性、按特性名行为不变；新增反查用例通过。
- Task F（低优先级）：计算页排版重排、计算结果不变、视觉快照更新；建议在 Task G 之后做。
- Task G：移动端仍不缩放、表单字号回到设计语言、计算页招式行不溢出；快照更新。
- Task H：计算页能按队伍选成员并显示队名、去掉 8 个上限、配置全量代入无需重配。
