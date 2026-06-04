# Pokemon Champions Tool 开发进度

更新时间：2026-06-04

当前阶段：**环境优先重构分支已跑通主信息架构：默认进入环境页，队伍页列表优先，伤害计算 / 速度线 / 图鉴收束到工具页，我的页承接偏好、备份与缓存管理。环境页当前用“开发预览 / 开发样例”轻量标识占位数据，真实环境数据接入前不包装成真实使用率或高分统计。**

## 当前验证

- `npm test`：2026-06-03 通过，12 个测试文件，114 个用例。
- `npm run build`：2026-06-03 通过。
- 伤害计算人工复核 fixtures：已建立首批 5 组，覆盖基础物理、天气特攻、非伤害道具、免疫特性、增伤特性。
- `npm run test:pwa`：2026-06-03 通过，2 个 Playwright 用例覆盖离线与移动端视觉 smoke。
- `npm run test:visual`：已重录环境优先 smoke 路径基线，覆盖环境首页、完整榜单、宝可梦环境详情、队伍列表 / 详情 / 成员编辑、工具页、计算、速度线、图鉴和我的页。
- 构建存在 Vite chunk size warning，仅为体积提示，不影响功能正确性。

## 已完成能力

- React + Vite + TypeScript + Tailwind 的移动端 PWA 壳。
- 底部 4 Tab：环境、队伍、工具、我的。
- IndexedDB 本地存储与 v2 迁移，支持队伍、偏好、benchmark 收藏。
- 环境首页：单打 / 双打切换、宝可梦榜、开发样例队伍、队报链接、导入配置，并以轻量文案标识开发预览状态。
- 完整宝可梦榜：从环境首页进入，点击 Pokémon 进入环境详情，而不是跳传统图鉴页。
- 宝可梦环境详情：展示常用招式、携带道具、常见队友和相关样例队伍，并支持从相关队伍导入配置。
- 环境样例导入：生成本地队伍副本，保留来源 metadata，跳转队伍列表并高亮新导入队伍；当前导入标签为“样例导入”。
- Reg M-A 规则元信息、官方 allowlist、Mega allowlist shell 和数据版本展示。
- 213 只当前规则 Pokémon：181 基础形态 + 32 地区 / 特殊形态。
- 35 个旧主系列 Mega 形态已具备 stats/types/abilities/sprite/Mega Stone 映射；Champions 新 Mega 保留 shell，不伪造战斗字段。
- 539 个当前规则招式与 13387 条 Pokémon-learnset 关系。
- 117 个当前规则候选道具与本地道具图片快照。
- 25 个性格、当前 catalog 特性中文名 / 中文说明、形态级特性拥有者映射。
- TeamPage 队伍列表优先；队伍卡片统一提供编辑配置和生成图片；队伍详情不再展示来源卡、队报链接、伤害计算 / 速度线快捷入口。
- TeamPage 队伍成员编辑：性格、特性、道具、招式、形态、Champions SP picker。
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
- 环境页的占比、队伍数、常用招式、携带道具、常见队友和样例队伍仍是本地 seed 占位，不代表真实使用率或真实高分样本。

## 下一轮重点

详见 `docs/progress/NEXT_ROUND_PLAN.md`。优先级：

1. 完成环境优先分支的 PWA / 视觉回归更新，并确认所有基线截图。
2. 继续接入和审计真实环境数据来源，优先验证使用率、常用招式、携带道具和高分队伍样本的可获得性；接入前保持开发样例标识。
3. 保持伤害计算、速度线和图鉴作为工具页二级入口的稳定性，避免工具首页重新堆说明模块。
4. 继续交叉验证伤害计算公式与典型样例。
5. 补齐 Champions 特有招式 / 特性 / 道具对伤害的影响。
6. 设计 Reg registry，避免未来规则切换散改数据入口。

## 文档索引

- 产品范围：`docs/product/Pokemon Champions PRD.md`
- 下一轮计划：`docs/progress/NEXT_ROUND_PLAN.md`
- 伤害引擎结论：`docs/research/CALC_ENGINE_SPIKE.md`
- 机制边界：`docs/research/MECHANICS_RESEARCH.md`
- 数据来源策略：`docs/research/DATA_SOURCE_RESEARCH.md`
- PWA 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 移动端视觉回归：`docs/qa/MOBILE_VISUAL_REGRESSION.md`
