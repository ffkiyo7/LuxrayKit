# Pokémon Champions 对战助手 MVP

移动端优先的 Pokémon Champions Regulation Set M-A 对战助手 PWA。当前实现使用版本化模拟数据跑通 PRD 中的核心闭环：组队、伤害计算阻断态、速度线、图鉴、设置、当前规则详情和本地缓存。

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
- 计算：队伍成员带入、战斗条件 chip、示例结果卡、机制待确认阻断
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

当前数据是 `v2.1.0-mock` 模拟数据，仅用于验证产品闭环。图鉴身高 / 体重来自缓存 PokeAPI 主系列数据。所有伤害、速度 benchmark 和合法性结论都应视为“示例数据 / 非真实计算”，不可作为正式对战依据。
