# 伤害计算引擎结论

更新时间：2026-05-06

## 当前实现

项目使用 `@smogon/calc` 的 Gen9 主线公式作为核心近似引擎，通过 `src/lib/damageAdapter.ts` 做项目侧适配。

适配层负责：

- 把项目 Pokémon / form / move / item / ability / nature id 映射为计算输入。
- 使用 Champions SP v1 推导实际能力值。
- 接入单双打、天气、场地、能力阶级、属性、本系、关键道具与特性。
- 派生 spread damage，而不是暴露给用户手动开关。
- 输出项目统一的伤害范围、百分比、结论、warnings 和修正胶囊。

## 结论口径

当前伤害计算可以用于 **experimental mainline approximation**：

- 公式基础：Gen9 主线伤害公式。
- 数据基础：当前 Reg M-A Pokémon / move / item / ability seed。
- Champions 适配：SP、形态、部分招式 / 特性 / 道具修正。

它不能标为官方 Champions 正式公式，原因是：

- Champions 官方未发布完整伤害公式。
- 部分 Champions 特有招式威力与效果仍需补齐。
- 部分特性 / 道具 / Mega 交互仍需样例验证。

## 已验证能力

- 单打 / 双打。
- spread damage 派生。
- 天气 / 场地。
- 攻防能力阶级。
- Mega form stats/types。
- 伤害范围与百分比。
- 一确 / 二确概率。
- 关键修正胶囊：属性克制、本系、天气、道具、特性等。

## 仍需验证

- 与外部计算器的典型样例交叉验证。
- Champions 改动招式的威力、属性、分类、目标范围。
- 会改变招式威力、免疫、能力值或最终伤害倍率的全量特性。
- Champions 新 Mega 的 stats/types/abilities。

## 维护规则

- React 页面不得直接调用 `@smogon/calc`。
- 新增计算变量必须先进入 adapter 和测试。
- 结果页只展示实际参与计算的变量胶囊。
- 所有输出必须保留 experimental / 非官方 Champions 正式结论边界。
