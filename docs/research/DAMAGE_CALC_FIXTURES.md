# Damage Calc Manual Review Fixtures

更新时间：2026-05-06

这些样例用于把当前伤害计算从“能跑”推进到“可复核”。它们固定了常见攻防配置、Champions SP、天气、道具和特性，并在 `src/lib/damageAdapter.test.ts` 中断言完整 16 档 roll。

当前口径仍是 **experimental mainline approximation**：`@smogon/calc` Gen9 主线公式 + 项目 Champions move catalog + Champions SP v1。

## Fixtures

| 样例 | 关键变量 | 期望输出 |
| --- | --- | --- |
| Garchomp Dragon Claw vs bulky Torkoal | 双打、单体招式、爽朗 32 Atk / 32 Spe / 2 HP，慎重 Torkoal 32 HP / 17 Def / 17 SpD | 48-57，27.1%-32.2%，无能力胶囊 |
| Rain Hydro Pump Blastoise vs specially bulky Torkoal | 单打、雨天、水本、克制，内敛 Blastoise 32 SpA / 2 HP，慎重 Torkoal 32 HP / 32 SpD / 2 Def | 212-252，119.8%-142.4%，天气倍率 1.5 |
| Choice Scarf Garchomp Earthquake vs Houndoom | 单打、地面本、克制、讲究围巾只改速度不改伤害 | 320-380，213.3%-253.3%，无道具伤害胶囊 |
| Flash Fire Arcanine immunity vs Houndoom Flare Blitz | 单打、火招式打引火 Arcanine | 0，显示“防守特性：引火 / 火属性招式无效” |
| Technician Scizor Bullet Punch vs Houndoom | 单打、技术高手、低威力本系招式、抵抗 | 48-57，32%-38%，显示“进攻特性：技术高手 / 低威力招式增强” |

## 维护规则

- 新增或修改 adapter 计算变量时，同步增加或调整这里的人工样例。
- 修改 roll 期望值前，先说明差异来源：公式适配、move catalog、SP 公式、特性/道具实现，或 `@smogon/calc` 升级。
- 这些样例不是官方 Champions 公式声明，只是当前实验性主线近似的回归锚点。
