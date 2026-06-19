# 下一轮开发计划 / TASKS

更新日期：2026-06-19

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

> 上一轮 Task A–E、G、H 及「上线前联合核验」已全部完成并验证（2026-06-18 核对，`npm test` 239 passed）。Task 1（伤害计算补全新赛季 Mega 物种映射）已完成并验证（2026-06-18 核对，`npm test` 240 passed，`npm run build` passed）。Task 2（一次性脚本摄入 VGCPastes「Champions M-A」构筑）已完成并验证（2026-06-19 核对并经 Claude review 修订：**按赛事含金量清洗**——仅保留官方线下锦标赛 + 近 30 天窗口，PJCS 取 Top14，最终入库 **99 队**；42 队带游戏内队伍码、63 队含完整 SP；修正了 EV→SP 误除以 8 的 bug；数据改为**运行时 fetch（不再打包进 JS）** + SW 预缓存，267KB。`npm test` 246 passed，`npm run build` passed）。Task F（伤害计算页排版重规划）经确认**保留、暂不做**，见文末。

> **本轮（2026-06-19）新增**：将一批零散需求整理为 Task 6–16。其中**原 Task 12（队伍卡片字段适配）经复核与 Task 3/5 重合，已撤销**——「SP/配招」即 Task 3 的可导入胶囊、「队伍码」属 Task 5、唯一新增的「来源标识」并入 Task 3。挂起的 **Task 3/4/5 现追加依赖 Task 8**：VGCPastes 批不稳定渲染时，卡片字段、乱序、队伍码都无从验证（队伍都没展示，就谈不上数据细粒度胶囊）。Task 8 已完成并验证（2026-06-19：改为 Vite 动态 import 的构建期受管样本 chunk，移除运行时 fetch 与 SW 裸 JSON 预缓存；`npm test` 247 passed，`npm run build` passed，`npm run test:visual` passed，`npm run test:pwa` passed）。Task 3/4/5 已完成并验证（2026-06-19：卡片来源标签 + 可导入粒度行、动态导入提醒、VGCPastes 赛事标题保留、样本池种子乱序 + 换批重洗、队伍码导入/详情展示/复制 toast、TeamPage 去掉「本地队伍 · 可自由编辑」；`npm test` 250 passed，`npm run build` passed，`npm run test:visual` passed）。Task 6/7/9 已完成并验证（2026-06-19：底栏触底守卫不再遮挡内容；花叶蒂改永恒花形态种族值；数据口径样本量框去误导光标；`npm test` 252 passed，`npm run build` passed，`npm run test:visual` passed）。Task 10/11 已完成并验证（2026-06-19：伤害计算页普通进入与离开后重进均为空白态，显式从队伍/图鉴带入仍保留；手动新增队员与图鉴加入统一默认成员初始化，原始形态/首个合法特性/中性性格/0 SP/空招式/无道具；`npm test` 254 passed，`npm run build` passed，`npm run test:visual` passed）。另：修复 Task 4 乱序导致的「导入提醒」用例偶发 flake（环境页 remount 重新随机播种 → 同一样本被导入两次 → 同名队伍卡冲突；改为测试内固定乱序种子，非产品 bug；隔离连跑 8/8、全量 254 passed）。基础设施：`cloudflare/environment-worker/wrangler.jsonc` 的自定义域名 `routes` 已注释保留（合并部署后停用对外 `luxraykit.com`，Worker 仍经 `*.workers.dev` 提供；详见 `DEVELOPMENT_PROGRESS.md`）。**剩余**：功能（Task 13）→ 速度线重做（Task 14）→ 浅色主题（Task 15）→ 探针（Task 16）。Task 13/14/16 标注 **spike/调试先行**：先调研或复现并汇报，再写实现代码。

## 任务清单

### Task F — 伤害计算页排版重规划（保留 · 暂不做 · 低优先级 · 前端 · 算法不动）

> 上一轮遗留。经确认本轮**保留但暂不做**，待后续排期。算法/计算口径不动，仅重排展示层与信息层级（进攻/防守方卡片、招式区、对战条件、伤害结果的布局与视觉）。可走 `frontend-design` 技能定方向，保持与全站 `text-xs/text-sm` 设计语言一致。

### Task 3 — 构筑样本卡片字段适配：可导入粒度胶囊 + 来源标识 + 导入提醒重写（已完成 · 2026-06-19）

> **依赖 Task 2**（用其 `hasMoves`/`hasSpread` 完整度标记、来源信息）**+ Task 8**（VGCPastes 批先稳定渲染，否则卡片字段无从验证）。**并入需求 #12（导入提醒重写）与撤销的原 Task 12（队伍卡片字段适配）**——经核：原 Task 12 的「SP/配招」即本任务胶囊、「队伍码」属 Task 5、唯一新增「来源标识」并入本任务，故 Task 12 不再单列。

> 完成记录：卡片已显示 PokeDB 环境榜 / VGCPastes 锦标赛来源标签，并按 `hasSpread`/`hasMoves`/`replicaCode` 渲染「可导入：[SP分配][配招][队伍码]」粒度行；导入提示改为按当前样本动态说明可带入项与缺失项。额外修正 VGCPastes 样本被旧 PokeDB「赛季 · 名次 · 分数」标题归一化覆盖的问题：赛事样本保留原始标题，并展示赛事、名次/组别与分享日期。复核后去掉重复的「可导入」标签，仅保留粒度行。

- **目标**：每个构筑样本按公开配置完整度，在卡片上用**胶囊 icon** + 「**可导入：[SP分配][配招]**」注释行标明能导入到什么粒度（仅命中项出现）。PokeDB 旧源样本通常只有宝可梦+道具（两标记皆 false），PokePaste 新源样本两者皆有。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`TeamSampleCard`）；`src/types.ts`（`EnvironmentTeamSample` 补 `hasMoves`/`hasSpread`，若 Task 2 未加）；导入提醒文案 `src/App.tsx:52-68`（`ImportConfigPrompt`）；测试 `src/App.test.tsx`。
- **改动要点**：
  - `TeamSampleCard` 内按 `hasSpread`/`hasMoves` 渲染胶囊：命中则显示「可导入：[SP分配][配招]」一行（仅命中项），无命中则不显示该行（或中性提示「仅宝可梦+道具」，实现时定）。
  - 「导入配置」按钮行为：携带该样本**实际具备**的配置粒度导入（有配招/ SP 就一并代入）。
  - **来源标识（原 Task 12 唯一残留项）**：卡片上区分样本来源（PokeDB 环境榜 / VGCPastes 锦标赛），用轻量标签；遵循记忆「不暴露存储/实现细节、突出信息价值」。样本带队伍码（`replicaCode`）时可在胶囊行追加「队伍码」可导入标记（**码值的展示与复制仍属 Task 5 的队伍详情页**，本任务只标「有」）。
  - **导入提醒重写（#12）**：现 `src/App.tsx:57` 文案为旧 PokeDB-only 世界写死（「目前可稳定带入 Pokémon 和道具；性格、SP、完整配招等信息可能缺失…」）。改为**随当前样本的粒度动态生成**——样本有 SP/配招就如实说明能带入什么，缺什么才提示缺什么；遵循记忆「不暴露存储/实现细节，突出范本能提供的信息价值」。与 Task 13 的「队报链接」按钮在同一弹框，注意协调。
- **验收**：含完整配置的样本显示对应胶囊与注释行、仅基础信息的样本不显示；导入提醒文案随样本粒度变化、不再写死；`npm test` 通过；`npm run test:visual` 更新环境页快照。

### Task 4 — 上位构筑列表乱序展示 +「换一批」随机（已完成 · 2026-06-19）

> **出发点**：现在「上位构筑」按来源排名顺序排列，`换一批`（`EnvironmentPage.tsx:761`）只是 `teamSampleBatchIndex` 顺着 +1 取模、按原序往下切片（`:631` `teamSamples.slice(...)`）——用户点「换一批」只是顺位下翻。接入 Task 2 后样本来自 **PokeDB + VGCPastes 多来源**，严格按排名排序已无意义，应**乱序**让「换一批」真正给出多样化的不同构筑（并自然混合两个来源）。

> 完成记录：按当前 battleType 样本池生成带种子的乱序列表，当前浏览内按乱序顺位分批展示；翻到末页后换新种子重洗，切换单打/双打时重置批次和种子。测试覆盖首屏乱序批次、换批不重复以及目标样本翻页可达。

- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`teamSamples`/`visibleTeamSamples`/`换一批` 一带，`:625-634`、`:757-766`）；测试 `src/App.test.tsx`。
- **改动要点**：
  - 把按来源原序切片改为**对该 `battleType` 的样本池整体乱序后再分批**（PokeDB 与 VGCPastes 混合打乱）。
  - **推荐做法**：用**带种子的洗牌**在 `useMemo` 里按当前 `battleType` 生成一次乱序（保证同一次浏览内 `换一批` 顺着乱序顺位翻、不立刻重复）；`换一批` 翻到末页回绕时**换新种子重洗**，避免反复看到同一批。种子用 state 持有，便于单测断言「顺序变化且不崩、不丢样本」。
  - 切换 `battleType` 时重置（沿用现有 `setTeamSampleBatchIndex(0)`，并重置种子）。
  - 不动导入/详情逻辑；卡片 `key` 仍用 `sample.id`。
- **验收**：上位构筑首屏即为乱序、非严格排名序；`换一批` 给出乱序后的不同批次（非顺位下翻）；切换单打/双打重置；样本不丢不重（单页内）；`npm test` 通过；`npm run test:visual` 更新环境页快照。

### Task 5 — 队伍码：写入 → 导入带入 → 队伍详情页展示与复制（已完成 · 2026-06-19）

> **出发点**：VGCPastes 部分队伍带**游戏内队伍码**（`Replica Code` 列）。要把它打通到前端，让用户能直接看到并复制这串码（拿去游戏内一键导入整队）。**不加新入口**，直接展示在「导入配置后」的队伍详情（成员 2×3）页面。**本任务同时落地需求 #1**：去掉 `TeamPage.tsx:1170` 那句 AI 味注释里的「本地队伍」框定（无账号，所有队伍都是本地，「本地」是冗余且暗示了不存在的「云端」区分）。

> 完成记录：`Team.replicaCode` 已接入环境样本导入链路并保留在队伍 schema 归一化中；队伍详情页成员计数后展示队伍码和复制按钮，无码队伍仅显示成员计数；复制调用 `navigator.clipboard.writeText` 并复用顶部 toast，文案为「队伍码已复制 / 分享可能已过期」。原「本地队伍 · 可自由编辑」说明已移除。

- **链路**：`Replica Code` 列 → Task 2 写入 `EnvironmentTeamSample.replicaCode?` → 导入时带入本地队伍 → 队伍详情页展示。
- **涉及文件**：`src/types.ts`（`Team` 加 `replicaCode?: string`；`EnvironmentTeamSample.replicaCode?` 由 Task 2 加，本任务消费）；样本→本地队伍的导入转换处（`src/App.tsx` 导入链路 / 相关 helper，把 `replicaCode` 带进新建 `Team`）；`src/pages/TeamPage.tsx`（`:1170` 那行 + 复制交互）；toast 复用 `src/App.tsx:275-283` 既有小长条；测试 `src/App.test.tsx`。
- **改动要点（UI）**：
  - **改 `TeamPage.tsx:1170` 那句（#1）**：`{activeTeam.members.length}/6 成员 · 本地队伍 · 可自由编辑` → **只保留成员计数** `{activeTeam.members.length}/6 成员`（去掉「· 本地队伍 · 可自由编辑」）。
  - **有队伍码时**：在成员计数后用分隔符（`·`）接上**队伍码文本**，码后跟一个**复制图标按钮**（lucide `Copy`，`aria-label="复制队伍码"`）。无码的队伍只显示成员计数。
  - **点复制**：`navigator.clipboard.writeText(replicaCode)` → 触发小长条 toast（**复用 `importToast` 同款机制与样式**）：文案「**队伍码已复制**」+ 一句简短说明「**分享可能已过期**」（作次要小字或第二行）。toast 自动消失沿用现有 setTimeout。
  - toast 触发需让 `TeamPage` 能调到 App 的 toast（prop/context 暴露 `showToast`，或在 TeamPage 内复用同款组件——实现时择简）。
- **验收**：导入带队伍码的 VGCPastes 队后，队伍详情页那行只剩「X/6 成员」并在其后展示队伍码 + 复制图标；无码队伍只显示成员计数；点复制写入剪贴板并弹出「队伍码已复制 / 分享可能已过期」小长条；`npm test` 通过；`npm run test:visual` 更新队伍页快照。

---

### Task 8 — VGCPastes 批次导入后消失 + 配置映射核验（已完成 · 2026-06-19）

> 完成记录：根因是 VGCPastes 作为 `public/data` 裸 JSON 运行时 fetch；任何 404、离线缓存未命中或 SW 错版都会被 `catch` 静默吞成空数组，表现为「PokeDB 正常但 VGCPastes 整批消失」。已改为 `src/data/external/vgcpastes/reg_ma_champions_ma_team_samples.json` 的 Vite 动态 import，生成 hash chunk；摄入脚本同步写入该受管位置；SW 移除 `/data/vgcpastes/*` 预缓存并 bump cache。验证：`npm run data:vgcpastes:champions-ma:check`、`npm test`、`npm run build`、`npm run test:visual`、`npm run test:pwa` 均通过。

> **现象（严重）**：昨天部署后，VGCPastes 来源的一批构筑曾在页面出现过一次，之后**再也没刷出来**——明明导入了等于没导入。这批样本本应带详细配置（SP/配招/队伍码）。
>
> **背景**：Task 2 把该数据改为**运行时 `fetch` `public/data/vgcpastes/*.json` + SW 预缓存**——该方案是昨天临时定的，**非最初设计，不稳即可换**。

- **嫌疑顺序**：
  1. 运行时 fetch 偶发失败 → 静默回退到不含 VGCPastes 的数据集 → 整批消失；首次能看到是 fetch/缓存恰好命中。
  2. SW 提供过期/空缓存：重新部署后 `public/data/vgcpastes/*.json` 缓存键/版本对不上。
  3. 审计过滤（`EnvironmentDataset` 丢弃未知引用，`ENVIRONMENT_AUDIT_UNKNOWN_THRESHOLD=0`）在某条路径上把整批静默过滤。
- **做法**：
  - **先 `systematic-debugging`**：复现「消失」路径、确认根因，**再动手**。
  - **默认补救（若确为运行时 fetch 不稳）**：改为**构建期受管的数据加载**——优先 **动态 `import()` 样本模块**（Vite 产物 hash + manifest 驱动 SW 预缓存，按需 chunk；既不臃肿主 bundle，又消除「静默 fetch 失败回退」「缓存错版」两类失效）；动态 import 若与 SW 冲突则退回**静态 import**。稳定性优先于 bundle 纯净度。
  - **同时核验映射**：导入这批后 `hasSpread`/`hasMoves`/`replicaCode`/SP/配招 是否正确带入（昨天的修复是否真生效）。
- **涉及文件**：`src/lib/environmentDataset.ts`、Task 2 的运行时 fetch 入口、`public/data/vgcpastes/*`、SW（`src/sw.*` / 预缓存清单）、`src/lib/dataAudit.ts`、`src/lib/environmentImport.ts`。
- **验收**：反复刷新 / 重新部署 / 离线重载后 VGCPastes 批**稳定出现**；带详细配置的样本字段完整；`npm test` + `npm run test:visual` + `npm run test:pwa` 通过。

### Task 6 — 底部导航栏滚到底部上浮遮挡内容（已完成 · 2026-06-19）

> **现象**：滑动页面到底部时，底部导航栏会上浮到页面下半部分并遮挡内容。

> 完成记录：`useAutoHideBottomNav.ts` 新增 `isNearScrollEnd`（`scrollTop + 视口高 >= 内容高 - 2`）并接入 `handleScroll`——触底时强制显示底栏并清掉 idle timer，避免停在隐藏/半隐藏状态遮挡内容；window 路径用 `visualViewport?.height ?? innerHeight`。新增 `useAutoHideBottomNav.test.tsx` 覆盖「向下滚到底仍 shown」。

- **涉及文件**：`src/hooks/useAutoHideBottomNav.ts`、`src/components/BottomNav.tsx`、可能 `src/App.tsx` 底部布局/`padding-bottom`。
- **改动要点**：走 `systematic-debugging` 复现。怀疑点：触底回弹时 `translate-y` 隐藏/显示与 `idleShow` 定时器、scroll delta 阈值交互异常；或 `fixed bottom-0` 在触底橡皮筋时视觉上浮；或内容区底部留白不足被固定栏遮挡。确认是 hook 逻辑还是 CSS（safe-area / position fixed）。确保触底时底部栏正常停靠不遮挡，内容区有足够 `padding-bottom`。
- **验收**：各页滑到底部底部栏不遮挡内容；手测覆盖触底场景；`npm test` 通过；如涉及视觉，`npm run test:visual` 更新。

### Task 7 — 花叶蒂改永恒花形态种族值（已完成 · 2026-06-19）

> **现象**：目录里 `floette` 是普通花叶蒂 `54/45/47/75/98/52`，但它只会「破灭之光」（永恒花专属招）且有 Mega——应为**永恒花形态** `74/65/67/125/128/92`。

> 完成记录：`catalog-batch-003.ts` 的 `floette.baseStats` 改为 `74/65/67/125/128/92`，`dataAudit.test.ts` 加防回退断言。复核确认无需改动他处：`mega-floette` 的 HP 已是 74 且为基础值 +100 BST 干净分配（74/85/87/155/148/102），当初即按永恒花基准录入；`pokepasteSource.ts:67` 已映射 `floette → Floette-Eternal`；全站无硬编码基础种族值（速度线/伤害计算均经目录单一数据源查表），故无 speedBenchmarks 需同步。

- **涉及文件**：`src/data/seed/regMA/catalog-batch-003.ts`（`floette.baseStats`）；核对 `src/data/seed/regMA/mega-catalog.ts` 的 `mega-floette` 派生（HP 74 已一致，确认其余合理）；速度线/速度基准若硬编码了花叶蒂速度需一并核（`speedBenchmarks`）；相关测试/快照。
- **改动要点**：改 `baseStats` 为 `{ hp: 74, attack: 65, defense: 67, specialAttack: 125, specialDefense: 128, speed: 92 }`；确认 `notes`/形态描述无矛盾；确认图鉴、速度线、伤害计算引用基础数值处随之正确。
- **验收**：图鉴/速度线/伤害计算显示永恒花种族值；`npm test` 通过；如涉及视觉，更新快照。

### Task 9 — 数据口径页「样本量」方框光标/误点（已完成 · 2026-06-19）

> **现象**：数据口径页**上方单/双打切换按钮和首屏一致，无需处理**；问题在「样本量 xx 只队伍」那个**方框**——切换单/双打时会出现光标，容易诱导用户聚焦、误点（实际该框不可点击）。

> 完成记录：样本池卡片加 `cursor-default select-none`，去掉误导光标/选中态（该框本就是纯 `<div>`、无 `role`/`onClick`/`tabindex`，问题仅在视觉光标）；`EnvironmentPage.test.tsx` 断言无 `role`/`tabindex`、非 button、className 含 `cursor-default`。

- **涉及文件**：数据口径视图对应组件（`src/pages/EnvironmentPage.tsx` 内的数据口径区）。
- **改动要点**：去掉该框的 `tabIndex`/`role="button"`/可聚焦属性与 `cursor`；确保切换单/双打时焦点不落到该框；保持纯展示、不可交互。
- **验收**：切换单/双打该框无光标、不可聚焦/点击；其余交互不受影响；`npm test` 通过；快照更新。

### Task 10 — 伤害计算页进入即重置为空（已完成 · 2026-06-19）

> **现象**：每次进入伤害计算页都残留上次状态或带写死的自带默认配置，用户得先清掉才好操作。

> 完成记录：计算器初始攻防双方改为空白态，不再预填首只/第二只宝可梦与首招；普通从工具页进入会清掉上次 `calculatorMemberId`，离开再重进仍为空。图鉴/队伍的显式带入路径保留：显式选择宝可梦或队伍成员后才生成临时配置并计算。视觉快照更新为新的空白起点。

- **涉及文件**：`src/pages/CalculatorPage.tsx`（初始 state / 进入时重置）；可能 `src/lib/damageAdapter.ts` 的 `buildTemporaryCalcConfig` 默认值。
- **改动要点**：进入页面（mount / tab 激活）时初始化为**空白态**——攻防双方的已选宝可梦、配置、招式全部为空，不携带上次残留、不预填写死默认；用户主动选择后才有内容。若存在「从队伍/速度线显式带入」入口则保留（那是显式动作，不算残留）。
- **验收**：反复进出计算页均为空白起点、无残留无写死默认；显式带入路径仍可用；`npm test` 通过；快照更新。

### Task 11 — 自己添加队伍的成员配置初始化（已完成 · 2026-06-19）

> **现象**：用户手动新建队伍并添加成员时，成员配置（性格/特性/道具/招式/SP/形态）未正确初始化。

> 完成记录：新增 `createDefaultTeamMember` 统一手动成员默认值：原始形态、首个合法特性、无道具、空招式待选、当前规则中性性格、六项 SP 显式为 0、等级 50。TeamPage 手动添加与 DexPage 加入队伍均改走该 helper；schema 迁移缺省成员也复用中性性格与 0 SP 默认，避免旧的「爽朗 + 速度 32」残留。

- **涉及文件**：`src/pages/TeamPage.tsx` 成员添加链路；`src/lib/teamSchema.ts` / 相关 helper；`src/types.ts`。
- **改动要点**：确定并落地合理默认（如 SP 全 0 或合理基线、性格给默认、特性取第一个合法项、道具空、招式空待选、形态取原始形态）；与「导入来的成员」初始化保持一致，避免两条路径产出结构不一的成员。
- **验收**：新建队伍加成员后各配置项有正确默认、可编辑、合法；与导入成员结构一致；`npm test` 通过。

### Task 13 — 队报链接重做 + 双来源统一（Feature · **spike 先行**）

> **现象**：当前「队报」入口从导入弹框（`App.tsx:60`）与环境卡片（`EnvironmentPage.tsx:197`）打开 `sample.reportUrl`。**PokeDB 源常只跳到 X 截图帖**（鸡肋，看不到具体加点）；VGCPastes 源跳 pokepaste。

- **目标**：让「队报」入口跳到**有实际加点数值**的落点；并**统一两来源的入口处理**（避免前端不一致）。
- **spike 先行**：
  1. 调研 PokeDB 是否存在带具体配置/加点数值的页面可作落点（trainer / 構築記事 等），还是只有 X 截图帖。
  2. 确认 VGCPastes 的 pokepaste 是否已足够（pokepaste 本就含完整配置）。
  3. 汇报结论后再定实现。
- **改动要点（待 spike）**：PokeDB 源——有好落点则指向之，无则**弱化/隐藏入口**（而非硬塞鸡肋链接）；VGCPastes 源——指向 pokepaste；**权衡**两来源入口是否统一展示，以及 VGCPastes 批是否需要差异化处理（用户已指出此前可能没考虑这批的落点）。与 Task 3 的导入提醒在同一弹框，注意协调。
- **验收**：入口落点有价值/合理；两来源处理一致，或有明确说明的差异理由；无落点时入口不误导；`npm test` 通过。

### Task 14 — 速度线页面重做 + 超速建议反哺（Feature · 大 · **spike 先行** · 可走 frontend-design）

> **现状**：速度线页面已存在但**入口关闭**（保留为未开放卡片）。本任务重做并规划开放。

- **目标**：
  - **可视化**：保持坐标轴可视化；轴上自带 **PokeDB 参照速度线**（来源 `https://champs.pokedb.tokyo/speed?season=3&rule=1`）。
  - **用户宝可梦入轴**：用户选自己的宝可梦进入坐标轴，调节配置（道具 / 速度 SP / 顺风 等）后**实时看到相对快慢位置**。
  - **反哺（#16 sp加点 的真实含义）**：点轴上任一宝可梦 → 选「**超速他**」→ 系统给出 **SP 分配 / 道具（如围巾）/ 性格 / 顺风** 等建议组合，使用户宝可梦超过该目标。用户已表示难度不小但很「炫技」。
- **spike 先行**：
  1. 调研 PokeDB speed 端点的数据结构、可取性与离线/缓存策略。
  2. 反哺算法可行性：给定目标最终速度，**反解**所需 速度SP/性格/道具/顺风 的组合与边界（复用 `src/lib/calculations.ts` 的速度公式）。
  3. 汇报后再定实现与入口开放策略。
- **改动要点（待 spike）**：参照速度线数据接入；可视化重做；配置调节交互；反哺建议算法；入口开放策略（先原型/灰度 vs 正式开放）。可走 `frontend-design` 定方向。
- **验收**：轴上展示参照线 + 用户宝可梦；调配置实时更新位置；「超速他」给出合理建议；`npm test` 通过；快照更新。

### Task 15 — 浅色主题品牌色重做（Feature · 前端 · frontend-design）

> **出发点**：浅色主题**整体调性/品牌色**不对，需向 Luxray Kit 品牌色对齐（非个别 token 点修）。

- **涉及文件**：`tailwind.config.js` 颜色 token；主题变量 / 全局样式；`src/branding.ts`。
- **改动要点**：走 `frontend-design` 定浅色调色板与品牌色映射；保证对比度/可读性达标；深浅主题切换观感一致。
- **验收**：浅色主题观感统一、对齐品牌、对比度达标；`npm test` + `npm run test:visual`（浅色态快照）通过。

### Task 16 — PokeDB 更新探针 → 条件触发刷新（Infra · **spike 先行** · 替代固定时间 cron）

> **出发点**：当前 cron 固定 `17 18 * * *`（每天 UTC 18:17）刷新 PokeDB 环境。PokeDB 更新时间**不固定**，固定时间易变成 T+1、时效打折。改为「探针检测更新 → 有更新才拉」。

- **spike 先行**：确认 PokeDB 是否暴露真实「最后更新时间」/稳定 `ETag`/`Last-Modified` 等新鲜度信号（决定探针怎么判变化）。
- **改动要点**：
  - cron 改**每小时**；`scheduled` handler 先发**一个廉价的条件请求**到 PokeDB 列表页（`If-None-Match`/`If-Modified-Since`，或对 HTML 更新标记取 hash）。
  - 上次签名（ETag / Last-Modified / 内容 hash）存 KV：**无变化 → 304/空操作，廉价退出**（不分批拉取，轻松压在免费额度内）；**有变化 → 立即跑现有分批刷新**。
  - 现有分批拉取（`POKEDB_DETAIL_CHUNK_SIZE=20` / `limit 60`）逻辑**不动**，仅加门控。
  - **限流礼貌**：单条件请求/小时、真实 User-Agent、尊重 `304`、遇 `429` 退避；确认每小时频率在 Workers 免费 cron 限制内。
- **涉及文件**：`cloudflare/environment-worker/wrangler.jsonc`（`crons`）、`cloudflare/environment-worker/src/index.ts`（`scheduled` 分支 + 探针 + KV 签名）。
- **验收**：数据未变的小时不触发重活；数据变更后及时刷新；不触发对方限流；`npm run worker:app:check` 通过。

## 暂不做

- 完整战斗模拟器 / 用户账号 / 云同步 / 多赛季趋势库（沿用上轮判断）。
- 升级 Workers Paid（免费分批方案已够用）。
- 队伍分析（上轮已下线）。
- 生成/分享图片（上一轮砍掉，暂无需求；若日后要回归再重评落点）。
- ~~引入新数据源~~ —— 本轮已重新评估并接入，见 Task 2（PokePaste 摄入）。
- **Worker cron 自动拉取 VGCPastes**：本轮先做一次性脚本（Task 2）；数据源更新频率与累积量级未知，待量起来、值得自动化再评估上 cron（参考 Task 2 记录的入库队数）。注意 Task 16 的探针仅针对 **PokeDB 环境刷新**，与 VGCPastes 自动化是两件事。
- **终端用户粘贴导入框（形态 A）**：用户在 app 内粘贴 PokePaste/Showdown 导入到自己队伍。本轮只做维护侧自动摄入（Task 2）；A 价值有限（普通用户手里多是无法解析的复制码），推后。
- **Chrome 插件 + computer-use 爬小红书/B站**：payload 是视频/图仍需 OCR/人工、ToS/封号风险、且产出是无成绩证据的编辑推荐——经评估不作数据骨干，至多日后做「手动存当前所看队伍」的便利。
- 游戏内「复制码」反解、Pokémon HOME、游戏内官方 Battle Data 馈源、Pikalytics/Game8 推荐队作整队源——经调研确认为死路（详见 Task 2 调研结论）。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run test:visual        # 涉及 UI 改动
npm run test:pwa           # 涉及 SW / 离线 / 运行时数据加载（Task 8）
npm run worker:app:check   # 涉及 Worker（Task 16）
```

- Task 3：含完整配置的样本显示「可导入：[SP分配][配招]」胶囊+注释、仅基础信息的不显示；卡片含来源标识（PokeDB/VGCPastes）；导入提醒随样本粒度动态、不再写死；快照更新。
- Task 4：上位构筑首屏乱序、非排名序；换一批给出乱序不同批次；切换单/双打重置；样本不丢不重；快照更新。
- Task 5：带码队伍详情页显示「X/6 成员 · {队伍码} [复制]」、无码只显示成员计数、TeamPage 去掉「本地队伍·可自由编辑」；复制写入剪贴板并弹「队伍码已复制 / 分享可能已过期」小长条；快照更新。
- Task 6：各页滑到底部底部栏不遮挡内容。
- Task 7：图鉴/速度线/伤害计算显示永恒花种族值 74/65/67/125/128/92。
- Task 8：反复刷新/重新部署/离线后 VGCPastes 批稳定出现；详细配置字段完整。
- Task 9：数据口径页样本量框切换单/双打无光标、不可聚焦/点击。
- Task 10：反复进出伤害计算页均为空白起点、无残留无写死默认。
- Task 11：新建队伍加成员后配置项默认合理、合法、与导入成员结构一致。
- Task 13：队报入口落点有价值、两来源处理一致或有明确差异理由（spike 后定）。
- Task 14：速度线轴上展示参照线+用户宝可梦、调配置实时更新、「超速他」给出合理建议（spike 后定）。
- Task 15：浅色主题对齐品牌色、对比度达标；浅色态快照更新。
- Task 16：未变更的小时不触发重活、变更后及时刷新、不触发限流。
