# 下一轮开发计划

更新时间：2026-05-06

## 目标

把当前“可用的实验性计算器”推进到“可信的 Champions 助手”：

- 继续提升伤害计算准确性。
- 保持移动端计算流程清晰。
- 补齐数据缺口，但不伪造未确认字段。

## 优先级

### P0：伤害计算可信度

- 建立一组人工可复核样例：常见攻击方、防守方、性格、SP、天气、道具、特性。
- 对照 Gen9 主线公式、`@smogon/calc` 输出和项目 adapter 输出，定位差异。
- 继续把 Champions 已知招式改动映射进本地数据。
- 扫描当前已接入特性，补齐会改变伤害、无效化招式、修改威力或修改能力值的效果。
- 结果卡只展示实际参与计算的修正胶囊。

### P0：CalculatorPage 体验

- 保持进攻方 / 防守方摘要卡简洁：头像、名称、属性、性格、特性、道具。
- 搜索 Pokémon 与队伍导入保留在当前激活侧卡片内。
- 能力配置折叠面板承载 SP、能力阶级、形态、招式、道具、特性等细节。
- 移动端避免解释文字堆叠，不展示临时来源、等级、SP 摘要等噪声。

### P1：数据补齐

- 继续补齐 24 个 Champions 新 Mega 的 stats/types/abilities/sprite/Mega Stone 映射；缺源时保留 shell。
- 对 move power / target / category 做增量审计，尤其是 Champions 改动招式。
- 保持所有新增数据有 `sourceRefs` 或明确的 `manual-review` 标记。

### P1：规则架构

- 设计 Reg registry 草案，承载 rule id、版本、时间、allowlist、item pool、Mega pool。
- 不在本轮实现 Reg M-B 数据，但避免继续把 Reg M-A 写死到页面逻辑中。

## 验收标准

- `npm test` 通过。
- `npm run build` 通过。
- 触及移动端视觉时运行 `npm run test:visual`。
- 触及 PWA / 缓存 / IndexedDB 时运行 `npm run test:pwa`。
- 伤害输出继续标记 experimental，不写成官方 Champions 正式结论。
- 临时计算配置不得写回队伍或 IndexedDB。
