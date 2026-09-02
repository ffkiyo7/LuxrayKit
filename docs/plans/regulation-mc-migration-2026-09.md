# Regulation Set M-C 接入计划 · 2026-09

> **状态：待实施计划，不是现状描述**（文档分级见 `docs/DEVELOPER_GUIDE.md` §10）。
> 建立日期：2026-09-01 · 起因：M-C 将于 2026-09-09 02:00 UTC 开赛，现有代码把「当前规则」与「历史时间轴」耦合在同一个常量上。
> 输入：Codex 的接入 spike 结论 + 本文档作者在本地逐条核对的结果（§0）。
> 执行者：Codex。**本文不含实现代码**，只给顺序、边界、允许改动的文件和验收判据。
>
> **进度（2026-09-02）**：阶段 A（Task 1–6）**已合并上线**——PR #59（https://github.com/ffkiyo7/LuxrayKit/pull/59），merge commit `9101dca`，6 个 commit（`fb07d7a` T1 · `6692def` T2 · `27b12e9` T4 · `cc0a035` T5 · `4760b8b` T6 · `677e06b` T3）。CI 三项全过，含 `visual` 门禁一次通过、基线未重建。`npm test` 362 通过、`npm run build` 通过。与本文的三处已接受偏离：
> - T2：`environmentDatasetSeed.ts` 的 2 条开发样例（无 season 无 regulation）从 M-A 变为未分类；335 条真实 VGCPastes 样本分类零变化（M-A 文件 99 条改为加载时按来源文件显式打标签）。
> - T3：未做完整网络重跑（单页抓取约 17 秒、总计 70 分钟以上，且 learnset 半边注定丢弃）。`makesContact` 由与新脚本同一函数的一次性后处理写入，545 条已逐条与 dex 复核一致；翻转 122 条（119 F→T、3 T→F：`aura-wheel` / `bone-rush` / `icicle-crash`）。脚本本身的端到端重跑留到阶段 B Task 8 一并验证。
> - T6：额外改了 `index.html` 的 meta description（与 manifest 同一处硬编码）。
>
> 阶段 B 仍受 §1 门禁约束。`dataAudit.test.ts` 写死的 Mega 总数 75 会在 Task 8 加数据时变红，属预期，届时按实际数量更新。

---

## 0. 对 spike 结论的核对

### 0.1 已核实成立，可直接照做

| spike 结论 | 核实位置 |
| --- | --- |
| 历史规则窗口引用 `currentRuleSet`，改元数据会连历史一起改坏 | `src/data/schedule.ts:46`、`:51-52`、`:65`、`:80` |
| `RegulationId` 只支持两个值 | `src/lib/environmentDataset.ts:51` |
| `reg-mb ? M-B : M-A` 两分支推导 | `src/data/environment.ts:40` |
| 队伍库筛选按钮只有 M-A / M-B | `src/pages/TeamBrowseView.tsx:43-47` |
| 未知赛季静默归为 M-A | `src/pages/environmentTeamSamples.ts:13` |
| catalog 生成器批次写死为 5（batch 006 已存在） | `scripts/generate-catalog-batch.mjs:9-10` |
| 特性生成器只扫到 `catalog-batch-005` | `scripts/generate-ability-effects.mjs:12-16` |
| manifest 文案停在 Season M-3 | `public/manifest.webmanifest` |
| 静态环境兜底停在 M-4 | `public/data/pokedb/reg-ma-environment.json` |
| 接触标记来自招式 id 子串猜测 | `scripts/generate-champions-moves.mjs:60-`（`CONTACT_HINTS`）、`:198-201`（`inferMakesContact`）；写入点有**两处**：`:292`（正常路径）与 `:306`（PokeAPI 请求失败的回退分支） |
| 近身战 / 十万马力 / 吸取之吻被标成非接触 | `move-catalog.ts:1252`、`:3627`、`:1985`（另外「圣剑」`:6320` 同样错） |
| 新实体确实全缺 | `rillaboom` / `baxcalibur` / `grassy-surge` / `thermal-exchange` / `aura-guard` / `drum-beating` / `glaive-rush` 在 seed 中零命中；`sharpness` / `levitate` / `absol` / `lucario` / `garchomp` 已存在可复用 |

### 0.2 需要改口径的七条（**执行时以本节为准，不要按 spike 原文**）

1. **日期以官方为准，且赛季表暂时不需要新增条目。**
   - M-B 结束：`2026-09-09T01:59:00.000Z`（`metadata.ts:11` 现写 `09-02`，是错的）。
   - M-C：`2026-09-09T02:00:00.000Z` → `2026-12-02T01:59:00.000Z`。
   - 官方 Season M-5 的结束时间**也是** `2026-09-09T01:59:00.000Z`，即赛季与规则边界重合。所以**不需要**为了 M-C 猜一个下一赛季；只需把 M-5 的 `endAt` 从「跟随 `currentRuleSet.endAt`」改成字面量。下一赛季编号未公布，公告出来前不许写进表里。
   - 以上三个时间已于 2026-09-02 对 §5 的三个官方页面逐条复核（M-C 公告、M-B 延期公告、Season M-5 公告），可直接使用。

2. **`makesContact` 目前没有任何消费方。**
   全仓库只出现在 `src/types.ts:159` 和 `move-catalog.ts`，计算器和 UI 都没读它。所以今天**不存在**「计算器静默给错结果」这个线上问题——修正接触标记是 Aura Guard 的**前置依赖**，不是既有 bug 修复。任务仍然要做（Task 3），但不要按「线上事故」定级、也不要在 PR 描述里这么写。

3. **接触标记有现成的权威来源，就在已装依赖里。**
   `@smogon/calc@0.11.0` 的 Gen 9 dex 暴露 `flags.contact`，已验证：近身战 / 十万马力 / 吸取之吻 / 圣剑 = 接触，地震 / 喷射火焰 = 非接触，且**已经覆盖尚未入库的 Glaive Rush（接触）与 Drum Beating（非接触）**。不要另找数据源、不要继续用名称启发式。
   两个接口细节（本地已踩过）：`Generations.get(9).moves.get()` 只认 ID 形式（`closecombat`，可用导出的 `toID()` 转换；传 `'Close Combat'` 返回 `undefined`）；`flags.contact` 命中时是 `1`、非接触时**字段不存在**，按 truthy 判断，不要 `=== true`。本地 `move-catalog.ts` 的 id 是 kebab-case（`close-combat`），转换时去掉连字符即可，但仍要对「查不到」显式报错（见 Task 3）。

4. **allowlist 脚本不是「硬编码」，是「运行即破坏」。**
   `scripts/generate-regma-allowlist.mjs` 全量重写 `allowlist.ts`，来源是 M-A 时代的 213 行 payload（官方 web-view 端点至今仍返回这 213 行，所以脚本会「跑成功」），且 `catalogPokemonIdsByEnglishName` 只有 6 条映射。现有 `allowlist.ts` 是 **235 条**记录（213 条 `reg-ma-` + 22 条**手工追加**的 `reg-mb-`；文件 2183 行），其中只有 28 条带 `pokemonId`：6 条 `reg-ma-`（正是脚本映射表那 6 个）+ 全部 22 条 `reg-mb-`。**今天跑一次这个脚本会：删掉 22 条 M-B 行、把 `regMaPokemonAllowlistExpectedCount` 从 235 打回 213、把文件头的 `officialEligiblePokemonRefs` 从 `reg-mb-official-eligible-pokemon` 改回 `reg-ma-official-eligible-pokemon`。** 因此 M-C 照 M-B 的先例手工追加 `reg-mc-` 行，脚本按 Task 5 隔离，不要改造它去生成 M-C。

5. **Mega 合并是对象展开，M-C 会踩到覆盖。**（spike 未指出，本次最容易静默出错的点）
   `catalog.ts:23`/`:27` 用对象展开合并 `megaFormsByParentId` 与 `mbMegaFormsByParentId`，键是父级 `pokemonId`、值是 `PokemonForm[]`。M-B 之所以安全，是因为两张表的父级**零交集**（已核对）。但 M-C 的三个 Z Mega 父级 `absol` / `garchomp` / `lucario` **已经在 M-A 表里**（`mega-catalog.ts:554`、`:608`、`:626`）。新建一张 M-C 表直接展开，会整键覆盖、**静默吃掉普通 Mega 阿勃梭鲁 / 烈咬陆鲨 / 路卡利欧**，而且类型检查和现有单测都不会报。必须先做 Task 4。

6. **身高体重按本体补，Z Mega 不需要。**
   `physicalMetrics.ts:5` 按 `nationalDexNo` 键，Z Mega 与本体同号；`DexPage.tsx:460` 也是按本体 dex 号取。所以**每新增一只基础宝可梦补一条**，Z Mega 一条都不用补（它需要的是**立绘**，不是身高体重）。
   ⚠️ 已公布的轰擂金刚猩（#812）、戟脊龙（#998）**不是最终数量**：官方原文是「更多宝可梦可用」+「完整细节稍后公布」，实际新增名单大概率更长。本文所有「2 只」的表述一律读作**当前已确认的下限**，排期与工作量估算不要按 2 来算。

7. **VGCPastes 摄入不属于「脚本硬编码」问题。**
   `scripts/ingest-vgcpastes-champions.mjs:94-119` 已经是 per-regulation 配置表，加 M-C 只是加一条配置 + 新 sheet gid。且 M-C 开赛初期没有成熟样本。本轮不做（见 §3）。

---

## 1. 执行顺序与门禁

- **阶段 A（Task 1–6）：现在就做，不依赖官方完整清单。** 全部是结构性修正，理想情况下**对线上行为零影响**（Task 6 的文案除外）。可以拆成多个 PR，也可以合成一个，但顺序不能乱：Task 4 必须早于 Task 8，Task 3 必须早于 Task 10。
- **⛔ 门禁：官方 M-C 完整规则清单公布。** 阶段 B（Task 7–10）在此之前**不得开工落数据**。PokéBase 今天已放出这 5 个条目的预备数据，可用于先行验证结构，但**不得**作为最终合法池；预告片里的 Mega 戟脊龙、Heatran 等一律不算 M-C 已确认内容。
- **阶段 B 的规模现在估不出来。** 官方只点名了 2 只新宝可梦 + 3 个 Z Mega，但同一份公告写了「更多宝可梦可用」和「完整细节稍后公布」，最终名单可能是几十只。因此：阶段 A 的排期可以现在定，**阶段 B 的工作量必须等清单公布后重估**，不要按 5 个条目承诺工期。
- 阶段 B 落地后必须做一次**全量差分**（清单 vs 本地 catalog），不能只增不核。

---

## 阶段 A

### Task 1 — 冻结规则与赛季时间轴（不引入 M-C）

**目标**：把历史窗口从 `currentRuleSet` 上解耦，并订正 M-B 的结束时间。做完之后，「切换当前规则」不再是一个会改坏历史的操作。

**允许改动**
- `src/data/schedule.ts`
- `src/data/schedule.test.ts`
- `src/data/seed/regMA/metadata.ts`（**只改 `endAt` 一个字段**：`2026-09-02T01:59:00.000Z` → `2026-09-09T01:59:00.000Z`；`id` / `name` / `dataVersionId` 本任务一律不动）

**要求**
- `regulationSchedule` 中 M-A 的 `endAt`、M-B 的 `startAt` / `endAt` 全部改为字面量常量，不再引用 `currentRuleSet`。
- `seasonSchedule` 中 M-3 的 `startAt`、M-5 的 `endAt` 同样改为字面量。M-5 的 `endAt` 用 `2026-09-09T01:59:00.000Z`，并在注释里写明这是官方 Season M-5 公告值，与规则边界重合属于巧合，**不是**推导关系。
- 补 `sourceUrl`：M-B 延期公告（见 §5）挂到 `regulationSchedule` 的 M-B 条目、Season M-5 公告挂到 `seasonSchedule` 的 M-5 条目，保持可追溯。注意 `RegulationScheduleEntry` **目前没有 `sourceUrl` 字段**（只有 `SeasonScheduleEntry` 有），要先给它加同样的可选字段。
- 本任务**不新增** M-C 窗口，也**不新增**下一赛季条目。

**验收边界**
- `npm test` 通过；`schedule.test.ts` 新增断言覆盖：M-A/M-B 边界日期为字面量、`currentRegulation(2026-07-20)` 仍为 `M-B`、`seasonToRegulation('M-5') === 'M-B'`。
- `npm run build` 通过。
- **免费信号：视觉基线不需要重建。** `tests/pwa/visual.spec.ts:18` 的固定时钟是 `2026-07-20T12:00:00Z`，落在 M-B 窗口内。如果 CI 的 `visual` 门禁挂了、header 文案变了，说明历史窗口被改坏了 —— 此时**回去修改动，不要重建基线**（见 `AGENTS.md` §3）。
- `isRegulationRolloverDue()` 在 2026-09-09 之后返回 `true`（M-C 未加入前应当报「该滚了」）。

**明确不做**：不碰 catalog、不碰 `currentRuleSet.id`、不改目录名。

---

### Task 2 — `RegulationId` 扩到 M-C，去掉两分支推导与静默兜底

**目标**：类型和推导层面先支持三个规则，让 Task 7 只剩「填数据」。

**允许改动**
- `src/lib/environmentDataset.ts`
- `src/data/environment.ts`
- `src/pages/environmentTeamSamples.ts`
- `src/pages/TeamBrowseView.tsx`
- `src/data/schedule.ts`（**只改注释**：`seasonSchedule` 上方现写「缺表的赛季默认归 M-A（sampleRegulation）」，本任务之后失实，要同步改成「返回 undefined、不进具体规则筛选」）
- 以上文件对应的测试：`src/data/environment.test.ts`、`src/pages/environmentTeamSamples.test.ts`、`src/pages/EnvironmentPage.test.tsx`、`src/data/vgcpastesTeamSamples.contract.test.ts`

**要求（推荐方案，采纳前不要自行换设计）**
- `RegulationId` 扩为 `'M-A' | 'M-B' | 'M-C'`。
- `environment.ts:40` 的三元推导改为从 `currentRuleSet.id` 到 `RegulationId` 的显式映射表；映射缺失时**抛错或构建期失败**，不要兜底到 `M-A`。
- `sampleRegulation` 返回类型改为 `RegulationId | undefined`：赛季表里查不到的样本返回 `undefined`，不再静默算作 M-A。
- 队伍库筛选按钮**由 `regulationSchedule` 派生**，不再手写数组 —— 这样 Task 7 加完 M-C 窗口后按钮自动出现。未标注规则的样本在「全部」视图仍可见，选中具体规则时不出现。
- `environment.ts:291-292` 的 VGCPastes 文件加载保持现状（M-C 样本文件本轮不存在）。

**验收边界**
- `npm test` + `npm run build` 通过；`tsc -b` 对三值联合类型的穷尽性检查无 `default` 吞掉分支。
- 新增测试：未知赛季标签的样本 `sampleRegulation` 返回 `undefined`，且不出现在任何具体规则筛选结果里。
- 现有队伍样本的分类结果**逐条不变**（M-A/M-B 计数与改动前一致）。

**明确不做**：不引入「多规则 catalog 切换」功能；`RegulationId` 只是环境数据与样本的标签维度。

---

### Task 3 — 招式接触标记改用权威来源并全表审计

**目标**：为 Aura Guard 建立可信的 `makesContact`。

**允许改动**
- `scripts/generate-champions-moves.mjs`
- `src/data/seed/regMA/move-catalog.ts`（**通过重跑脚本产出，不手改**；见 `AGENTS.md` §4）
- 新增或扩展针对接触标记的单测（建议落在 `src/lib/dataAudit.test.ts` 或新建同级测试）

**要求**
- 删除 `CONTACT_HINTS` 与 `inferMakesContact` 的名称启发式，改从 `@smogon/calc` 的 Gen 9 dex 读 `flags.contact`（接口细节见 §0.2 第 3 条）。**两处写入点都要换**（`:292` 正常路径与 `:306` PokeAPI 失败回退分支），回退分支同样不许产出猜测值。
- 查不到的招式**必须显式失败或标记为待人工确认**，不许回落成 `false`。
- 跑 `npm run data:regma:moves` 重生成，**逐条审阅 diff**：这次改动会翻转数量可观的行，PR 描述里要给出翻转条数与抽样核对结果。
- ⚠️ **这个脚本不只算接触标记**：它按本地 catalog 里的每只宝可梦抓 PokéBase 的 Available Moves 页重建 learnset（`readCurrentPokemon` + `parseAvailableMoves`），页面缓存在 `.npm-cache/pokebase/`（gitignore；2026-09-02 核对本机**没有**这份缓存，重跑必定全量走网络）。PokéBase 现在已经带 M-C 预备数据，重跑会把现有宝可梦的 learnset 变动一并带进 diff，等于在门禁前把 M-C 内容漏进 `move-catalog.ts`。要求：把 diff 拆成「`makesContact` 翻转」和「learnset / 文案变动」两部分分别审；后者若含 M-C 相关变动一律不得随本任务合入（回退到只保留接触标记的差异）。PR 描述必须写明 learnset 是否有变动。

**验收边界**
- 已知四条错误全部翻正：近身战 / 十万马力 / 吸取之吻 / 圣剑 → `true`；地震、喷射火焰等非接触招式保持 `false`。
- 新增门禁测试：抽取一组接触/非接触基准招式做断言，防止后续重生成再次退化。
- `npm test` 通过。视觉基线不受影响（该字段无 UI 消费方）。

**明确不做**：本任务**不**接入 Aura Guard、**不**给计算器加接触分支（那是 Task 10）。

---

### Task 4 — Mega 形态合并改为按父级合并数组

**目标**：消除 §0.2 第 5 条的静默覆盖风险，为 Z Mega 铺路。

**允许改动**
- `src/data/seed/regMA/catalog.ts`（合并逻辑部分）
- `src/lib/dataAudit.ts` / `src/lib/dataAudit.test.ts`

**要求**
- `megaFormsByParentId` 与 `mbMegaFormsByParentId`（以及未来的 M-C 表）的合并，从对象展开改为**按父级 key 拼接数组**；同名 `form.id` 重复时报错，不要静默取后者。
- `megaStoneParentMap` / `megaCapableBaseIds` 的合并同样检查一遍是否存在同类覆盖语义。
- 在数据审计里加一条：同一父级下 `form.id` 唯一、且每个 Mega 形态的 `requiredItemId` 在道具表中存在（后者 `dataAudit.ts:108` 已有，确认覆盖新路径即可）。

**验收边界**
- 新增回归测试：构造两张表在同一父级（如 `absol`）各有一个 Mega 形态，合并后该父级**两个形态都在**。这条测试在改动前应当是红的。
- 现有 Mega 形态总数与改动前**完全一致**（M-A 表与 M-B 表当前零交集，所以合并结果不应有任何数量变化）。
- `npm test` + `npm run build` 通过。

---

### Task 5 — 数据脚本：隔离破坏性路径、批次自动发现、来源标签显式化

**目标**：让阶段 B 能安全跑现有维护链，而不是「跑一下发现数据没了」。

**允许改动**
- `scripts/generate-regma-allowlist.mjs`
- `scripts/generate-catalog-batch.mjs`
- `scripts/generate-ability-effects.mjs`
- `package.json`（对应 `data:*` 脚本项与说明）
- `docs/DEVELOPER_GUIDE.md` §7（同步脚本现状）

**要求**
- **allowlist 脚本**：按 §0.2 第 4 条，这是运行即破坏的历史脚本。处理方式二选一，倾向前者：
  (a) 加显式守卫——检测到现有 `allowlist.ts` 含非 `reg-ma-` 行时直接拒绝执行并打印原因，同时在文件头写清「M-A 历史脚本，M-B 起改为手工追加」；
  (b) 改造成增量模式，只追加缺失行、不重写既有行。
  无论哪种，都要在 `package.json` 的 `data:regma:allowlist` 处标注风险。**不要**为了跑通而放宽守卫。
- **catalog batch 生成器**：`BATCH_NUMBER` / `BATCH_SIZE` / `batchSourceRefs` 改为命令行参数或显式配置，批次号默认取「已存在的最大批次 + 1」；来源标签不再写死 `reg-ma-*`。
  这一项**不是顺手改**：M-C 的新增名单尚未公布、规模未知（§1），如果最终是几十只，Task 8 就完全依赖这个生成器跑通；只有 2 只时手写反而更快。按「名单可能很长」来做，不要图省事只支持小批量。
- **特性生成器**：`catalog-batch-*.ts` 改为目录扫描发现（当前漏掉已存在的 batch 006），并按批次号排序。可照 `generate-champions-moves.mjs` 的 `readCurrentPokemon()` 写法（它已经是 `readdir` + 前缀过滤）。该脚本**目前不解析任何命令行参数**，验收要求的 `--check` / dry-run 需要本任务新增。
- 不要设计插件系统或规则抽象层，只做「显式配置 + 自动发现」。

**验收边界**
- allowlist 脚本在当前仓库状态下执行会**安全失败**（或只追加），`git status` 干净。
- 特性生成器新增的 `--check` 或 dry-run 能列出包含 batch 006 在内的全部批次。
- 三个脚本的改动**不产生任何数据文件 diff**（本任务只动脚本，不重生成产物）。
- `npm test` 通过。

---

### Task 6 — 去掉文案里的硬编码赛季/规则

**目标**：`manifest.webmanifest` 现在写着 Season M-3，README 写着「现为 M-B」。这类文案每次滚动都要人改，能去掉的去掉、去不掉的集中。

**允许改动**
- `public/manifest.webmanifest`
- `README.md`
- `docs/DEVELOPER_GUIDE.md`（§5.1 / §7 的规则描述）
- 页面内出现硬编码赛季/规则字样的组件（若有；header 已经走 `productContextLabel`，不要改它）

**要求**
- manifest 的 `description` 去掉具体赛季与规则编号，改成不随滚动过期的表述。
- README 保留「当前规则」的说明，但明确指向 `src/data/schedule.ts` / `metadata.ts` 为唯一事实源。
- 顺手核对是否还有别处硬编码；`AGENTS.md` §1 已经禁止硬编码当前赛季/规则，本任务是把存量清掉。

**验收边界**
- 全仓库（排除 `docs/plans/`、`docs/progress/` 这类留痕文档和生成产物）grep 不到新的硬编码赛季号。
- PWA 相关测试通过：`npm run test:pwa -- tests/pwa/offline.spec.ts`。
- 视觉基线不需要重建。

---

## ⛔ 门禁：等待官方 M-C 完整规则清单

以下任务在完整清单公布前**不得落数据**。可以先用 PokéBase 预备数据在本地验证结构与流程，但不得提交为最终值，也不得把 `verificationStatus` 从 `manual-review` 上调。

---

## 阶段 B

### Task 7 — 切换当前规则到 M-C

**目标**：`currentRuleSet` 指向 M-C，时间轴补上 M-C 窗口。

**允许改动**
- `src/data/seed/regMA/metadata.ts`
- `src/data/schedule.ts` / `schedule.test.ts`
- `src/data/environment.ts`（Task 2 建立的映射表加一条）

**要求**
- `currentRuleSet`：`id: 'reg-mc'`、名称与 `displayName` 同步、`startAt` / `endAt` 用 §0.2 第 1 条的官方值、`dataVersionId` 升一版。战斗参数（`battleType` / `allowMega` / `megaLimitPerBattle` / `duplicateHeldItemsAllowed` / `timers`）**必须逐项对照官方 M-C 公告确认**，不要从 M-B 直接抄。
- `currentDataVersion` 与 `dataSourceManifest`：新增 M-C 来源条目（官方 M-C 公告 URL、官方 eligible 端点如已放出、PokéBase M-C 页），M-A/M-B 的历史来源条目**保留**（旧批次仍在引用其 `sourceRef`）。
- `regulationSchedule` 追加 M-C 窗口；赛季表按当时已公布的公告补，公告没出就不补。后果要清楚：Task 2 之后，PokeDB 新赛季标签（M-6 或官方定的编号）如果不在 `seasonSchedule` 里，该赛季的高分队样本 `sampleRegulation` 会是 `undefined`，只出现在「全部」视图、不进 M-C 筛选——这是预期的安全行为，公告出来补表即可，不要为此把它兜底成 M-C。

**验收边界**
- `currentRegulation()` 在 2026-09-10 返回 M-C，在 2026-07-20 仍返回 M-B。
- `isRegulationRolloverDue()` 在 M-C 窗口内为 `false`。
- 数据审计零 `unresolved-source-ref`。
- 注意：本任务单独完成后，首页趣味知识会因 `pokemonFacts.ts:37` 的 `ruleSetId` 不匹配返回空数组 —— 这是预期的，由 Task 9 消除。**Task 7–9 应作为一个 PR 合并，不要分开上线。**

---

### Task 8 — M-C catalog 增补

**目标**：把官方清单落成本地数据。以下是**已确认的最低缺口**，完整清单公布后必须再做一次全量差分。

**允许改动**
- `src/data/seed/regMA/allowlist.ts`（手工追加 `reg-mc-` 行，同步 `regMaPokemonAllowlistExpectedCount`）
- `src/data/seed/regMA/megaAllowlist.ts`（追加 M-C 新增 Mega，同步 `regMaMegaAllowlistExpectedCount`）
- 新增 `src/data/seed/regMA/mega-catalog-mc.ts`（照 `mega-catalog-mb.ts` 的结构）
- 新增 catalog batch 文件（经 Task 5 改造后的生成器产出）
- `src/data/seed/regMA/catalog.ts`（接线新表）、`move-catalog.ts`、`physicalMetrics.ts`、`item-icon-mapping.ts`
- `src/data/external/pokedbItemNameMap.ts`、`pokedbResourceKeyMap.ts`（**手写映射，无生成脚本**，见 `AGENTS.md` §4 例外条款）
- `public/assets/pokemon/thumbs/`、`public/assets/items/`
- 建议新增 `scripts/update-mc-assets.mjs`（照 `update-mb-assets.mjs`）

**已确认的最低缺口（下限，不是清单）**

> ⚠️ 下面每个数字都是**官方目前点名的部分**，不是最终数量。官方同一份公告写明「更多宝可梦可用」且「完整细节稍后公布」，新增名单大概率显著更长，招式 / 特性 / 道具 / 立绘的缺口会随之等比放大。**以最终清单为准逐项差分补齐，不要做完这几条就认为 Task 8 完成。**

- 基础宝可梦：已确认 2 只 —— 轰擂金刚猩（Rillaboom, #812）、戟脊龙（Baxcalibur, #998）。每只需配 catalog 行 + 身高体重 + 立绘 + learnset；未公布的部分照此模板批量处理。
- 独立 Mega 形态：已确认 3 个 —— Mega Absol Z / Mega Lucario Z / Mega Garchomp Z。**必须是新增形态，不得覆盖现有普通 Mega**（Task 4 已加防线；父级 `absol` / `lucario` / `garchomp` 的本体已存在，直接复用）。
- 每个 Z Mega 对应一块 Z Mega Stone 道具 + 道具图标 + PokeDB 日文名映射。缺映射会触发 Worker 零容忍审计（`workerStatus` 变 degraded）。
- 招式：已确认缺 `drum-beating`、`glaive-rush`（`grassy-terrain` 已在库）。**新宝可梦每多一只，缺失招式就可能再多几个**，以最终 learnset 差分为准。
- 特性：已确认缺 `grassy-surge`、`thermal-exchange`、`aura-guard`。`sharpness` / `levitate` 已在库可复用。同上，随名单增长。
- 立绘：每只新本体一张 + 每个 Z Mega 一张。Z Mega **不需要**单独的身高体重（§0.2 第 6 条）。

**要求**
- 每个 Z Mega 一块独立 Mega Stone，`requiredItemId` 与 `applicablePokemonIds` 必须对得上 —— 现有 Charizardite X/Y（`catalog.ts:443-444`、`:625-649`）是可照抄的先例，`legality.ts:85-107` 的校验链依赖这个结构。
- 所有新行 `verificationStatus` 保持 `manual-review`，`sourceRefs` 指向 Task 7 新增的 M-C 来源条目。
- 官方完整清单出来后，做**全量差分**：官方池 vs 本地 allowlist，多出与缺失都要列出并解释。

**验收边界**
- `npm test` 通过，其中数据审计零 issue（未知 ability / move / item / pokemon 引用全为 0）。
- `dataAudit.test.ts` 的 Mega 石门禁覆盖三块新 Z Mega Stone。
- 回归确认：普通 Mega 阿勃梭鲁 / 路卡利欧 / 烈咬陆鲨**仍然存在且可选**（Task 4 的测试应当已经覆盖，这里再做一次端到端确认）。
- 队伍编辑器里**最终清单上的每个新条目**都可选、可携带对应道具、合法性校验无误报（抽查而非只验已公布的 5 个）。
- `npm run build` 通过。

---

### Task 9 — 全量重生成与静态兜底刷新

**目标**：把所有跟着规则走的生成产物切到 M-C。

**允许改动 / 需重生成**
- 首页趣味知识快照（`npm run data:pokemon-facts`）—— 不做的话首页知识区直接空白（`pokemonFacts.ts:37`）。
- 速度线静态快照 `src/data/speedTiers.ts`（`npm run data:pokedb:speed`）。
- 静态环境兜底 `public/data/pokedb/reg-ma-environment.json`（`npm run data:pokedb:environment`）—— 当前 `battles.*.season` 停在 M-4，`teamSamples` 停在 M-3。脚本会自动探测 PokeDB 最新赛季（`detectLatestPokeDbSeason`），高分队样本默认取**上一个已结束赛季**（可用 `POKEDB_SAMPLE_SEASON` 固定），所以这里没有赛季硬编码要改，只需重跑。
- 道具审计 `npm run data:items:audit`。
- Worker catalog bundle 与类型声明（`npm run worker:app:types` / `worker:environment:check`）。
- `src/data/environmentDatasetSeed.ts` 如含规则相关字段一并核对。

**验收边界**
- `npm run data:pokemon-facts:check` 通过（CI 有这道门禁）。
- `npm run worker:environment:check`（wrangler dry-run）通过。
- 静态兜底 JSON 的 `battles.*.season` 已推进到当时的实际赛季（该 JSON **没有** `ruleSetId` 字段，`battles.*.rule` 是 `singles` / `doubles`，不要拿它核对规则）。`ruleSetId === currentRuleSet.id` 这条校验属于首页趣味知识快照，由 `data:pokemon-facts:check` 覆盖。
- **M-C 开赛后**跑一次真实 PokeDB 环境刷新，确认**全部新增宝可梦、Z Mega 与新道具**（以最终清单为准，不是已公布的 5 个）**没有被零容忍审计剔除**（`workerStatus` 应为正常而非 degraded）。这一步必须在真实数据上验证，本地 fixture 不算数。
- 视觉基线：数据刷新**不应当**要求重建基线（视觉用例吃冻结 fixture）。若被要求重建，先查是不是 Task 1 的时间轴或 header 文案出了问题。

---

### Task 10 — 计算器：草场地形与 Aura Guard

**目标**：M-C 引入的两个机制不能让计算器给出看起来精确、实际错误的结果。

**前置**：Task 3（接触标记）、Task 8（特性入库）。

**允许改动**
- `src/lib/damageAdapter.ts` / `damageAdapter.test.ts`
- 伤害计算 UI（场地选择器所在组件）
- `docs/research/DAMAGE_CALC_FIXTURES.md`（补 fixture 说明）

**现状**：`damageAdapter.ts` 有天气（`weather`，`:338-343`），**完全没有 terrain**（全仓库 grep 零命中）。

**要求（两条路线，按工作量二选一，但必须选一条，不许既不建模也不提示）**
- **路线 A（建模）**：接入草场地形——草属性招式增伤、地震类减伤、青草滑梯先制等口径逐条对照官方/社区确认后实现；Aura Guard 依据招式接触与否减半伤害。
- **路线 B（守门）**：对未建模场景**明确阻止计算或显著警告**，不要把结果伪装成准确值。

  推荐：Aura Guard 走 A（接触标记 Task 3 已就绪，实现成本低），草场走 A 的核心项（草招增伤 + 地震减伤）、其余走 B。
- 无论哪条路线，都要守住产品边界（`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`）：只做单次交换的伤害区间，**不得**扩展成回合推进 / 换人 / 命中判定 / 特性触发链。

**验收边界**
- 新增 fixture 测试覆盖：接触招 vs 非接触招打 Aura Guard 持有者的伤害差异；草场下草属性招式与地震的修正。
- 未建模场景在 UI 上有明确提示，且提示文案不暗示「精确」。
- `npm test` + `npm run build` 通过。

---

## 2. 上线门槛（合并到 `main` 前逐条确认）

> `main` 无分支保护，push 即上线（`AGENTS.md` §2）。以下每条都必须为真。

1. 官方 M-C 完整清单已公布，本地 catalog 与之做过全量差分，差异有解释。
2. 静态数据审计零未知引用（`npm test` 内的 `dataAudit`）。
3. `npm test` 与 `npm run build`（含 `tsc -b`）通过。
4. CI 的 `visual` 门禁通过；若基线被要求重建，先确认是真实 UI 变更而非时间轴改坏。
5. `npm run data:pokemon-facts:check`、`npm run worker:environment:check` 通过。
6. 换季后 Worker 真实抓取一次，新增条目未被审计剔除。
7. Agent 创建的功能 PR 默认 Draft（`AGENTS.md` §3）；Task 7–9 合并为同一个 PR。

---

## 3. 明确不做 / 延后

- **M-C 的 VGCPastes 赛事队伍库**：开赛初期没有成熟样本，先靠 PokeDB。摄入脚本已是配置化的，届时加一条配置即可。
- **多规则 catalog 切换功能**：M-C 是累加规则，本轮只需把「现行 catalog」切过去。
- **重命名 `seed/regMA/` 目录与 `reg-ma-environment.json` 路径**：难看但不是上线阻塞项，且改动面大、风险高。
- **IndexedDB / Worker API / KV 结构 / 新依赖**：一律不变。特别注意 IndexedDB 库名 `pokemon-champions-assistant` **永不可改**。
- **把预告片内容当 M-C 已确认项**：Mega 戟脊龙、Heatran 等，在完整清单里出现之前不入库。

---

## 4. 给执行者的提醒

- 主线宝可梦知识不适用于 Champions 的 SP / 速度公式，见 `AGENTS.md` §1，不要「纠正」。
- preview 与生产共享同一 KV namespace，preview 上一律只读。
- 带 `Auto-generated` 头的文件改脚本、不手改产物；例外是 `src/data/external/` 下两个日文名映射（手写）和本计划中明确说明手工追加的 `allowlist.ts`。
- 视觉用例吃冻结数据，不要为了让截图跟上最新数据去改用例或放宽阈值。

---

## 5. 参考来源

| 内容 | 链接 |
| --- | --- |
| Regulation Set M-C 公告（起止时间、新增内容、完整清单待公布） | https://news.pokemon-home.com/en/page/816.html |
| Regulation Set M-B 延期至 2026-09-09 | https://champions-news.pokemon-home.com/en/page/776.html |
| Ranked Battles Season M-5（结束时间 2026-09-09 01:59 UTC） | https://champions-news.pokemon-home.com/en/page/803.html |
| PokéBase Champions 宝可梦数据（预备参考，非合法池依据） | https://pokebase.app/pokemon-champions/pokemon |
| PokéBase Champions 道具数据（尚无 Z Mega Stone） | https://pokebase.app/pokemon-champions/items |
