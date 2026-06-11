# Damage Calc Review Fixtures

更新日期：2026-06-11

## 目的

伤害 fixtures 用于锁定当前 `@smogon/calc` Gen9 + Champions SP v1 adapter 的行为。它们是回归锚点，不是官方 Champions 公式声明。

## 位置

- 主要 fixtures 与机制矩阵：`src/lib/damageAdapter.test.ts`
- 基础能力值与速度公式：`src/lib/calculations.test.ts`
- 数据完整性：`src/lib/dataAudit.test.ts`

## 当前覆盖类别

- 基础物理 / 特殊伤害和完整 16 档 roll。
- Champions SP、性格、等级和能力阶级。
- 天气、场地、双打分摊、会心、HP 和异常状态。
- 属性变化招式与特性。
- 直接增伤 / 减伤特性和道具。
- 免疫、破格类交互和保护输入。
- Champions 新增 Mega 特性的直接伤害覆盖矩阵。
- 无伤害招式、未知招式、未知形态和缺失配置的阻断行为。

## 新 fixture 要求

每个 fixture 应固定：

- 攻防双方、形态、特性和道具。
- 性格、等级与 SP。
- 招式和战斗上下文。
- 预期状态、警告 / 阻断原因。
- 可计算时的完整 16 档 damage roll。

不要只断言最小值或最大值；完整 roll 更容易发现取整顺序、倍率位置和 adapter 映射回归。

## 执行

```bash
npm test -- src/lib/damageAdapter.test.ts
```

对 catalog、SP 公式、Mega 特性、天气、场地或保护逻辑做改动时，应同时运行完整 `npm test`。
