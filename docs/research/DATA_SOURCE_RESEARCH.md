# 数据来源策略

更新时间：2026-06-06

## 当前数据状态

- Regulation Set M-A 元信息与 allowlist 来自官方页面。
- Pokémon catalog 已覆盖当前规则 213 只 Pokémon。
- 59 个 Reg M-A Mega 形态已接入；24 个 Champions 新增 Mega 的 stats/types/abilities/sprite 来自 PokéBase Champions Pokémon 页面。
- 当前规则招式 catalog 与 learnset 已覆盖 213 只 Pokémon。
- 当前规则道具候选池 117 个，本地保存道具图片快照。
- 性格、特性、中文名、说明和拥有者映射已接入当前 catalog。
- 图鉴身高 / 体重已从缓存 PokeAPI Pokémon 端点抽取为本地 `physicalMetrics` seed 映射，单位保持 PokeAPI 的 dm / hg 并在前端格式化为 m / kg。
- 环境页已新增 `EnvironmentDataset` schema 与审计入口；当前默认从 `public/data/pokedb/reg-ma-s1-environment.json` 加载 PokeDB Open Data 独立缓存快照，开发 seed 仅作为加载或审计失败回退。
- PokeDB snapshot 当前包含 Season 1 单打 528 队、双打 71 队；可稳定计算 Pokémon 样本出现率、携带道具占比和常见队友占比。
- PokeDB Open Data 不包含训练家名、队报链接、性格、SP、完整招式配置和样本登记时间；招式使用率通过维护脚本额外解析 Pokémon 详情页 `data-move-detail`，当前覆盖单打 / 双打各前 50 Pokémon。Pokémon 详情页还暴露聚合的性格、特性、携带道具与能力点 / SP 分布，但这些都是“这只 Pokémon 的环境分布”，不是某支样本队伍的原作者配置。队报链接和训练家名来自 PokeDB trainer/list 页面解析，当前保留单打 24 条、双打 19 条完整队伍骨架样本。

## 来源优先级

1. 官方 Pokémon HOME / Champions 页面：规则、时间、允许列表、Mega 允许列表。
2. PokeAPI：结构化 Pokémon/form、名称、属性、种族值、身高、体重、sprite/artwork 引用。
3. PokéBase Champions：当前规则招式、learnset、道具图片快照、Champions 新增 Mega 形态战斗字段与图片快照。
4. 52poke / Bulbapedia 等社区资料：中文名、说明、机制交叉参考，仅在保留来源和授权风险说明时使用。
5. PokeDB / PkmnChamps Open Data：上位构筑样本统计与队伍骨架，进入 UI 前必须转换为 `EnvironmentDataset` 并审计。
6. 人工样例：用于计算交叉验证或首批队报链接补充，必须记录版本、配置、链接和观察日期。

## 数据写入规则

- 新增 seed row 必须有 `sourceRefs` 或明确 `manual-review`。
- 不确定或缺少明确页面来源的 Champions 新 Mega 字段不得写入；已写入字段必须保留 `pokebase-champions-mega-data` 或等价 sourceRef。
- 不复制大段官方或社区描述，前端使用简短项目化说明。
- 图片资源优先使用本地快照或可接受的稳定 URL，并保留来源。
- PokeAPI 身高 / 体重仅作为主系列图鉴展示数据；地区形态、Mega 形态或 Champions 新 Mega 若缺少明确字段，不推断或伪造专属数值。
- 数据导入后必须经过 audit 测试。
- 环境数据必须先转换为 `EnvironmentDataset`，再通过 `auditEnvironmentDataset`；未知 Pokémon / 招式 / 道具引用必须报告并从 UI 数据中剔除。
- 真实环境抓取结果先落本地 snapshot，审计通过后才能成为默认环境数据。
- Open Data 中不存在的字段不得伪造为统计结果；常用招式必须来自 PokeDB 详情页解析后的 `moveStats`，队报链接必须来自 trainer/list 或人工明确补充。上位构筑导入只能自动填入可确定的普通 Pokémon / 道具 / 原形态单一特性；即使道具是 Mega Stone，也不自动把本地队伍成员切到 Mega 形态，Mega 形态由用户在成员编辑页确认。不能用聚合招式统计、聚合性格、聚合 SP 或默认配置冒充原队配置。
- PokeDB 页面参数需要显式映射：当前 `rule=2` 是单打，`rule=1` 是双打，不得按数字顺序猜测。
- 环境文案使用“上位构筑快照 / 样本占比”，避免“官方使用率 / 全环境使用率”等过度承诺。
- PokeDB Open Data 更新必须通过 `npm run data:pokedb:environment` 写入；写入前脚本会校验 payload 结构，并报告未知 Pokémon key、未映射日文道具名、映射到不存在本地 catalog 的 item id 和未映射 move key。

## 授权边界

- Pokémon 名称、角色形象、官方描述和图片都属于高敏感资源。
- 当前项目为自用工具场景，若公开分发，需要重新确认社区资料和图片来源的许可。
- 52poke 等 CC BY-NC-SA 来源不能无条件进入商业或闭源分发。

## 后续数据工作

- 对 Champions 新增 Mega 的新增特性与 Mega 交互建立战斗样例验证清单。
- 对 Champions 改动招式建立增量清单。
- 对影响伤害的特性 / 道具建立审计清单。
- 为图鉴身高 / 体重补充 sourceRefs / audit 脚本输出，降低未来重新生成时的漂移风险。
- 将 PokeDB Open Data 维护脚本接入定期流程，并补充更细的 snapshot diff 摘要。
- 扩大 PokeDB 宝可梦详情页招式统计覆盖范围，或改为按需缓存。
- 扩展队报样本来源：trainer/list 解析已扩展为单打 24 条、双打 19 条；后续如果要还原完整配置，需要针对 Pokesol、Hatena、note、Yakkun 等外链逐站点解析队报原文，并为每支队伍标记解析置信度 / 缺失字段，不能把该能力视为稳定全量来源。
- 环境 snapshot 已从主 bundle 拆分为独立 JSON 缓存资源；后续体积工作转向页面代码拆分、规则 catalog 拆分和更细的 snapshot diff 摘要。
- 为未来 Reg M-B 做 registry，而不是复制 Reg M-A 文件结构。
