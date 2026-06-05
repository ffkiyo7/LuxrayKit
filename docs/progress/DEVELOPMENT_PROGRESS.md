# Pokemon Champions Tool 开发进度

更新时间：2026-06-05

当前阶段：**环境优先重构分支已跑通主信息架构，并完成第一阶段真实环境数据接入：默认进入环境页，环境页从独立 JSON 缓存资源读取 PokeDB Season 1 单打 / 双打 Open Data snapshot，队伍页列表优先，伤害计算 / 速度线 / 图鉴收束到工具页，我的页承接偏好、备份与缓存管理。当前环境数据表达为“上位构筑快照 / 样本占比”，不包装成官方完整使用率。**

## 当前验证

- `npm test`：2026-06-05 通过，16 个测试文件，135 个用例。
- `npm run build`：2026-06-05 通过。
- 伤害计算人工复核 fixtures：已建立首批 5 组，覆盖基础物理、天气特攻、非伤害道具、免疫特性、增伤特性。
- `npm run test:pwa`：2026-06-05 通过，2 个 Playwright 用例覆盖离线与移动端视觉 smoke。
- `npm run test:visual`：2026-06-05 已重录环境真实快照 smoke 路径基线，覆盖环境首页、完整榜单、宝可梦环境详情、队伍列表 / 详情 / 成员编辑、工具页、计算、速度线、图鉴和我的页。
- 构建仍存在 Vite chunk size warning；环境 snapshot 已拆为独立 JSON 缓存资源，主 JS 从约 2.13 MB 降到约 1.47 MB，但完整 app、规则 catalog 与图鉴数据仍在主包内。

## 已完成能力

- React + Vite + TypeScript + Tailwind 的移动端 PWA 壳。
- 底部 4 Tab：环境、队伍、工具、我的。
- IndexedDB 本地存储与 v2 迁移，支持队伍、偏好、benchmark 收藏。
- 环境首页：单打 / 双打切换、宝可梦榜、上位构筑卡片、换一批、队报链接、导入配置，并标注 PokeDB 上位构筑快照来源。
- PokeDB Open Data 接入：内置 `s1_single_ranked_teams.json` 与 `s1_double_ranked_teams.json`，当前快照分别包含 528 / 71 支队伍。
- PokeDB 转换器：把 PokeDB Pokémon key 映射到本地 Reg M-A Pokémon id，计算样本出现率、队伍数、当前宝可梦携带道具占比和常见队友占比。
- PokeDB 维护脚本：新增 `npm run data:pokedb:environment:check` 与 `npm run data:pokedb:environment`，可下载 Open Data、解析前 50 Pokémon 详情页招式统计、解析 trainer/list 真实队报样本、校验 payload、报告未知 Pokémon / 未映射道具 / 失效 item id / 未映射 move key，并在干净时写入本地 snapshot。
- 环境数据包：`EnvironmentDataset` schema 和 audit 入口已成为环境页唯一数据入口；UI 读取的是通过审计后的环境榜单与队伍样例。
- 环境审计：未知 Pokémon / 招式 / 道具引用会被报告并从 UI 数据中剔除；规则版本、数据版本、使用率、队伍数和引用统计字段会在导入前校验。
- 完整宝可梦榜：从环境首页进入，点击 Pokémon 进入环境详情，而不是跳传统图鉴页。
- 宝可梦环境详情：展示常用招式、携带道具、常见队友和相关上位构筑，并支持从相关队伍导入配置；常用招式来自 PokeDB 详情页 `data-move-detail`，当前覆盖单打 / 双打各前 50 Pokémon。
- 上位构筑导入：生成本地队伍副本，保留来源 metadata，按样本标题命名，跳转队伍列表并高亮新导入队伍；队伍列表不展示“上位构筑导入 / 当前”等来源标签，详情页不显示来源卡或队报入口。
- 上位构筑首次导入提示：用户第一次点击“导入配置”时会先看到一次轻量提示，说明当前可稳定带入 Pokémon 和道具，性格、SP、完整配招等需要通过队报链接或手动编辑确认；用户继续导入后，该提示写入本地偏好，后续导入不再重复打断。
- 上位构筑导入字段边界：PokeDB Open Data 快照目前只能稳定拿到队伍槽位的 Pokémon 与道具；导入时保持普通 Pokémon 形态，即使道具是 Mega Stone 也不自动切到 Mega 形态，Mega 形态由用户在成员编辑页确认。只有原形态单一特性会自动填入，其余性格、SP、普通多特性与完整配招不再伪造，导入后标记为需手动确认。PokeDB Pokémon 详情页可解析聚合的常用招式、性格、SP 分布，但不能反推某一支样本队伍的原作者完整配置。
- Reg M-A 规则元信息、官方 allowlist、Mega allowlist shell 和数据版本展示。
- 213 只当前规则 Pokémon：181 基础形态 + 32 地区 / 特殊形态。
- 35 个旧主系列 Mega 形态已具备 stats/types/abilities/sprite/Mega Stone 映射；Champions 新 Mega 保留 shell，不伪造战斗字段。
- 539 个当前规则招式与 13387 条 Pokémon-learnset 关系。
- 117 个当前规则候选道具与本地道具图片快照。
- 25 个性格、当前 catalog 特性中文名 / 中文说明、形态级特性拥有者映射。
- TeamPage 队伍列表优先；队伍卡片统一提供编辑配置和生成图片，并支持列表内二次确认删除与按住拖动把手排序；队伍详情不再展示来源卡、队报链接、伤害计算 / 速度线快捷入口。
- TeamPage 队伍成员卡片：展开态展示类似 Champions 状态卡的能力值 / SP 双列信息；成员编辑支持性格、特性、道具、招式、形态、Champions SP picker。
- 队伍分享图：默认黑底 2x3 分享图，包含队伍名称、成员配置和生成时间戳，结果层只提供保存图片。
- 速度线：基于 Champions SP v1 的速度计算、Mega 形态、benchmark、收藏。
- CalculatorPage：攻击方 / 防守方独立临时配置，支持从图鉴搜索或队伍导入，不写回队伍 / IndexedDB。
- CalculatorPage 能力配置：性格 select、特性、道具、招式搜索、SP picker、能力阶级、形态。
- damageAdapter：使用 Gen9 主线公式近似，接入 Champions SP、能力阶级、单双打、天气、场地、属性、本系、重要特性与道具修正；实际改变伤害的道具会进入结果胶囊。
- damageAdapter：Pixilate / Liquid Voice 等会改变招式属性的特性，会同步修正结果卡的克制、本系、天气和特性胶囊。
- 结果卡：展示伤害范围、百分比、结论、一确 / 二确概率、关键修正胶囊；不再展示阻断式旧文案。
- damageAdapter：首批人工可复核样例已进入测试，固定完整 16 档 roll 与关键倍率 / 胶囊。
- 工具页：聚合伤害计算、速度线计算、规则图鉴三个并列入口，不展示当前规则入口或队伍配置带入说明模块。
- 我的页：主题切换、本地备份 JSON 导出 / 导入、离线缓存说明、清除本地数据；不展示本地队伍数 / 收藏数概览。
- 全局主题：我的页浅色 / 深色切换已启用，页面 token 覆盖核心模块。
- DexPage：Pokémon 列表重排为头像 + 图鉴编号 + 中 / 日 / 英名称 + 属性；详情页重排为头像、身高体重、特性、种族值、属性关系、learnset。
- DexPage：属性关系按弱点、抵抗 / 免疫分组，暗色模式下抵抗 / 免疫提升可读性；招式 catalog 与 learnset 均支持属性筛选。
- DexPage：身高 / 体重使用缓存 PokeAPI 主系列数据，并写入本地 seed 映射。

## 当前边界

- 伤害计算仍是 **experimental mainline approximation**：主线 Gen9 公式 + Champions 数据 / SP 适配，不是官方 Champions 正式公式声明。
- Champions 特有招式威力、特性、道具、Mega 交互仍需继续补齐和交叉验证。
- 24 个 Champions 新 Mega 仍缺少可安全写入的战斗字段。
- 中文说明与部分社区来源存在授权边界，公开分发前需要确认署名 / 非商业 / 相同方式共享要求。
- Reg M-B / 后续规则切换尚未实现。
- 环境数据当前来自 PokeDB Open Data 独立 JSON snapshot，代表上位构筑样本，不代表官方完整环境使用率。
- PokeDB Open Data 不包含完整配置招式、训练家名、队报链接或样本登记时间；训练家名与队报链接已通过 trainer/list 页面解析生成当前单打 24 条、双打 19 条上位构筑样本。PokeDB Pokémon 详情页能提供聚合的常用招式 / 性格 / SP 分布。逐站点解析队报原文来补全配置的需求已暂缓，不应在首版导入能力中承诺每支队伍都能精准还原。
- 当前 PokeDB snapshot 已从前端主 bundle 拆为 `public/data/pokedb/reg-ma-s1-environment.json`，由 service worker 预缓存；后续若继续扩容，应优先考虑服务端定时产物和增量 diff。

## 下一轮重点

详见 `docs/progress/NEXT_ROUND_PLAN.md`。优先级：

1. 继续拆分主包内的规则 catalog / 图鉴页面数据，降低剩余 Vite chunk warning。
2. 继续交叉验证伤害计算公式与典型样例，补齐 Champions 特有招式 / 特性 / 道具对伤害的影响。
3. 设计 Reg registry，避免未来规则切换散改数据入口。
4. 外部队报原文解析暂缓：后续仅在投入产出比重新确认后，再评估逐站点解析完整配置或寻找稳定提供性格、SP、完整配招的来源。

## 文档索引

- 产品范围：`docs/product/Pokemon Champions PRD.md`
- 下一轮计划：`docs/progress/NEXT_ROUND_PLAN.md`
- 伤害引擎结论：`docs/research/CALC_ENGINE_SPIKE.md`
- 机制边界：`docs/research/MECHANICS_RESEARCH.md`
- 数据来源策略：`docs/research/DATA_SOURCE_RESEARCH.md`
- PWA 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 移动端视觉回归：`docs/qa/MOBILE_VISUAL_REGRESSION.md`
