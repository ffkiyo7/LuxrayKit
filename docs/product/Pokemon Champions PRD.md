# Pokemon Champions Tool PRD

更新时间：2026-05-06

## 产品定位

Pokemon Champions Tool 是一个面向手机端的本地优先对战助手，用于：

- 管理当前规则队伍。
- 查看当前规则图鉴、招式、特性、道具和 Mega 信息。
- 计算速度线。
- 进行实验性伤害计算。

应用优先服务 Regulation Set M-A。所有队伍与偏好默认保存在本地 IndexedDB。

## 核心原则

- **移动端优先**：主流程必须在 390px 级别视口下可读、可点、可滚动。
- **本地优先**：队伍、偏好、收藏不依赖远程服务。
- **数据有来源**：真实数据进入 seed 时必须保留 `sourceRefs` 或 `manual-review`。
- **计算有边界**：速度线可给正式 v1 结论；伤害计算仍标记为 experimental。
- **临时计算不污染队伍**：CalculatorPage 的临时改动不得写回 TeamPage 或 IndexedDB。

## 当前已交付范围

### 队伍

- 多队伍本地管理。
- 队伍成员添加、展开、编辑、删除。
- 性格、特性、道具、招式、形态 / Mega、Champions SP 配置。
- SP 单项 `0-32`，总量 `66`，点开式 picker。
- 队伍 JSON 导入 / 导出。
- 重复道具、招式 / 特性 / Mega Stone 基础合法性提示。

### 图鉴

- Pokémon、招式、道具、特性入口。
- 当前规则 Pokémon 搜索与详情页。
- 属性、种族值、特性、learnset、Mega 形态展示。
- 道具本地图片快照。
- 特性拥有者按具体形态映射，Mega-only 特性指向 Mega 详情。

### 速度线

- 基于 Champions SP v1 的速度计算。
- 支持性格、SP、形态 / Mega、benchmark 与收藏。
- 速度计算通过 mechanism gate 保留未来调整空间。

### 伤害计算

- 进攻方 / 防守方独立配置。
- 可从当前规则图鉴搜索 Pokémon，也可从队伍导入成员配置。
- 摘要卡展示头像、名称、属性、性格、特性、道具。
- 能力配置面板支持性格、SP、能力阶级、特性、道具、形态、招式。
- 战斗条件支持单双打、天气、场地。
- 使用 Gen9 主线公式近似，接入 Champions SP 与当前项目数据。
- 结果展示伤害范围、百分比、一确 / 二确结论概率和关键修正胶囊。

## 明确不做

- 不宣称当前伤害计算是官方 Champions 正式公式。
- 不自动保存 CalculatorPage 临时配置。
- 不伪造 Champions 新 Mega 的 stats/types/ability/sprite。
- 不做远程刷新。
- 不做 Showdown paste。
- 不做 Reg M-B 数据接入，直到 registry 设计完成。

## 当前风险

- Champions 伤害公式、部分招式威力改动、特性与道具交互仍需继续验证。
- 部分中文说明来自社区资料，公开发布前需确认授权边界。
- 当前 JS bundle 较大，Vite 构建会提示 chunk size warning。

## 成功标准

- 用户可以在手机上完成队伍编辑、图鉴查询、速度线判断和伤害试算。
- 所有关键本地流程离线可用。
- 错误数据和未确认机制不会被包装成强结论。
- `npm test` 与 `npm run build` 保持通过。
