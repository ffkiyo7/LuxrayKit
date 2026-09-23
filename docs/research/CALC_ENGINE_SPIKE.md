# 伤害计算引擎结论

更新日期：2026-09-23（原始定稿 2026-06-11；2026-09-23 并入原 `MECHANICS_RESEARCH.md`，后者已归档到 `docs/archive/`）

## 当前结论

伤害计算器可作为 **experimental mainline approximation** 使用（`AccuracyLevel = 'experimental-mainline-approximation'`，`src/lib/damageAdapter.ts`）：

- 引擎：`@smogon/calc` Gen9。
- 数据：项目内当前规则（`currentRuleSet`）的宝可梦、形态、招式、道具和特性。
- 能力值：Champions Lv.50 SP v1 口径（等级固定 50）。
- 输出：单次伤害的 16 档 roll、区间、百分比、属性关系、假设和警告。

它不是 Pokémon Champions 官方伤害公式，也不是完整战斗模拟器。

## 当前输入（`DamageAdapterInput` / `CalcSideConfig`）

- 攻击方和防守方宝可梦 / 形态，来源为队伍成员或临时配置（`'team-member' | 'temporary'`）。
- 特性、道具、性格、SP；每侧能力阶级（−6~+6）。
- 招式；单 / 双打（双打分摊由招式与对战类型自动推导，不是开关）。
- 天气（无 / 晴 / 雨 / 沙暴 / 雪）、会心。

场地、HP 百分比、异常状态和保护输入已在 f33587a（2026-06-06，「Simplify damage calculator battle context」）移除，当前不是输入项。

## 已覆盖的主要行为

- 物理 / 特殊能力值和 Champions SP 转换。
- 本系、属性克制、免疫、天气、会心和能力阶级。
- 常见增伤道具、减伤果、Choice Scarf 不影响伤害等回归。
- Pixilate、Liquid Voice、Dragonize、Fairy Aura、Mega Sol、Huge Power、Adaptability、Multiscale、Levitate、Mold Breaker、Iron Fist、Protean 等已测试的直接伤害交互。
- Weather Ball 的属性、威力和天气倍率。
- Bulletproof、Filter / Solid Rock、Scrappy 等直接影响伤害或免疫的逻辑。
- 部分击后事件以结构化结果（`eventEffects`）返回，但不推进后续回合。

`src/lib/damageAdapter.test.ts` 的 `championsMegaAbilityCoverage` 维护 Champions 新增 Mega 特性覆盖矩阵：24 个形态中 14 个 `tested-damage`（直接伤害行为测试），10 个 `context-only`（逐条写明原因，如依赖保护 / 重定向 / 命中 / 受击后状态等战斗上下文，只记录边界）。

## 不自动推导

- 威吓、天气手、换人、速度变化、队友行动。
- 命中率、概率触发、多回合持续状态。
- 一场战斗内 Protean 等触发次数限制。
- 完整保护、替身、墙、重定向和场上状态机。
- 未经验证的 Champions 专属机制。

## 未确认

- Champions 是否在所有取整、随机数和边界条件上完全等同 Gen9 主线。
- 未经数据源确认的合法性、招式或专属机制。

速度计算（SP、性格、顺风修正）在 `src/lib/calculations.ts` 实现并测试，速度线工具已开放，见 `docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`。

## 维护要求

- 只有已验证的直接效果才进入 adapter；新增 adapter 分支必须有精确 roll 或行为测试（写法见 `DAMAGE_CALC_FIXTURES.md`）。
- 需要战斗流程的效果不因“可以推测”而自动启用。
- 不支持的输入应返回 `blocked` 或 `invalid-input`，不能静默猜测。
- UI 必须继续显示近似口径、警告和假设。
- 机制研究与产品入口分开：底层代码存在不等于用户功能已开放。
- 所有强结论必须能追溯到来源或回归测试。
- 不因计算引擎能力扩展而改变产品“单次招式参考”的边界。
