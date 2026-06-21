# 下一轮开发计划 / TASKS

更新日期：2026-06-20

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

> 上一轮 Task A–E、G、H 及「上线前联合核验」已全部完成并验证（2026-06-18 核对，`npm test` 239 passed）。Task 1（伤害计算补全新赛季 Mega 物种映射）已完成并验证（2026-06-18，`npm test` 240 passed、`npm run build` passed）。Task 2（一次性脚本摄入 VGCPastes「Champions M-A」构筑）已完成并验证（2026-06-19，经 Claude review 修订：按赛事含金量清洗——仅保留官方线下锦标赛 + 近 30 天窗口，PJCS 取 Top14，最终入库 **99 队**；修正 EV→SP 误除以 8 的 bug；数据改为运行时 fetch（后由 Task 8 改为构建期受管 chunk））。Task F（伤害计算页排版重规划）经确认**保留、暂不做**，见文末。

> **本轮（2026-06-19）新增**：将一批零散需求整理为 Task 3–19。其中**原 Task 12（队伍卡片字段适配）经复核与 Task 3/5 重合，已撤销**（「SP/配招」即 Task 3 胶囊、「队伍码」属 Task 5、「来源标识」并入 Task 3）。**已完成并验证**：Task 3/4/5（卡片来源标签 + 可导入粒度行 + 动态导入提醒 + 队伍码链路）、Task 8（VGCPastes 改构建期受管 chunk，根治整批消失）、Task 6/7/9（底栏触底守卫、永恒花种族值、样本量框去误导光标）、Task 10/11（计算器空白态 + 统一默认成员初始化）、Task 16（PokeDB 更新探针 → 条件触发刷新）、Task 17（底栏自动隐藏流畅度 + 中途停留遮挡）。基础设施：`cloudflare/environment-worker/wrangler.jsonc` 的自定义域名 `routes` 已注释保留（合并部署后停用对外 `luxraykit.com`，Worker 仍经 `*.workers.dev` 提供；详见 `DEVELOPMENT_PROGRESS.md`）。**剩余**：Task 13（队报链接，spike 先行）→ Task 14（速度线重做，spike 先行）→ Task 15（浅色主题）；及 Task 18（粒度胶囊改 icon，接续 Task 3）→ Task 19（队伍一览 + 试试灵感，替代 Task 4「换一批」与主页乱序）。建议先做 18（小改）→ 19（功能）。

## 任务清单

### Task F — 伤害计算页排版重规划（保留 · 暂不做 · 低优先级 · 前端 · 算法不动）

> 上一轮遗留。经确认本轮**保留但暂不做**，待后续排期。算法/计算口径不动，仅重排展示层与信息层级（进攻/防守方卡片、招式区、对战条件、伤害结果的布局与视觉）。可走 `frontend-design` 技能定方向，保持与全站 `text-xs/text-sm` 设计语言一致。

### Task 3 — 构筑样本卡片字段适配：可导入粒度胶囊 + 来源标识 + 导入提醒重写（已完成 · 2026-06-19）

> 完成记录：卡片显示 PokeDB 环境榜 / VGCPastes 锦标赛来源标签，并按 `hasSpread`/`hasMoves`/`replicaCode` 渲染「可导入：[SP分配][配招][队伍码]」粒度行；导入提示改为按当前样本动态说明可带入项与缺失项。额外修正 VGCPastes 样本被旧 PokeDB「赛季 · 名次 · 分数」标题归一化覆盖的问题：赛事样本保留原始标题，展示赛事、名次/组别与分享日期。去掉重复的「可导入」标签，仅保留粒度行。（`npm test` 250 passed、`build`、`test:visual` 通过）

### Task 4 — 上位构筑列表乱序展示 +「换一批」随机（已完成 · 2026-06-19）

> 完成记录：按当前 battleType 样本池生成带种子的乱序列表，浏览内按乱序顺位分批展示；翻到末页换新种子重洗，切换单/双打重置批次与种子。测试覆盖首屏乱序、换批不重复、目标样本翻页可达。**注**：Task 19 将以「固定 4 张最新 + 试试灵感」替代主页乱序与「换一批」，本任务的 seeded shuffle 保留给「试试灵感」。

### Task 5 — 队伍码：写入 → 导入带入 → 队伍详情页展示与复制（已完成 · 2026-06-19）

> 完成记录：`Team.replicaCode` 接入环境样本导入链路并保留在队伍 schema 归一化；队伍详情页成员计数后展示队伍码与复制按钮，无码队伍仅显示成员计数；复制调用 `navigator.clipboard.writeText` 复用顶部 toast，文案「队伍码已复制 / 分享可能已过期」。原「本地队伍 · 可自由编辑」说明已移除（并入需求 #1）。

---

### Task 8 — VGCPastes 批次导入后消失 + 配置映射核验（已完成 · 2026-06-19）

> 完成记录：根因是 VGCPastes 作为 `public/data` 裸 JSON 运行时 fetch，任何 404 / 离线未命中 / SW 错版被 `catch` 静默吞成空数组（表现为「PokeDB 正常但 VGCPastes 整批消失」）。改为 `src/data/external/vgcpastes/*.json` 的 Vite 动态 import（hash chunk），摄入脚本同步写入受管位置，SW 移除 `/data/vgcpastes/*` 预缓存并 bump cache。`npm run data:vgcpastes:champions-ma:check`、`test`、`build`、`test:visual`、`test:pwa` 均通过。

### Task 6 — 底部导航栏滚到底部上浮遮挡内容（已完成 · 2026-06-19）

> 完成记录：`useAutoHideBottomNav.ts` 新增 `isNearScrollEnd`（`scrollTop + 视口高 >= 内容高 - 2`）并接入 `handleScroll`——触底强制显示底栏并清掉 idle timer，避免停在隐藏/半隐藏遮挡内容；window 路径用 `visualViewport?.height ?? innerHeight`。新增用例覆盖「向下滚到底仍 shown」。（后续流畅度/中途停留遮挡见 Task 17）

### Task 7 — 花叶蒂改永恒花形态种族值（已完成 · 2026-06-19）

> 完成记录：`catalog-batch-003.ts` 的 `floette.baseStats` 改为 `74/65/67/125/128/92`，`dataAudit.test.ts` 加防回退断言。复核确认无需改动他处：`mega-floette` HP 已是 74 且为基础值 +100 BST 干净分配，`pokepasteSource.ts:67` 已映射 `floette → Floette-Eternal`，全站无硬编码基础种族值（速度线/伤害计算均查表）。

### Task 9 — 数据口径页「样本量」方框光标/误点（已完成 · 2026-06-19）

> 完成记录：样本池卡片加 `cursor-default select-none`，去掉误导光标/选中态（该框本就是纯 `<div>`、无 `role`/`onClick`/`tabindex`，问题仅在视觉光标）；`EnvironmentPage.test.tsx` 断言无 `role`/`tabindex`、非 button、className 含 `cursor-default`。

### Task 10 — 伤害计算页进入即重置为空（已完成 · 2026-06-19）

> 完成记录：计算器初始攻防双方改为空白态，不预填首只/第二只宝可梦与首招；普通从工具页进入清掉上次 `calculatorMemberId`，离开再重进仍为空。图鉴/队伍的显式带入路径保留（显式选择后才生成临时配置并计算）。视觉快照更新为新空白起点。

### Task 11 — 自己添加队伍的成员配置初始化（已完成 · 2026-06-19）

> 完成记录：新增 `createDefaultTeamMember` 统一手动成员默认值（原始形态、首个合法特性、无道具、空招式、当前规则中性性格、六项 SP 显式为 0、等级 50）。TeamPage 手动添加与 DexPage 加入队伍均改走该 helper；schema 迁移缺省成员复用同款默认，避免旧的「爽朗 + 速度 32」残留。另：修复 Task 4 乱序导致的「导入提醒」用例偶发 flake（改为测试内固定乱序种子，非产品 bug；隔离连跑 8/8、全量 254 passed）。

### Task 13 — 队报链接重做 + 双来源统一（Feature · **spike 先行**）

> **现象**：当前「队报」入口从导入弹框（`App.tsx:60`）与环境卡片（`EnvironmentPage.tsx:197`）打开 `sample.reportUrl`。**PokeDB 源常只跳到 X 截图帖**（鸡肋，看不到具体加点）；VGCPastes 源跳 pokepaste。

- **目标**：让「队报」入口跳到**有实际加点数值**的落点；并**统一两来源的入口处理**（避免前端不一致）。
- **spike 先行**：
  1. 调研 PokeDB 是否存在带具体配置/加点数值的页面可作落点（trainer / 構築記事 等），还是只有 X 截图帖。
  2. 确认 VGCPastes 的 pokepaste 是否已足够（pokepaste 本就含完整配置）。
  3. 汇报结论后再定实现。
- **改动要点（待 spike）**：PokeDB 源——有好落点则指向之，无则**弱化/隐藏入口**（而非硬塞鸡肋链接）；VGCPastes 源——指向 pokepaste；**权衡**两来源入口是否统一展示，以及 VGCPastes 批是否需要差异化处理。与 Task 3 的导入提醒在同一弹框，注意协调。
- **验收**：入口落点有价值/合理；两来源处理一致，或有明确说明的差异理由；无落点时入口不误导；`npm test` 通过。

### Task 14 — 速度线页面重做 + 超速建议反哺（Feature · 大 · 实现规范已定）

> **现状**：速度线页面已存在但**入口关闭**（保留为未开放卡片）。本任务重做并开放。
> **进度**：两个 spike 已完成、可视化原型已在 claude.ai/design 产出并经 Claude review 对齐、关键决策已定。下方为**最终实现规范,严格照做,不要自由发挥**。原型仅供交互手感参考,逻辑以本规范为准。

#### 公式（不要 fork）

Champions Lv.50 速度：`floor((种族速 + SP + 20) × natureMultiplier) [× 修正]`
- SP ∈ [0,32] 整数；nature ∈ {0.9, 1.0, 1.1}；固定 Lv.50；无个体值/努力值概念。
- **复用 `src/lib/calculations.ts` 的 `calculateSpeed`，不要重写一套 IV/EV 公式。** 当前 `calculateSpeed(baseSpeed, statPoints, level, nature, tailwind)` 只支持 tailwind ×2。需扩展支持：
  - `scarf`（讲究围巾）×1.5
  - `speedAbility`（速度特性）×2
  修正按链式逐步 floor，顺序与实机一致：scarf → ability → tailwind。建议改成 options 形参或新增 `calculateSpeedWithModifiers`，保留旧签名兼容现有调用。
- SP→stat 复用 `clampStatPointValue`（`src/lib/statPoints.ts`，上限 32）。

#### 参照档位数据（静态快照，不走 worker）

参照速度线数值死、随规则才变，不需要自动抓。做一个**一次性脚本**抓 PokeDB 速度表生成静态 TS 数据文件：
- 源：`https://champs.pokedb.tokyo/speed?season=<N>&rule=0`（单打）/ `rule=1`（双打），SSR HTML 表格，用正则抓（参考 `src/lib/pokedbEnvironment.ts` 的抓取手法）。列含 実数値 / ポケモン / 修正标签。
- 产物：`{ rule: 0|1, tiers: { speed, label, count, code, color }[] }`，**按 speed 降序**。
- 参照档是**不可变快照**；全局条件不影响参照点（参照点已 bake 好条件），只影响用户自己那只。规则变动/新宝可梦进环境后，手动重跑脚本刷新即可。

#### 档位标签：抓 PokeDB（日语）→ 显示中文友好词（强制映射）

PokeDB 速度表的修正档用日语原词（最速/準速/無振/最遅），对中文用户不友好。抓取时按下表**映射成中文标签再存入静态数据 / 渲染**，纵轴档位描述严格用右侧中文词：

| PokeDB 原词 | 含义                  | 显示标签（用这个） |
|------------|-----------------------|------------------|
| 最速       | 满 SP + 加速性格 ×1.1 | **极速**         |
| 準速       | 满 SP + 无修正 ×1.0   | **满速**         |
| 無振       | 0 SP + 无修正         | **0速**          |
| 最遅       | 0 SP + 减速性格 ×0.9  | **极限0速**      |

- 纵轴档位文案形如 `极速110族` / `满速100族` / `0速80族` / `极限0速…`，**不要出现 最速/準速/無振/最遅**。
- 反哺弹窗里 SP/性格那一档的措辞同样用「极速 / 满速」（×1.1 = 极速，×1.0 = 满速），保持全页一致。

#### SP / 性格的输入方式（原型已定，照做）

- **不做「最速/準速/無振/最遅」四个预设快捷按钮**。用户用 **SP 滑条**调速度点数。
- 性格保留 加速 / 减速 两个 toggle（×1.1 / ×0.9，互斥，默认无修正 ×1.0）。
- 道具（讲究围巾）、顺风、速度特性各自 toggle。

#### 实时围巾携带率门控（关键）

环境页有 top60 宝可梦携带物数据，且会自动刷新（`environment.pokemonUsage[battleType][].itemStats`，`{id, usageRate}`，由 Task 16 探针维护）。反哺建议里的「加围巾」那一档：
- 新增 selector `getScarfUsageRate(environment, pokemonId, battleType)`（讲究围巾 id 见 `src/data/seed/regMA/catalog.ts` 的 `choice-scarf`）。
- **仅当该宝可梦围巾携带率 ≥ 15%** 才放出围巾建议 rung；否则该 rung 不出现（自然实现「某些宝可梦不适合带围巾」）。
- 因此必须把 `EnvironmentState` 透传进 SpeedPage（目前没有）。从 `App.tsx` 的 `environmentState` 传下去。

#### 速度特性 ×2 模型

不要做成裸 toggle。由成员的 `abilityId`（`TeamMember.abilityId`，`Pokemon.abilities`）自动识别：
- ×2 速度特性：急流游泳（雨）、叶绿素（晴）、拨雪（雪）、沙场推进（沙）、轻装（unburden，**与天气无关**）。
- 天气类需给「需对应天气」提示；轻装单独标注。
- **不做驱劲能量 / Booster Energy**（不在当前环境）。
- 没有速度特性的宝可梦，该档不出现。

#### 反哺「超速他」弹窗（点任一参照档触发）

对目标档位 `target` 计算超速方案，ladder 优先级：
1. 仅靠 SP / 性格（不占道具、不靠队友）
2. 加 讲究围巾（受 15% 门控）
3. 触发 速度特性（若该宝可梦有）
4. 讲究围巾 + 顺风（需队友顺风）
5. 全部手段叠满

每条算最终速度，过滤出 `final > target` 的可行档。状态：
- `already`：当前配置已超 → 显示富余 gap，不给建议。
- `infeasible`：全叠也超不过 → 显示「最高只能到 bestFinal」。
- 否则给 `primary` + `safer`：
  - **primary =「够超目标的最小充分 SP」投入**（锚定当前 build 增量；反解用暴力枚举 SP 0→32 找最小满足值）。
  - **safer = 满速/极速兜底**（更大富余，margin 比 primary 多 ≥3 才单列）。
  - 每条列出相对当前配置的 deltas（如「SP 加到 12」「装备讲究围巾」「展开顺风」），并给「应用此方案」按钮回写到用户那只。

#### 可视化（纵轴 + marker 随真实位置 + 内部独立滚动）

> **重要：marker 不要钉在窗口中心。** 原型把 marker 固定在中心、让轴在其下滚动——这会让「滚动浏览」与「配置变化」在视觉上无法区分，用户滚一下会误以为自己那只的速度变了。**marker 必须是纵轴上的一个真实位置**（随最终速度落在轴上某点，与参照档同坐标系），跟着轴一起滚动。

- 纵向速度轴，**上=快 下=慢**。轴在**页面内一个独立窗口**（约 60vh）内滚动，不是整页滚动。
- **marker = 轴内绝对定位元素**，其 y 由自身最终速度决定（`yOf(final)`，与参照档同一 `yOf`），随轴滚动而移动；用户可自由上下滚轴浏览，**marker 不动则速度未变**。
- **配置变化才自动滚动**：用户改自己那只的配置（拖 SP / 切性格 / 切道具·特性 / 应用「超速他」方案）→ marker 在轴上换到新位置，并**自动平滑滚动窗口使 marker 回到视野中心**。这是唯一会触发自动滚动的来源。
- **「跳回我那只」指示**：当用户手动滚轴、marker 滚出视野时，轴**右侧**显示一个方向指示光标（marker 在上方→顶部朝上箭头，在下方→底部朝下箭头），点击平滑滚回 marker 所在位置。marker 在视野内时该指示隐藏。
- 动效分流：
  - 离散操作（切单/双打、选宝可梦、切性格、切道具/特性、应用方案）→ marker 换位 + **平滑滚动**回中。
  - 拖 SP 滑条 → marker **实时即时**沿轴移动，轴**即时跟随**保持 marker 在视野（无动画）。
  - 尊重 `prefers-reduced-motion`（关掉平滑、直接定位）。
- 档位显示相对快慢图标（▲ 比我快 / ▼ 比我慢 / = 持平），远距离档位淡化。
- marker 副标题：`性格(加速/无修正/减速) · SP{n} · 围巾? · 顺风?`。

#### 入口与杂项

- 打开 `src/pages/ToolsPage.tsx` 的「速度线计算」入口（移除 `disabled` / 「未开放」/ 「敬请期待」）。
- 宝可梦搜索：按中文名 / 英文名 / 种族速过滤。
- 可访问性：SP 滑条加 aria + 键盘支持；每个参照档是 button，带 aria-label（沿用项目里 `可导入 ${label}` 那种模式，如 `超速 ${label}`）。

#### 测试

- `calculateSpeed` 扩展后的单测（scarf / ability / tailwind 叠加 + 逐步 floor 边界）。
- 反解 selector：最小充分 SP、already / infeasible 分支、15% 门控开关。
- `getScarfUsageRate` selector 单测。
- 速度页交互测试 + 一张视觉快照。
- 跑 `npm test`、`npm run build`、`npm run test:visual` 全绿。

- **验收**：入口可进；纵轴中心 marker + 内部滚动 + 动效分流符合上述；点档位出「超速他」弹窗，primary 给最小 SP、safer 给满速，围巾建议受 15% 门控；标签为 极速/满速/0速/极限0速，复用 `calculations.ts` 无重复公式；`npm test` 通过、快照更新。

#### Task 14.1 — 参照档位补真实宝可梦头像 + 名（已完成 · 2026-06-21 · Claude 落地并端到端验证）

> 完成记录：解析器抽每个 chip 的 `{dexNo, form, japaneseName}`，`speedTiers.ts` 重生成带 `pokemon`；`speedTier.ts` 加 `resolveTierPokemon`（按 japaneseName + **NFKC 折叠全角→半角**精确命中 mega 形态，dexNo 基础形态兜底，未命中显日文名不崩）、`groupTiersBySpeed`（**同速多 variant 不坍缩**）、`markerInsertIndex`；抽共享 `OverlappingAvatars` 组件，DexPage 与速度页共用。**轴改为 PokeDB 式等距排列（不再按数值比例拉伸），marker 独占一行不再遮挡相邻档**；单只档行内显名、多只档头像簇 +N；点档位弹窗按 variant 分组（头像默认、▸名单展开双列名卡）。Chrome DevTools 实测：超级雷丘X（全角Ｘ）/超级姆克鹰/超级火炎狮等 mega 精确命中图标与中文名；178 同时展示极速110族(9只)+满速126族(2只)。`npm test` 271 passed、`npm run build`、`npm run test:visual`（速度线快照已更新）全绿。`design-qa.md` 已加入 .gitignore。

> **问题**：Task 14 落地后参照轴每档只有文字（如「极速81族 S+1 · 2只」），用户不知道这 2 只是谁。根因是抓取脚本只数了 `<a class="speed-chip">` 的**个数**，把每个 chip 的宝可梦身份丢了。PokeDB 原页正是靠头像表达的。**必须给参照档补真实头像 + 名**（图片资产项目已有）。

- **chip 真实结构（已扒，2026-06-21）**：解析的每个 `<a class="speed-chip" href="/pokemon/show/0903-00?...">` 含：①`href` 里 `0903-00` = **全国图鉴号(0903)+形态(00)**（最稳主键，语言无关含形态）；②`<i class="... dex-0903-00-96">` 同码冗余；③`<div class="speed-chip__name">オオニューラ</div>` 日文名（兜底键）；④`<div class="speed-chip__note">かるわざ</div>` 特性（可选，不用于身份）。
- **资产映射（零障碍）**：`Pokemon` 已有 `nationalDexNo`、`japaneseName`、`iconRef`（`iconRef: artwork(dexNo)` 按图鉴号）。映射 **`dexNo → pokemonId`**（`new Map(pokemon.map(p => [p.nationalDexNo, p.id]))`），`japaneseName` 兜底；渲染用匹配到的 `iconRef` 出头像、`chineseName` 出名。
- **数据层改动**：
  - 解析器（`scripts/pokedb-speed-tier-utils.mjs`）对每组 chip **逐个**提取图鉴码（正则 `/pokemon\/show\/(\d{4})-(\d{2})/`）与日文名，产出每档 `pokemon: Array<{ dexNo: number; form: string; japaneseName: string }>`（保留原始信息，**不在 .mjs 里做 id 映射**，避免脚本依赖 TS catalog）；`count` 改为 `pokemon.length` 派生。
  - `SpeedTierSnapshot.tiers[]` 类型加 `pokemon`。
  - **id 映射放 TS 侧**：在 `speedTier.ts`（或 SpeedPage 内）用 `nationalDexNo`→id 映射把 `pokemon` 解析成 `{ id, chineseName, iconRef }[]`，未命中走 `japaneseName` 兜底；**生成脚本里 console.warn 未命中的图鉴码**，方便后续补 catalog。
  - **同一速度实数下不同「族速×性格」档不可坍缩**：当前 `groupTiersBySpeed` 把同速档塌成「极速110族 等 2 档」，抹掉了信息——实数 178 同时是 **极速110族**（floor((110+52)×1.1)=178）和 **满速126族**（126+52=178），PokeDB 是两个并列 chip-group 都展示。改为按速度聚成 `variants: Array<{ label, code, color, pokemon[] }>`，**每个 variant 单独展示、不合并**；同 variant 内（同一 speed 数据里本就分开的条目）pokemon 列表并起来按 id 去重。
- **复用既有视觉语言（关键）**：图鉴「特性查询」页已用「微重叠头像簇 + 预览上限 + +N + 展开双列名卡」表达"该特性的宝可梦"（`DexPage.tsx:872-912`，`-space-x-2` 重叠 `PokemonAvatar size="xs"`，`ABILITY_OWNER_PREVIEW_LIMIT=5`，展开为 `grid-cols-2` 的 `[头像+中文名]` 可点胶囊）。**把这套抽成共享组件**（如 `OverlappingAvatars` / `AvatarClusterWithRoster`），DexPage 与速度页共用，避免两套发散。映射关系：特性页"每个特性一行" ↔ 速度弹窗"每个 variant 一行"。
- **UI 排版（复用上述组件）**：
  - **纵轴行**：用重叠头像簇（同 `-space-x-2` 语言），**封顶 3** + 「+N」（行高小、要和速度数字/标签/▲▼= 抢横向）。单只档可直接头像 + 中文名。多 variant 速度：轴上合并展示头像簇（点开看分组），dot 颜色取首个 variant。
  - **超速弹窗（空间更大，平铺不重叠或重叠均可，上限放大）**：按 variant 分组，每组一行「`极速110族 · 9只` + 头像簇（**预览上限 ≈ 10–12**）+ +N + ▸展开」；**默认只展示头像、不铺名字**；点「▸展开/名单」→ `grid-cols-2` 的 `[头像 + 中文名]` 卡（可点跳该宝可梦详情）。下方接现有「超速方案」。一个弹窗同时回答「这档有谁（含所有 variant）」+「怎么超」，默认轻、名字按需。
  - marker 仍用用户自己那只的头像（已实现，不动）。
  - 未能映射到资产的 chip：降级显示占位头像 + 日文名，不阻塞渲染。
- **a11y**：档位 button 的 `aria-label` 纳入代表宝可梦名 + 只数（如「超速 极速100族，9 只，含喷火龙 等」）；头像 `alt` 用中文名。
- **测试**：解析器提取图鉴码/日文名；`dexNo→id` 映射含未命中兜底；`groupTiersBySpeed` **保留多 variant 不坍缩** + 同 variant 去重；共享头像簇组件预览上限/+N/展开；弹窗按 variant 分组渲染、展开出名卡。
- **验收**：参照轴每档显示真实头像（单只带名/多只头像簇+N）；**同速多档（如 178 极速110族 + 满速126族）两个 variant 都可见**；点档位弹窗按 variant 分组、默认头像、展开见全名单（双列名卡）；映射未命中不崩、有降级；`npm test`、`npm run data:pokedb:speed:check`、`npm run test:visual` 通过、快照更新。

### Task 15 — 浅色主题品牌色重做（Feature · 前端 · frontend-design）

> **出发点**：浅色主题**整体调性/品牌色**不对，需向 Luxray Kit 品牌色对齐（非个别 token 点修）。

- **涉及文件**：`tailwind.config.js` 颜色 token；主题变量 / 全局样式；`src/branding.ts`。
- **改动要点**：走 `frontend-design` 定浅色调色板与品牌色映射；保证对比度/可读性达标；深浅主题切换观感一致。
- **验收**：浅色主题观感统一、对齐品牌、对比度达标；`npm test` + `npm run test:visual`（浅色态快照）通过。

### Task 16 — PokeDB 更新探针 → 条件触发刷新（已完成 · 2026-06-20）

> 完成记录：cron 由固定 `17 18 * * *` 改为每小时 `17 * * * *`，`scheduled` 入口改走 `startScheduledRefresh`——先用一个廉价 list 页探针提取 `season` + `更新日` 生成 SHA-256 签名存 KV；签名未变且已有快照 → `unchanged` 廉价退出，不触发分批重拉；有变化才进现有 cursor refresh（既有分批逻辑不动，仅加门控）。live spike 确认 PokeDB list 当前无 ETag/Last-Modified，故以「season + 更新日」内容签名为准（保留 `If-None-Match`/`If-Modified-Since` 条件请求作前瞻兼容，304 复用旧签名）。有任务在飞时直接续跑既有 job 不抢；首跑无 previousProbe 时回退用 status 派生签名，且确认探针与解析器 `pokedbEnvironment.ts` 的时间戳归一化格式一致（`YYYY-MM-DD HH:MM:SS`），部署后第一跑不会无谓多拉；失败 `recordRefreshFailure` 后抛出。`npm test` 258 passed、`npm run build`、`npm run worker:environment:check` 均通过。

### Task 17 — 底部 Tab 自动隐藏流畅度 + 中途停留定位遮挡（已完成 · 2026-06-20 · 接续 Task 6）

> 完成记录：`useAutoHideBottomNav` 把滚动处理改为 RAF 合并 + `hiddenRef` 去重，消除每个 scroll 事件的多余 setState 抖动（流畅度）；`BottomNav` 用 `visualViewport` 维护 `--lk-bottom-nav-offset`，显示态贴视觉视口底、隐藏态把 offset 一并移出视口，`.safe-bottom` 同步补足内容底部留白（解决中途停留时上浮一小段、遮挡内容）。新增「中段滚动停下后回显」用例。`npm test` 258 passed、`npm run build`、`npm run worker:environment:check` 均通过。

### Task 18 — 可导入粒度胶囊改 icon 样式（UI polish · 前端 · 接续 Task 3）

> **现象**：Task 3 落地的可导入粒度行目前是**纯文本 + 方括号**「可导入：[SP分配][配招][队伍码]」——当时用 `[]` 只是方便打字，实际应做成**带 icon 的胶囊**样式，当前太简陋。

- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`TeamSampleCard`，`importChips` 渲染，约 `:273`）；测试 `src/App.test.tsx` / `src/pages/EnvironmentPage.test.tsx`（依赖 `可导入：[...]` 文本的断言需随之改）。
- **改动要点**：把 `[SP分配][配招][队伍码]` 文本行改为**胶囊标签组**——每项一个小 pill（圆角 + 轻底色/描边 + 对应 lucide icon），与卡片「来源标签」「可导入」pill 视觉语言一致；仅命中项出现。注意把测试里 `可导入：[...]` 文本定位改为按 pill 文案 / `aria-label`。
- **验收**：粒度以 icon 胶囊呈现、与卡片其余标签风格统一；命中项才显示；`npm test` 通过；`npm run test:visual` 更新环境页 / 队伍一览快照。

### Task 19 — 队伍一览页 + 「试试灵感」随机弹窗（Feature · 前端 · 替代 Task 4「换一批」）

> **出发点**：当前没有队伍一览页，用户找特定队伍只能走 环境页 → 选宝可梦 → 详细数据页 → 下拉「相关上位构筑」，太繁琐。

- **目标**：
  - **保留**现有「相关上位构筑」这条路径不动。
  - **新增「队伍一览」页**：入口放在原**「换一批」按钮位置**，按钮样式同「宝可梦榜 · 查看全部」（`EnvironmentPage.tsx:824-827`）。**移除原「换一批」**。
  - **主页「上位构筑」区**：去掉乱序，改为**固定展示 4 张「更新日期最新」的队伍卡片**（按日期降序取前 4）+「查看全部」入口。
  - **队伍一览页能力**：
    - **区分单/双打**（沿用 `battleType`）。
    - **筛选**：① 是否**含队伍码**；② **队伍类别 = 赛事 / 排位高分**（映射来源：VGCPastes 锦标赛 → 赛事，PokeDB 环境榜 → 排位高分）。**不做「含特定宝可梦」筛选**——靠搜索覆盖。
    - **排序**：**时间由最新到最旧**（独立排序选项）。
    - **搜索**：按**宝可梦名或队伍名**命中队伍。
  - **「试试灵感」按钮**（位于队伍一览页内）：点击 → 弹出**居中的队伍卡片弹窗**（随机抽一支，**复用 Task 4 的 seeded shuffle**），弹窗卡片样式与列表 `TeamSampleCard` **统一**；可点「导入配置」（带关闭），也可点卡片下方「导入配置」按钮**直接跳队伍页面**。
- **导航方案（已定：EnvironmentPage 内 view 切换 + 抽独立子组件）**：作为 `EnvironmentPage` 的第 4 个 `view`（`'home' | 'ranking' | 'methodology'` → 加 `'teams'`），与「完整宝可梦榜」（`view:'ranking'`）**对称**——入口、返回、`battleType`/environment 数据/导入链路天然共享，零额外接线，符合本 app「tab + view state」既有范式（**无 react-router**）。为避免 `EnvironmentPage.tsx` 膨胀，把队伍一览**抽成独立子组件文件**（如 `TeamBrowseView`），`view==='teams'` 时渲染。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（移除换一批、主页改 top-4 最新、加查看全部入口、加 `'teams'` view）；新建 `TeamBrowseView` 子组件；`TeamSampleCard` 复用（列表 + 弹窗）；导入跳转复用 `App.tsx` 的 `onImportSample`；测试。
- **关系 / 复用**：**替代 Task 4** 的「换一批」与主页乱序（seeded shuffle 仅保留给「试试灵感」）；卡片粒度胶囊用 **Task 18** 的 icon 样式；队报入口受 **Task 13** 影响。
- **实现细节待核**：主页「最新 4 张」的日期字段——VGCPastes 有 `dateShared`，PokeDB 样本可能无日期，需定降级排序键（如无日期者按 rank 视为较旧）。
- **验收**：环境页「换一批」改为「查看全部」入口、原换一批移除、主页固定 4 张最新卡片；队伍一览区分单/双打、可按「含队伍码」「赛事/排位高分」筛选、可按时间最新→最旧排序、可搜索宝可梦/队伍名；「试试灵感」弹居中卡片弹窗、可关闭/可导入/可跳队伍页；`npm test` 通过；`npm run test:visual` 更新。

## 暂不做

- 完整战斗模拟器 / 用户账号 / 云同步 / 多赛季趋势库（沿用上轮判断）。
- 升级 Workers Paid（免费分批方案已够用）。
- 队伍分析（上轮已下线）。
- 生成/分享图片（上一轮砍掉，暂无需求；若日后要回归再重评落点）。
- ~~引入新数据源~~ —— 本轮已重新评估并接入，见 Task 2（PokePaste 摄入）。
- **Worker cron 自动拉取 VGCPastes**：本轮先做一次性脚本（Task 2）；数据源更新频率与累积量级未知，待量起来、值得自动化再评估上 cron。注意 Task 16 的探针仅针对 **PokeDB 环境刷新**，与 VGCPastes 自动化是两件事。
- **终端用户粘贴导入框（形态 A）**：用户在 app 内粘贴 PokePaste/Showdown 导入到自己队伍。本轮只做维护侧自动摄入（Task 2）；A 价值有限，推后。
- **Chrome 插件 + computer-use 爬小红书/B站**：payload 是视频/图仍需 OCR/人工、ToS/封号风险、且产出无成绩证据——经评估不作数据骨干。
- 游戏内「复制码」反解、Pokémon HOME、游戏内官方 Battle Data 馈源、Pikalytics/Game8 推荐队作整队源——经调研确认为死路（详见 Task 2 调研结论）。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run test:visual            # 涉及 UI 改动
npm run test:pwa               # 涉及 SW / 离线 / 运行时数据加载
npm run worker:environment:check  # 涉及 Worker
```

剩余任务验收要点：

- Task 13：队报入口落点有价值、两来源处理一致或有明确差异理由（spike 后定）。
- Task 14：纵轴中心 marker + 内部独立滚动 + 动效分流；参照档标签为 极速/满速/0速/极限0速；「超速他」primary 给最小充分 SP、safer 给满速，围巾建议受 15% 携带率门控；复用 `calculations.ts` 无重复公式。
- Task 15：浅色主题对齐品牌色、对比度达标；浅色态快照更新。
- Task 18：可导入粒度以 icon 胶囊呈现、与卡片其余标签风格统一、仅命中项显示。
- Task 19：环境页「换一批」改为「查看全部」入口、原换一批移除、主页固定 4 张最新卡片；队伍一览区分单/双打、可按「含队伍码」「赛事/排位高分」筛选、按时间最新→最旧排序、可搜索宝可梦/队伍名；「试试灵感」居中队伍卡片弹窗可关闭/可导入/可跳队伍页。
