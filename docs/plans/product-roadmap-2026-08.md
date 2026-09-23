# 产品路线规划 · 2026-08

> **状态：待实施计划，不是现状描述**（文档分级见 `docs/DEVELOPER_GUIDE.md` §10）。更新：2026-09-23。
> 只留未开工的 P3–P5 与 owner 定下的规则；已落地的 P0–P2（M-5 换季、赛季排名变动、URL 队伍分享）与原始评审见 `git show 9a26196:docs/plans/product-roadmap-2026-08.md`。
> 下面的规则是 owner 的判断，实施时不要按自己的推理覆盖。

## 待办（按顺序）

- [ ] ⬜ **P3 速度线 UX 做减法**（先手率的前置）：梳理 `src/pages/SpeedPage.tsx` + `src/lib/speedTier.ts` 里哪些是真实使用路径；owner 点名存疑的是「拉 SP 实时调轴」（range 滑块仍在）。减法方案定了之后，再定先手率以什么形态并入（可能只是一个静态数字，不是又一个实时控件）。
- [ ] ⬜ **P4 调研 PokeDB 已有的 meta**：确认 PokeDB 是否提供构筑聚合 / 配置原型类数据、能否稳定获取。能接入就接入，**不要自建聚类**。PokeDB 历史赛季可回溯（`?season=n`），样本量不足时可考虑跨赛季累积。
- [ ] ⬜ **P5 对位速查**（依赖 P4）：从队伍成员出发选一个环境威胁，以统计上最可能的配置填充对手，给出双向伤害区间与速度先后。先出 UI / UX / 产品逻辑方案、评审通过再实现；入口必须很显眼。P4 无结论时对手配置只能手填。

## 规则

- 先手率（对环境前 N 的先手概率）排在 P3 之后，不要先加。
- 构筑聚类（配置联合分布）当前不做，等 P4 结论。
- 对位速查只给**单次交换的伤害区间 + 速度先后**，不做回合推进、换人、命中判定、特性触发链；文案避免「N 回合确杀」这类暗示回合推进的表达（`docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`）。
- 赛季排名变动 chip：只对比紧邻上一赛季；无前序快照则完全不渲染；表达的是名次变化，不是使用率变化（开发指南 §5.3）。
- 不做账号。
- 前端不接 `/api/pokemon/:id/teams`（PokeDB 天梯队伍只在赛季结束后公开）；要用必须先设计数据不可用时的降级形态。

## 待 owner 决定

- 要不要做事件级埋点（例如哪些队伍样本被导入过）。现在只有页面级匿名统计（Workers Analytics Engine，`POST /api/ping`）。

## 实施须知

- 本文档实施完毕后从版本库移除。
- 动手前读 `AGENTS.md`；涉及数据管线 / Worker / 部署读 `docs/DEVELOPER_GUIDE.md` §5–§9。
- Agent 创建的功能 PR 默认 Draft；提交前 `npm test`，涉及前端行为跑 `npm run build`。

## 已知缺口

- 赛季排名变动 chip 没有视觉基线（视觉用例只 route 静态快照，`previousSeason` 只有 Worker 会写）；补之前先定视觉用例怎么表示 Worker 来源的数据。已记进 `docs/qa/MOBILE_VISUAL_REGRESSION.md` 缺口清单。
