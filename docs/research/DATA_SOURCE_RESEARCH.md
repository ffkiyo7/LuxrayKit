# 数据来源策略

更新时间：2026-06-05

## 当前数据状态

- Regulation Set M-A 元信息与 allowlist 来自官方页面。
- Pokémon catalog 已覆盖当前规则 213 只 Pokémon。
- 35 个旧主系列 Mega 形态已接入；24 个 Champions 新 Mega 仍保留 shell。
- 当前规则招式 catalog 与 learnset 已覆盖 213 只 Pokémon。
- 当前规则道具候选池 117 个，本地保存道具图片快照。
- 性格、特性、中文名、说明和拥有者映射已接入当前 catalog。
- 图鉴身高 / 体重已从缓存 PokeAPI Pokémon 端点抽取为本地 `physicalMetrics` seed 映射，单位保持 PokeAPI 的 dm / hg 并在前端格式化为 m / kg。
- 环境页已新增 `EnvironmentDataset` schema 与审计入口；当前默认读取 PokeDB Open Data bundled snapshot，开发 seed 仅作为审计失败回退。
- PokeDB snapshot 当前包含 Season 1 单打 528 队、双打 71 队；可稳定计算 Pokémon 样本出现率、携带道具占比和常见队友占比。
- PokeDB Open Data 不包含招式使用率、训练家名、队报链接、完整招式配置和样本登记时间；这些字段需要额外页面解析、人工补充或后续服务端产物。

## 来源优先级

1. 官方 Pokémon HOME / Champions 页面：规则、时间、允许列表、Mega 允许列表。
2. PokeAPI：结构化 Pokémon/form、名称、属性、种族值、身高、体重、sprite/artwork 引用。
3. PokéBase Champions：当前规则招式、learnset、道具图片快照。
4. 52poke / Bulbapedia 等社区资料：中文名、说明、机制交叉参考，仅在保留来源和授权风险说明时使用。
5. PokeDB / PkmnChamps Open Data：上位构筑样本统计与队伍骨架，进入 UI 前必须转换为 `EnvironmentDataset` 并审计。
6. 人工样例：用于计算交叉验证或首批队报链接补充，必须记录版本、配置、链接和观察日期。

## 数据写入规则

- 新增 seed row 必须有 `sourceRefs` 或明确 `manual-review`。
- 不确定的 Champions 新 Mega 不写 stats/types/ability/sprite。
- 不复制大段官方或社区描述，前端使用简短项目化说明。
- 图片资源优先使用本地快照或可接受的稳定 URL，并保留来源。
- PokeAPI 身高 / 体重仅作为主系列图鉴展示数据；地区形态、Mega 形态或 Champions 新 Mega 若缺少明确字段，不推断或伪造专属数值。
- 数据导入后必须经过 audit 测试。
- 环境数据必须先转换为 `EnvironmentDataset`，再通过 `auditEnvironmentDataset`；未知 Pokémon / 招式 / 道具引用必须报告并从 UI 数据中剔除。
- 真实环境抓取结果先落本地 snapshot，审计通过后才能成为默认环境数据。
- Open Data 中不存在的字段不得伪造为统计结果；当前未接入真实招式统计时，环境详情页不展示“常用招式”榜。
- 环境文案使用“上位构筑快照 / 样本占比”，避免“官方使用率 / 全环境使用率”等过度承诺。

## 授权边界

- Pokémon 名称、角色形象、官方描述和图片都属于高敏感资源。
- 当前项目为自用工具场景，若公开分发，需要重新确认社区资料和图片来源的许可。
- 52poke 等 CC BY-NC-SA 来源不能无条件进入商业或闭源分发。

## 后续数据工作

- 补齐 Champions 新 Mega 的可靠战斗字段。
- 对 Champions 改动招式建立增量清单。
- 对影响伤害的特性 / 道具建立审计清单。
- 为图鉴身高 / 体重补充 sourceRefs / audit 脚本输出，降低未来重新生成时的漂移风险。
- 将 PokeDB Open Data 更新流程脚本化：下载、校验、未知 item name 差异报告、生成 snapshot、跑 audit。
- 解析 PokeDB 宝可梦详情页的招式统计，映射为 `moveStats` 后再恢复“常用招式”模块。
- 扩展队报样本来源：Open Data 只提供队伍骨架，外部队报链接需要来自 trainer/list 页面解析或人工补充。
- 评估环境 snapshot 从主 bundle 拆分为独立缓存资源，降低首包体积。
- 为未来 Reg M-B 做 registry，而不是复制 Reg M-A 文件结构。
