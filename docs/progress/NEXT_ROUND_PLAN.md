# 下一轮开发计划 / TASKS

更新日期：2026-06-18

## 开发流程

需求 → Claude Code 拆解为本文件任务 → Codex app 领取单个任务、开独立 worktree 实现 → Claude Code 审 diff。每个任务尽量自包含、可独立合并；标注「依赖」的任务按序进行。

> 上一轮 Task A–E、G、H 及「上线前联合核验」已全部完成并验证（2026-06-18 核对，`npm test` 239 passed）。Task 1（伤害计算补全新赛季 Mega 物种映射）已完成并验证（2026-06-18 核对，`npm test` 240 passed，`npm run build` passed）。Task 2（一次性脚本摄入 VGCPastes「Champions M-A」构筑）已完成并验证（2026-06-19 核对并经 Claude review 修订：**按赛事含金量清洗**——仅保留官方线下锦标赛 + 近 30 天窗口，PJCS 取 Top14，最终入库 **99 队**；42 队带游戏内队伍码、63 队含完整 SP；修正了 EV→SP 误除以 8 的 bug（paste 里的 `EVs:` 本就是 Champions SP）；数据改为**运行时 fetch（不再打包进 JS）** + SW 预缓存，267KB。`npm test` 246 passed，`npm run build` passed）。Task F（伤害计算页排版重规划）经确认**保留、暂不做**，见文末。

## 任务清单

### Task F — 伤害计算页排版重规划（保留 · 暂不做 · 低优先级 · 前端 · 算法不动）

> 上一轮遗留。经确认本轮**保留但暂不做**，待后续排期。算法/计算口径不动，仅重排展示层与信息层级（进攻/防守方卡片、招式区、对战条件、伤害结果的布局与视觉）。可走 `frontend-design` 技能定方向，保持与全站 `text-xs/text-sm` 设计语言一致。

### Task 3 — 队伍卡片「可导入配置」能力标识（前端 · 依赖 Task 2 数据模型）

> **依赖 Task 2**：用其产出的 `hasMoves`/`hasSpread` 完整度标记。

- **目标**：每个构筑样本按公开配置完整度，在卡片上用**胶囊 icon** + 「**可导入：[SP分配][配招]**」注释行标明能导入到什么粒度（仅命中项出现）。PokeDB 旧源样本通常只有宝可梦+道具（两标记皆 false），PokePaste 新源样本两者皆有。
- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`TeamSampleCard`）；`src/types.ts`（`EnvironmentTeamSample` 补 `hasMoves`/`hasSpread`，若 Task 2 未加）；测试 `src/App.test.tsx`。
- **改动要点**：
  - `TeamSampleCard` 内按 `hasSpread`/`hasMoves` 渲染胶囊：命中则显示「可导入：[SP分配][配招]」一行（仅命中项），无命中则不显示该行（或中性提示「仅宝可梦+道具」，实现时定）。
  - 「导入配置」按钮行为：携带该样本**实际具备**的配置粒度导入（有配招/ SP 就一并代入）。
- **验收**：含完整配置的样本显示对应胶囊与注释行、仅基础信息的样本不显示；`npm test` 通过；`npm run test:visual` 更新环境页快照。

### Task 4 — 上位构筑列表乱序展示 +「换一批」随机（前端 · 建议在 Task 2 之后）

> **出发点**：现在「上位构筑」按来源排名顺序排列，`换一批`（`EnvironmentPage.tsx:761`）只是 `teamSampleBatchIndex` 顺着 +1 取模、按原序往下切片（`:631` `teamSamples.slice(...)`）——用户点「换一批」只是顺位下翻。接入 Task 2 后样本来自 **PokeDB + VGCPastes 多来源**，严格按排名排序已无意义，应**乱序**让「换一批」真正给出多样化的不同构筑（并自然混合两个来源）。

- **涉及文件**：`src/pages/EnvironmentPage.tsx`（`teamSamples`/`visibleTeamSamples`/`换一批` 一带，`:625-634`、`:757-766`）；测试 `src/App.test.tsx`。
- **改动要点**：
  - 把按来源原序切片改为**对该 `battleType` 的样本池整体乱序后再分批**（PokeDB 与 VGCPastes 混合打乱）。
  - **推荐做法**：用**带种子的洗牌**在 `useMemo` 里按当前 `battleType` 生成一次乱序（保证同一次浏览内 `换一批` 顺着乱序顺位翻、不立刻重复）；`换一批` 翻到末页回绕时**换新种子重洗**，避免反复看到同一批。种子用 state 持有，便于单测断言「顺序变化且不崩、不丢样本」。
  - 切换 `battleType` 时重置（沿用现有 `setTeamSampleBatchIndex(0)`，并重置种子）。
  - 不动导入/详情逻辑；卡片 `key` 仍用 `sample.id`。
- **验收**：上位构筑首屏即为乱序、非严格排名序；`换一批` 给出乱序后的不同批次（非顺位下翻）；切换单打/双打重置；样本不丢不重（单页内）；`npm test` 通过；`npm run test:visual` 更新环境页快照。

### Task 5 — 队伍码：写入 → 导入带入 → 队伍详情页展示与复制（前端 + 数据 · 依赖 Task 2）

> **出发点**：VGCPastes 部分队伍带**游戏内队伍码**（`Replica Code` 列）。要把它打通到前端，让用户能直接看到并复制这串码（拿去游戏内一键导入整队）。**不加新入口**，直接展示在「导入配置后」的队伍详情（成员 2×3）页面。

- **链路**：`Replica Code` 列 → Task 2 写入 `EnvironmentTeamSample.replicaCode?` → 导入时带入本地队伍 → 队伍详情页展示。
- **涉及文件**：`src/types.ts`（`Team` 加 `replicaCode?: string`；`EnvironmentTeamSample.replicaCode?` 由 Task 2 加，本任务消费）；样本→本地队伍的导入转换处（`src/App.tsx` 导入链路 / 相关 helper，把 `replicaCode` 带进新建 `Team`）；`src/pages/TeamPage.tsx`（`:1170` 那行 + 复制交互）；toast 复用 `src/App.tsx:275-283` 既有小长条；测试 `src/App.test.tsx`。
- **改动要点（UI）**：
  - **改 `TeamPage.tsx:1170` 那句**：`{activeTeam.members.length}/6 成员 · 本地队伍 · 可自由编辑` → **只保留成员计数** `{activeTeam.members.length}/6 成员`（去掉「· 本地队伍 · 可自由编辑」）。
  - **有队伍码时**：在成员计数后用分隔符（`·`）接上**队伍码文本**，码后跟一个**复制图标按钮**（lucide `Copy`，`aria-label="复制队伍码"`）。无码的队伍只显示成员计数。
  - **点复制**：`navigator.clipboard.writeText(replicaCode)` → 触发小长条 toast（**复用 `importToast` 同款机制与样式**）：文案「**队伍码已复制**」+ 一句简短说明「**分享可能已过期**」（作次要小字或第二行）。toast 自动消失沿用现有 setTimeout。
  - toast 触发需让 `TeamPage` 能调到 App 的 toast（prop/context 暴露 `showToast`，或在 TeamPage 内复用同款组件——实现时择简）。
- **验收**：导入带队伍码的 VGCPastes 队后，队伍详情页那行只剩「X/6 成员」并在其后展示队伍码 + 复制图标；无码队伍只显示成员计数；点复制写入剪贴板并弹出「队伍码已复制 / 分享可能已过期」小长条；`npm test` 通过；`npm run test:visual` 更新队伍页快照。

## 暂不做

- 完整战斗模拟器 / 用户账号 / 云同步 / 多赛季趋势库（沿用上轮判断）。
- 升级 Workers Paid（免费分批方案已够用）。
- 队伍分析（上轮已下线）。
- 生成/分享图片（上一轮砍掉，暂无需求；若日后要回归再重评落点）。
- ~~引入新数据源~~ —— 本轮已重新评估并接入，见 Task 2（PokePaste 摄入）。
- **Worker cron 自动拉取 VGCPastes**：本轮先做一次性脚本（Task 2）；数据源更新频率与累积量级未知，待量起来、值得自动化再评估上 cron（参考 Task 2 记录的入库队数）。
- **终端用户粘贴导入框（形态 A）**：用户在 app 内粘贴 PokePaste/Showdown 导入到自己队伍。本轮只做维护侧自动摄入（Task 2）；A 价值有限（普通用户手里多是无法解析的复制码），推后。
- **Chrome 插件 + computer-use 爬小红书/B站**：payload 是视频/图仍需 OCR/人工、ToS/封号风险、且产出是无成绩证据的编辑推荐——经评估不作数据骨干，至多日后做「手动存当前所看队伍」的便利。
- 游戏内「复制码」反解、Pokémon HOME、游戏内官方 Battle Data 馈源、Pikalytics/Game8 推荐队作整队源——经调研确认为死路（详见 Task 2 调研结论）。

## 全局验证（每个任务合并前）

```
npm test
npm run build
npm run test:visual        # 涉及 UI 改动
```

- Task 3：含完整配置的样本显示「可导入：[SP分配][配招]」胶囊+注释、仅基础信息的不显示；快照更新。
- Task 4：上位构筑首屏乱序、非排名序；换一批给出乱序不同批次；切换单/双打重置；样本不丢不重；快照更新。
- Task 5：带码队伍详情页显示「X/6 成员 · {队伍码} [复制]」、无码只显示成员计数；复制写入剪贴板并弹「队伍码已复制 / 分享可能已过期」小长条；快照更新。
