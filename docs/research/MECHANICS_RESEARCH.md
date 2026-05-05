# 机制边界

更新时间：2026-05-06

## 已作为产品机制启用

- Regulation Set M-A 日期、重复道具规则、计时规则。
- Regulation Set M-A Pokémon allowlist。
- Regulation Set M-A Mega allowlist shell。
- Champions SP v1：
  - 单项 `0-32`。
  - 单只总量 `66`。
  - Lv.50 固定。
  - IV 不暴露。
  - 性格使用主系列 nature-like 增减修正。
- 速度计算基于 Champions SP v1，可作为当前版本速度线结论。

## 伤害计算机制

当前伤害计算采用：

- Gen9 主线公式。
- Champions SP v1 能力值。
- 当前项目 move/item/ability/form 数据。
- 已建模的属性、本系、天气、能力阶级、部分特性与道具修正。

输出必须保持 experimental 口径。不能写成官方 Champions 正式结论。

## 需要继续验证

- Champions 是否完全沿用 Gen9 伤害公式和所有 rounding 顺序。
- Champions 改动招式的威力、分类、目标和特殊效果。
- 全量会影响伤害的特性与道具。
- Champions 新 Mega 的真实战斗字段。
- 未来规则对 Pokémon、道具、Mega 和计时的变化。

## 处理原则

- 官方确认的规则可给强提示。
- 社区资料只能作为研究线索，进入数据前必须留 source/ref 或 manual-review。
- 机制未确认时，不伪造强结论。
- 如果用户配置非法，例如 SP 超限，adapter 阻断计算而不是静默重置输入。
