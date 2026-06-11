# 伤害计算引擎结论

更新日期：2026-06-11

## 当前结论

伤害计算器可作为 **experimental mainline approximation** 使用：

- 引擎：`@smogon/calc` Gen9。
- 数据：项目内 Regulation Set M-A 宝可梦、形态、招式、道具和特性。
- 能力值：Champions Lv.50 SP v1 口径。
- 输出：单次伤害的 16 档 roll、区间、百分比、属性关系、假设和警告。

它不是 Pokémon Champions 官方伤害公式，也不是完整战斗模拟器。

## 当前输入

- 攻击方和防守方宝可梦 / 形态。
- 特性、道具、性格、SP、等级。
- 招式、单双打和分摊伤害。
- 天气、场地、攻防能力阶级。
- HP 状态、异常状态、会心和保护。

## 已覆盖的主要行为

- 物理 / 特殊能力值和 Champions SP 转换。
- 本系、属性克制、免疫、天气、场地、会心和能力阶级。
- 常见增伤道具、减伤果、Choice Scarf 不影响伤害等回归。
- Pixilate、Liquid Voice、Dragonize、Fairy Aura、Mega Sol、Huge Power、Adaptability、Multiscale、Levitate、Mold Breaker、Iron Fist、Protean 等已测试的直接伤害交互。
- Weather Ball 的属性、威力和天气倍率。
- Bulletproof、Filter / Solid Rock、Scrappy 等直接影响伤害或免疫的逻辑。
- 部分击后事件以结构化结果返回，但不推进后续回合。

`src/lib/damageAdapter.test.ts` 中维护 Champions 新增 Mega 特性覆盖矩阵：14 个作为直接伤害行为测试，10 个标记为需要战斗上下文。

## 不自动推导

- 威吓、天气手、换人、速度变化、队友行动。
- 命中率、概率触发、多回合持续状态。
- 一场战斗内 Protean 等触发次数限制。
- 完整保护、替身、墙、重定向和场上状态机。
- 未经验证的 Champions 专属机制。

## 维护要求

- 新增 adapter 分支必须有精确 roll 或行为测试。
- 不支持的输入应返回 `blocked` 或 `invalid-input`，不能静默猜测。
- UI 必须继续显示近似口径、警告和假设。
- 不因计算引擎能力扩展而改变产品“单次招式参考”的边界。
