# 数据来源策略

更新时间：2026-05-06

## 当前数据状态

- Regulation Set M-A 元信息与 allowlist 来自官方页面。
- Pokémon catalog 已覆盖当前规则 213 只 Pokémon。
- 35 个旧主系列 Mega 形态已接入；24 个 Champions 新 Mega 仍保留 shell。
- 当前规则招式 catalog 与 learnset 已覆盖 213 只 Pokémon。
- 当前规则道具候选池 117 个，本地保存道具图片快照。
- 性格、特性、中文名、说明和拥有者映射已接入当前 catalog。

## 来源优先级

1. 官方 Pokémon HOME / Champions 页面：规则、时间、允许列表、Mega 允许列表。
2. PokeAPI：结构化 Pokémon/form、名称、属性、种族值、sprite/artwork 引用。
3. PokéBase Champions：当前规则招式、learnset、道具图片快照。
4. 52poke / Bulbapedia 等社区资料：中文名、说明、机制交叉参考，仅在保留来源和授权风险说明时使用。
5. 人工样例：用于计算交叉验证，必须记录版本、配置和观察日期。

## 数据写入规则

- 新增 seed row 必须有 `sourceRefs` 或明确 `manual-review`。
- 不确定的 Champions 新 Mega 不写 stats/types/ability/sprite。
- 不复制大段官方或社区描述，前端使用简短项目化说明。
- 图片资源优先使用本地快照或可接受的稳定 URL，并保留来源。
- 数据导入后必须经过 audit 测试。

## 授权边界

- Pokémon 名称、角色形象、官方描述和图片都属于高敏感资源。
- 当前项目为自用工具场景，若公开分发，需要重新确认社区资料和图片来源的许可。
- 52poke 等 CC BY-NC-SA 来源不能无条件进入商业或闭源分发。

## 后续数据工作

- 补齐 Champions 新 Mega 的可靠战斗字段。
- 对 Champions 改动招式建立增量清单。
- 对影响伤害的特性 / 道具建立审计清单。
- 为未来 Reg M-B 做 registry，而不是复制 Reg M-A 文件结构。
