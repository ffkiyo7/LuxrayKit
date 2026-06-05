# Pokémon Champions 对战助手 MVP

移动端优先的 Pokémon Champions Regulation Set M-A 对战助手 PWA。当前分支正在推进“环境优先”重构：默认入口提供基于 PokeDB Open Data 的上位构筑快照，队伍、伤害计算、速度线、规则图鉴和本地数据管理继续保留为完整工具闭环。

## 技术栈

- React + Vite + TypeScript
- Tailwind CSS
- IndexedDB 本地存储
- 手写 Web App Manifest + Service Worker

## 本地运行

```bash
npm install
npm run dev
```

构建验证：

```bash
npm run build
```

## 当前实现范围

- 4 个底部 Tab：环境、队伍、工具、我的
- 环境：单打 / 双打切换、宝可梦榜、完整榜单、宝可梦环境详情、携带道具、常见队友、相关样例队伍
- 环境快照：当前内置 PokeDB Season 1 单打 / 双打上位构筑 Open Data snapshot，用于计算样本出现率、携带道具占比和常见队友占比
- 环境样例队伍：首批外部样本保留真实队报链接，支持导入配置；本地开发 seed 仅作为审计失败时的回退
- 环境数据地基：环境榜单和样例队伍已收束为 `EnvironmentDataset` 数据包，并在进入 UI 前经过引用、数值和统计字段审计
- 队伍：本地队伍 CRUD、列表优先、成员快速添加、成员编辑、基础配队分析、导入队伍来源标签
- 队伍分享：队伍列表生成默认 2x3 分享图，结果层只提供保存图片
- 工具：聚合伤害计算、速度线计算、规则图鉴三个并列入口
- 计算：攻击方 / 防守方独立临时配置、队伍成员带入、图鉴搜索、战斗条件、Gen9 主线公式近似结果卡和关键修正胶囊
- 速度线：最终速度计算、横向速度轴、最多 12 个 benchmark、收藏
- 图鉴：Pokémon / 招式 / 道具 / 特性浏览、搜索、属性筛选、详情、属性关系、learnset 招式筛选、加入队伍
- 我的：主题切换、导出 / 导入本地备份 JSON、离线缓存说明、清除本地数据

## 项目资料

- PRD：`docs/product/Pokemon Champions PRD.md`
- 设计参考：`docs/design/stitch_design_system_implementation (7).zip`
- 开发进度：`docs/progress/DEVELOPMENT_PROGRESS.md`
- 调研文档：`docs/research/`
- QA 清单：`docs/qa/`

## 数据说明

当前主数据是 `v0.2.0-seed` 版本化 Reg M-A seed，来源包括官方规则 / allowlist、PokeAPI、PokéBase Champions、社区中文资料与本地人工复核标记。图鉴身高 / 体重来自缓存 PokeAPI 主系列数据。

环境页当前默认使用 `src/data/external/pokedb/` 下的 PokeDB Open Data bundled snapshot：单打 528 队，双打 71 队，更新时间分别来自 PokeDB payload。该数据代表“上位构筑样本”，不包装成官方完整使用率。Open Data 不包含招式使用率，因此宝可梦详情页暂不展示“常用招式”榜；待后续服务端抓取 / 解析 PokeDB 详情页统计后再接入。所有环境数据会先通过 `src/lib/environmentDataset.ts` 审计，未知 Pokémon / 招式 / 道具引用会被报告并从 UI 数据中剔除。

速度线基于 Champions SP v1 口径；伤害计算仍是 **experimental mainline approximation**：使用 `@smogon/calc` Gen9 主线公式近似，并代入项目采集的 Champions 招式参数与 SP 能力值。伤害、合法性和未确认机制不应被视为官方 Champions 正式结论。
