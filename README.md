# Pokémon Champions 对战助手 MVP

移动端优先的 Pokémon Champions Regulation Set M-A 对战助手 PWA。当前实现使用版本化 Reg M-A seed 数据跑通 PRD 中的核心闭环：组队、实验性伤害计算、速度线、图鉴、设置、当前规则详情和本地缓存。

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

- 5 个底部 Tab：组队、计算、速度线、图鉴、设置
- 当前规则详情页：Regulation Set M-A 元信息、数据版本、官方来源、刷新失败兜底
- 队伍：本地队伍 CRUD、成员快速添加、基础配队分析、从队伍进入计算/速度线
- 计算：攻击方 / 防守方独立临时配置、队伍成员带入、图鉴搜索、战斗条件、Gen9 主线公式近似结果卡和关键修正胶囊
- 速度线：最终速度计算、横向速度轴、最多 12 个 benchmark、收藏
- 图鉴：Pokémon / 招式 / 道具 / 特性浏览、搜索、属性筛选、详情、属性关系、learnset 招式筛选、加入队伍
- 设置：数据版本、刷新、清缓存、导入/导出队伍 JSON、浅色 / 深色主题切换

## 项目资料

- PRD：`docs/product/Pokemon Champions PRD.md`
- 设计参考：`docs/design/stitch_design_system_implementation (7).zip`
- 开发进度：`docs/progress/DEVELOPMENT_PROGRESS.md`
- 调研文档：`docs/research/`
- QA 清单：`docs/qa/`

## 数据说明

当前主数据是 `v0.2.0-seed` 版本化 Reg M-A seed，来源包括官方规则 / allowlist、PokeAPI、PokéBase Champions、社区中文资料与本地人工复核标记。图鉴身高 / 体重来自缓存 PokeAPI 主系列数据。

速度线基于 Champions SP v1 口径；伤害计算仍是 **experimental mainline approximation**：使用 `@smogon/calc` Gen9 主线公式近似，并代入项目采集的 Champions 招式参数与 SP 能力值。伤害、合法性和未确认机制不应被视为官方 Champions 正式结论。
