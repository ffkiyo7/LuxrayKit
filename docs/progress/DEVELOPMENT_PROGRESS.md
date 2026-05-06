# Pokemon Champions Tool 开发进度

更新时间：2026-05-06

当前阶段：**移动端 PWA MVP 已可用，真实 Reg M-A 数据与实验性伤害计算已接入，重点进入计算准确性、数据补齐和 UI 收敛。**

## 当前验证

- `npm test`：通过，11 个测试文件，93 个用例。
- `npm run build`：通过。
- 伤害计算人工复核 fixtures：已建立首批 5 组，覆盖基础物理、天气特攻、非伤害道具、免疫特性、增伤特性。
- `npm run test:pwa` / `npm run test:visual`：仍作为 PWA 与移动端视觉回归命令保留，使用本机 Chrome channel。
- 构建存在 Vite chunk size warning，仅为体积提示，不影响功能正确性。

## 已完成能力

- React + Vite + TypeScript + Tailwind 的移动端 PWA 壳。
- 底部 5 Tab：组队、计算、速度线、图鉴、设置。
- IndexedDB 本地存储与 v2 迁移，支持队伍、偏好、benchmark 收藏。
- Reg M-A 规则元信息、官方 allowlist、Mega allowlist shell 和数据版本展示。
- 213 只当前规则 Pokémon：181 基础形态 + 32 地区 / 特殊形态。
- 35 个旧主系列 Mega 形态已具备 stats/types/abilities/sprite/Mega Stone 映射；Champions 新 Mega 保留 shell，不伪造战斗字段。
- 539 个当前规则招式与 13387 条 Pokémon-learnset 关系。
- 117 个当前规则候选道具与本地道具图片快照。
- 25 个性格、当前 catalog 特性中文名 / 中文说明、形态级特性拥有者映射。
- TeamPage 队伍成员编辑：性格、特性、道具、招式、形态、Champions SP picker。
- 速度线：基于 Champions SP v1 的速度计算、Mega 形态、benchmark、收藏。
- CalculatorPage：攻击方 / 防守方独立临时配置，支持从图鉴搜索或队伍导入，不写回队伍 / IndexedDB。
- CalculatorPage 能力配置：性格 select、特性、道具、招式搜索、SP picker、能力阶级、形态。
- damageAdapter：使用 Gen9 主线公式近似，接入 Champions SP、能力阶级、单双打、天气、场地、属性、本系、重要特性与道具修正。
- 结果卡：展示伤害范围、百分比、结论、一确 / 二确概率、关键修正胶囊；不再展示阻断式旧文案。
- damageAdapter：首批人工可复核样例已进入测试，固定完整 16 档 roll 与关键倍率 / 胶囊。

## 当前边界

- 伤害计算仍是 **experimental mainline approximation**：主线 Gen9 公式 + Champions 数据 / SP 适配，不是官方 Champions 正式公式声明。
- Champions 特有招式威力、特性、道具、Mega 交互仍需继续补齐和交叉验证。
- 24 个 Champions 新 Mega 仍缺少可安全写入的战斗字段。
- 中文说明与部分社区来源存在授权边界，公开分发前需要确认署名 / 非商业 / 相同方式共享要求。
- Reg M-B / 后续规则切换尚未实现。

## 下一轮重点

详见 `docs/progress/NEXT_ROUND_PLAN.md`。优先级：

1. 继续交叉验证伤害计算公式与典型样例。
2. 补齐 Champions 特有招式 / 特性 / 道具对伤害的影响。
3. 收敛 CalculatorPage 移动端视觉和交互细节。
4. 补齐剩余 Champions 新 Mega 数据，缺失时继续保持 shell。
5. 设计 Reg registry，避免未来规则切换散改数据入口。

## 文档索引

- 产品范围：`docs/product/Pokemon Champions PRD.md`
- 下一轮计划：`docs/progress/NEXT_ROUND_PLAN.md`
- 伤害引擎结论：`docs/research/CALC_ENGINE_SPIKE.md`
- 机制边界：`docs/research/MECHANICS_RESEARCH.md`
- 数据来源策略：`docs/research/DATA_SOURCE_RESEARCH.md`
- PWA 离线验收：`docs/qa/PWA_OFFLINE_CHECKLIST.md`
- 移动端视觉回归：`docs/qa/MOBILE_VISUAL_REGRESSION.md`
