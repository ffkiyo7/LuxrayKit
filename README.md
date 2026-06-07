# Luxray Kit

**宝可梦 Champions 对战伴侣 · 非官方粉丝工具 · 移动端优先 PWA**

[![PWA](https://img.shields.io/badge/PWA-ready-38BDF8)](https://luxraykit.com)
[![Data](https://img.shields.io/badge/data-v0.2.0--seed-F59E0B)](./src/data/seed/regMA/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-mobile--first-slate)](./tests/pwa/visual.spec.ts)

Luxray Kit 是一个面向 Pokémon Champions 玩家的非官方对战辅助工具。它以移动端 PWA 形态设计，优先服务 Regulation Set M-A 的环境理解、上位构筑参考和本地队伍管理；伤害计算、速度线和规则图鉴收束为工具页里的辅助查询能力。

项目仍在持续开发中。当前版本已经接入 PokeDB Open Data 上位构筑样本作为环境页数据来源；所有统计都按“上位构筑快照 / 样本占比”表达，不包装成官方完整使用率。伤害计算仍属于实验性近似结果，不应视为官方结论或赛事依据。

> 正式访问地址：[luxraykit.com](https://luxraykit.com)

## 功能亮点

### 环境快照

- 单打 / 双打环境切换
- 宝可梦榜、完整榜单和环境详情页
- 携带道具占比、常见队友占比和常用招式统计
- 相关上位构筑样本，支持导入为本地队伍
- 基于 PokeDB Season 1 Open Data 的缓存快照：单打 528 队，双打 71 队

### 队伍管理

- 本地队伍 CRUD，数据存于设备，无需账号
- 列表优先的移动端队伍视图
- 成员快速添加、成员编辑和基础配队分析
- 从图鉴或环境样例队伍导入配置
- 队伍 JSON 导入 / 导出，本地备份更方便
- 队伍分享图生成，默认 2x3 展示并保存图片

### 工具集合

这些能力是二级辅助工具，用于验证思路，不是产品主流程。

- 伤害计算：攻击方 / 防守方独立配置、队伍成员带入、图鉴搜索、手动战斗条件和结果卡
- 速度线：最终速度计算、横向速度轴、最多 12 个 benchmark、收藏常用速度目标
- 规则图鉴：Pokémon / 招式 / 道具 / 特性浏览、搜索、属性筛选、详情和 learnset 招式筛选

### 我的

- 主题切换
- 本地数据导出 / 导入
- 离线缓存说明
- 清除本地数据

## PWA 特性

| 特性 | 说明 |
| --- | --- |
| 移动端优先 | 底部 Tab 导航和页面密度按手机使用设计 |
| 可添加到主屏幕 | 支持通过浏览器安装 / 添加到主屏幕，具体入口取决于系统与浏览器 |
| 静态部署友好 | 构建产物为纯静态文件，适合 Cloudflare Pages 等平台 |
| 本地持久化 | 队伍、收藏和设置写入 IndexedDB，不依赖账号系统 |
| 离线缓存 | Service Worker 缓存核心静态资源，断网时可访问已缓存内容 |

常见安装方式：

- iOS Safari：打开页面后点击分享按钮，再选择“添加到主屏幕”。
- Android Chrome：打开页面后通过浏览器菜单选择“安装应用”或“添加到主屏幕”。

## 数据来源与限制

| 数据类别 | 当前状态 | 说明 |
| --- | --- | --- |
| 主数据 | `v0.2.0-seed` | 版本化 Regulation Set M-A seed，来源包括官方规则 / allowlist、PokeAPI、PokéBase Champions、社区中文资料和本地人工复核标记 |
| 环境快照 | 已接入 | `public/data/pokedb/reg-ma-s1-environment.json` 缓存 PokeDB Season 1 上位构筑样本；该数据不包装成官方完整使用率 |
| 环境样例队伍 | 已接入 | 维护脚本从 PokeDB trainer/list 解析真实队报链接，当前单打 / 双打各保留 8 条完整样本 |
| 常用招式 | 已接入 | 维护脚本解析前 50 Pokémon 详情页的 `data-move-detail` 生成 `moveStats` |
| 速度线 | 已接入 | 基于 Champions SP v1 口径计算最终速度 |
| 伤害计算 | 实验性近似 | 使用 `@smogon/calc` Gen9 主线公式近似，并代入项目采集的 Champions 招式参数与 SP 能力值；天气、场地、能力阶级等以用户手动选择为准，不做完整战斗流程模拟 |
| 合法性与机制 | 非权威 | 伤害、合法性和未确认机制不应被视为官方 Champions 正式结论 |

环境数据会先通过 `src/lib/environmentDataset.ts` 审计。未知 Pokémon / 招式 / 道具引用会被报告并从 UI 数据中剔除。`scripts/update-pokedb-environment.mjs` 会在写入前检查未知 Pokémon、未映射日文道具名、失效 item id 和未映射 move key，并同步写入源码审计快照与 public 运行时 JSON。

## 本地运行

```bash
npm install
npm run dev
```

开发服务器默认绑定 `127.0.0.1`。建议使用浏览器移动端模拟器或真实手机调试，本项目界面以手机优先。

## 构建与部署

```bash
npm run build
npm run preview
```

生产构建输出至 `dist/`，可部署到 Cloudflare Pages、Vercel、GitHub Pages 或任意静态托管平台。

环境快照维护：

```bash
npm run data:pokedb:environment:check
npm run data:pokedb:environment
```

## 测试

```bash
npm test
npm run test:pwa
npm run test:visual
```

PWA 视觉回归测试基于 Playwright，当前覆盖 14 个移动端状态，包括环境首页、完整榜单、环境详情、队伍列表、队伍详情、成员编辑、工具页、伤害计算、速度线、规则图鉴、属性筛选和我的页面。快照位于 `tests/pwa/visual.spec.ts-snapshots/`。

更新视觉快照：

```bash
npm run test:visual -- --update-snapshots
```

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React + Vite + TypeScript |
| 样式 | Tailwind CSS |
| 本地存储 | IndexedDB |
| PWA | 手写 Web App Manifest + Service Worker |
| 计算 | `@smogon/calc` Gen9 主线公式近似 |
| 测试 | Vitest + Playwright |
| 部署 | 静态部署，当前推荐 Cloudflare Pages |

## 路线图

- [ ] 更新 PWA manifest 名称、图标和分享卡片为 Luxray Kit 品牌
- [ ] 完善 `luxraykit.com` 下的 SEO、Open Graph 和社媒分享预览
- [ ] 优化 Luxray inspired 视觉主题：电光、蓝黑黄、锐利视线和 X-ray 光线感
- [ ] 保持工具页稳定可用，避免把伤害计算扩展成战斗流程模拟器
- [ ] 支持 Regulation Set 多版本切换
- [ ] 扩展环境样本和常用 benchmark 场景
- [ ] 改进队伍分享图与社媒展示物料
- [ ] 增加更清晰的数据刷新状态与错误提示

## 免责声明

Luxray Kit 是一个非官方粉丝制作工具。

本项目与任天堂株式会社、株式会社宝可梦、株式会社 Game Freak、株式会社 Creatures、The Pokémon Company International 及其关联方均无任何关联、授权或认可关系。

“Pokémon”“宝可梦”“ポケモン”“Luxray”及相关名称、角色、图像、商标和素材均为其各自权利方所有。本项目仅供个人学习、研究与粉丝交流，不以任何形式声称官方身份或授权关系。

本工具提供的数据、统计和计算结果基于公开资料、第三方开放数据、社区资料与本地整理。由于 Pokémon Champions 机制仍存在未确认部分，所有计算结果和数据展示均不构成正式对战建议。请以游戏内与官方发布的信息为准。

如有版权或商标方面的问题，请通过 [GitHub Issues](https://github.com/ffkiyo7/LuxrayKit/issues) 联系作者。

## License

[MIT License](./LICENSE)

代码开源，欢迎 PR 与 Issue。
