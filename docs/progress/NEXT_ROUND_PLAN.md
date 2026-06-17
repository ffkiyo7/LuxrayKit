# 下一轮开发计划 / TASKS

更新日期：2026-06-14

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

## 任务清单

### Task A — 新增宝可梦默认空白配置（就绪 · 前端 · 独立）

- **背景**：当前在队伍配置页新增宝可梦时，会默认带上首个特性、前 2 个招式、性格「爽朗」、SP「速度 32」。需求是**新增即全空**：特性 / 招式 / 性格 / SP 努力值都留空，等用户自己填。
- **目标**：通过「快速添加」（队伍页）和「加入队伍」（图鉴页）新建的成员，所有可配置项为空白；成员显示为**中性「待配置」**态，不是红色「不合法」。
- **涉及文件**：
  - `src/pages/TeamPage.tsx`：`blankMember`（:16）、`handlePickPokemon`（:1135）、性格 `SelectField`（:604）。
  - `src/pages/DexPage.tsx`：`addToTeam`（:399）——用户只点名队伍页，但图鉴「加入队伍」入口必须保持一致，否则两条路径行为不一。
  - `src/lib/legality.ts`：`evaluateMemberLegality`（:65 缺字段判定）。
- **改动要点**：
  - `blankMember`：`nature: '爽朗'` → `nature: ''`；`statPoints: { speed: 32 }` → `statPoints: {}`；`moveIds` 已是 `[]`，保持。
  - `handlePickPokemon`（:1137-1143）：去掉 `abilityId: entry.abilities[0]` 与 `moveIds: currentRuleMovesForPokemon(...).slice(0, 2)...`；直接基于 `blankMember()` 只补 `pokemonId`（notes 可留空或保留提示文案，不带任何特性/招式/性格/SP）。
  - `DexPage.tsx` `addToTeam`（:401-413）：同步去掉默认 `abilityId`、`moveIds`、`nature`、`statPoints`（性格改 `''`、SP 改 `{}`、moveIds 改 `[]`、不设 abilityId）；`formId` / `requiredItemId`（Mega 必带件）等与形态相关的字段保留，别误删。
  - **性格下拉补「未选择」占位**（:604-618）：当前 `性格` 的 `SelectField` 没有空选项，`value=''` 会显示异常。仿照「特性」selector（:587-588 的 `<option value="">未选择</option>`）在性格选项最前面加一个空占位，使空性格正确呈现为「未选择」。
  - **legality 中性态**（:65-67）：当前「有 `pokemonId` 但缺特性/招式」会进 `missing-required-field` error → 整体判 `illegal`（红色）。改为：**当成员有 `pokemonId`、但特性为空且 `moveIds` 为空（即全新未配置成员）时，返回 `status: 'missing-config'`（中性待配置），不报 error**。一旦用户补了特性或任意招式，再走原有的缺字段校验（保持现有 illegal/needs-review 行为不变）。注意不要影响导入队伍 / 已配置成员的判定。
- **验收**：
  - 队伍页「快速添加」、图鉴页「加入队伍」新增的宝可梦：特性 / 招式 / 性格 / SP 全空；
  - 新增成员在列表与编辑器显示「待配置」中性态，不是红色不合法；
  - 编辑器性格下拉有「未选择」占位，可正常补齐各字段；
  - `npm test` 通过（更新/新增：`handlePickPokemon`、`addToTeam`、`legality` 空白成员判 `missing-config` 的用例）；`npm run build` 通过。

### Task B — 数据口径页「样本池」卡片去掉选中高亮（就绪 · 前端 · 独立）

- **背景**：环境 → 数据口径二级页（`EnvironmentMethodologyPage`）的「样本池」里，单打/双打两张「N 队」子卡，当前会给匹配当前对战类型的那张加 accent 边框+底色高亮，像被「选中 / 可点击」。但这两张是纯展示 `div`、没有 `onClick`，用户误以为能点。真正切换对战类型只在头部的单双打胶囊。
- **目标**：样本池两张卡统一中性外观、无「选中」高亮、视觉上不可交互；头部胶囊切换不动。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（样本池卡 :580-585）。
- **改动要点**：
  - 把样本池子卡的 `className={...type === battleType ? 'border-accent bg-accent/10' : 'border-border bg-secondary'}` 的条件去掉，两张卡都用中性样式（统一 `border-border bg-secondary`）。
  - 卡片仍按 `battleType` 显示对应数字（数字内容不变，去掉的只是高亮/选中样式）；保持无 `onClick`、无 hover/active 交互暗示。
  - **不要动**头部单双打胶囊（:562-573）——那才是真正的切换入口，保持现状。
- **验收**：
  - 口径页样本池两卡外观一致、无 accent 高亮、看不出可点；
  - 头部胶囊仍能切换单/双打，切换后样本池数字随之更新；
  - `npm run test:visual` 更新口径页快照；`npm test` 通过。

## 暂不做

- 引入 PokeDB 之外的第三方数据源；完整战斗模拟器、用户账号 / 云同步 / 跨设备队伍、多赛季趋势库。
- 升级 Workers Paid。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run test:visual        # 涉及 UI / 口径页时（Task B 必跑）
```

- Task A：新增宝可梦特性/招式/性格/SP 全空、显示「待配置」中性态、性格下拉有「未选择」占位；队伍页与图鉴页两条新增路径一致。
- Task B：样本池两卡无选中高亮且不可交互；头部胶囊仍可切换；口径页视觉快照更新。
