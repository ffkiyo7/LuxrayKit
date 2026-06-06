# 下一轮开发计划

更新时间：2026-06-06

## 目标

把环境优先重构分支从“首阶段 PokeDB snapshot 可用”推进到“真实环境数据可持续刷新并稳定迭代”：

- 完成环境 / 队伍 / 工具 / 我的四入口的信息架构收尾。
- 更新 PWA 离线和移动端视觉回归，避免旧 5 Tab 测试继续误报。
- 保持伤害计算、速度线和图鉴作为工具页二级能力稳定可用。
- 基于已完成的 `EnvironmentDataset` schema、audit 入口、PokeDB Open Data 转换器和首轮主包拆分，继续补齐自动刷新、招式统计、队报链接样本维护和快照加载方式。

## 优先级

### P0：环境优先分支收尾

- 保留环境作为默认首页。
- 确认环境首页只突出宝可梦榜和上位构筑，不加入“我的队伍对照”、全局道具榜或全局招式榜。
- 完整宝可梦榜点击 Pokémon 进入环境详情，不跳传统图鉴页。
- 宝可梦环境详情继续按常用招式、携带道具、常见队友、相关上位构筑组织。
- 上位构筑导入后跳队伍列表并高亮，不直接进入详情。

### P0：PWA 与视觉回归

- 更新 `tests/pwa/offline.spec.ts` 到 4 Tab 路径：环境、队伍、工具、我的。
- 更新 `tests/pwa/visual.spec.ts` 到环境优先主路径，并删除旧 5 Tab 截图基线。
- 运行 `npm run test:pwa`，确认离线、队伍持久化、benchmark 收藏和移动端截图全部通过。
- 视觉截图变更需要人工快速扫一遍，重点看环境首页、宝可梦环境详情、队伍详情和我的页。

### P1：真实环境数据接入深化

- `EnvironmentDataset` 已成为环境页唯一数据包入口；后续抓取结果必须先转换为该结构。
- 所有环境数据必须通过 `auditEnvironmentDataset`，未知 Pokémon / 招式 / 道具引用不得静默进入 UI。
- 当前已接入 PokeDB 独立 JSON snapshot：Open Data 可稳定获得 Pokémon 样本出现率、携带道具占比、常见队友占比和队伍骨架；详情页解析可获得前 50 Pokémon 的真实 `moveStats`；trainer/list 解析可获得单打 24 条 / 双打 19 条真实队报链接样本。
- Open Data 暂不包含训练家名、队报链接、性格、SP 和完整招式配置；训练家名 / 队报链接目前来自 trainer/list 页面解析，性格 / SP / 完整招式配置仍不能在 UI 中伪造。
- 对真实抓取数据建立 snapshot 与 audit 测试，避免无法识别 Pokémon、规则不匹配或字段缺失时静默写入坏数据。
- 维护脚本已接入：`npm run data:pokedb:environment:check` 用于只读校验远端是否有更新，`npm run data:pokedb:environment` 用于写入本地 snapshot。
- 2026-06-06 已修复维护脚本在 Windows 工作区因 CRLF / LF 换行差异误判 snapshot stale 的问题；后续 stale 应优先视为真实数据或生成逻辑变化。
- 继续增强维护脚本输出：后续可追加更大范围的招式统计解析和更细的快照变更摘要。队报原文标题 / 完整配置解析暂缓，除非后续重新确认投入产出比。
- 字段缺失但队伍骨架可识别时允许导入；只自动填普通 Pokémon / 道具 / 原形态单一特性。即使道具是 Mega Stone，也先显示原宝可梦，Mega 形态由用户在成员编辑页确认，并提示用户继续补全配置。
- 数据文案保持“上位构筑快照 / 样本占比”，不写成“官方使用率”或“全环境使用率”。
- 环境 snapshot 已从主 bundle 拆成独立缓存文件；2026-06-06 已完成首轮规则 catalog / 工具页拆分，入口 JS 降至约 216 KB 且 Vite chunk warning 已消除。后续体积优化应转向更细的数据索引、按需数据子集或服务端定时产物。

### P1：工具能力稳定

- 工具首页只保留伤害计算、速度线计算、规则图鉴三个并列入口。
- 从队伍带入配置保留在具体工具内部，不在工具首页放说明模块。
- 继续交叉验证伤害计算公式与典型样例。
- Champions 新增 Mega 的 stats/types/abilities/sprite 已接入；下一步聚焦新增特性与 Mega 交互是否影响伤害、属性或状态结论。
- 补齐 Champions 特有招式 / 特性 / 道具对伤害的影响。
- 设计 Reg registry，避免未来规则切换散改数据入口。

## 验收标准

- `npm test` 通过。
- `npm run build` 通过。
- `npm run test:pwa` 通过。
- 触及视觉时同步更新 snapshot，并在 `docs/qa/MOBILE_VISUAL_REGRESSION.md` 记录覆盖范围。
- 伤害输出继续标记 experimental，不写成官方 Champions 正式结论。
- 临时计算配置不得写回队伍或 IndexedDB。
