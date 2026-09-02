# Luxray Kit

**宝可梦 Champions 对战伴侣 · 非官方粉丝工具 · 移动端优先 PWA**

[![PWA](https://img.shields.io/badge/PWA-ready-38BDF8)](https://luxraykit.com)
[![Data](https://img.shields.io/badge/data-v0.3.0--mb--seed-F59E0B)](./src/data/seed/regMA/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-mobile--first-slate)](./tests/pwa/visual.spec.ts)

Luxray Kit 是一个面向 Pokémon Champions 玩家的非官方对战辅助工具。它以移动端 PWA 形态设计，优先服务**当前 Regulation Set**（Mega 规则）的环境理解、上位构筑参考和本地队伍管理；伤害计算、速度线、规则图鉴和属性速查收束为工具页里的辅助查询能力。

当前规则与赛季不写在文档里：规则窗口的唯一事实源是 [`src/data/schedule.ts`](./src/data/schedule.ts)，生效中的规则元数据在 [`src/data/seed/regMA/metadata.ts`](./src/data/seed/regMA/metadata.ts) 的 `currentRuleSet`，赛季标签则以 PokeDB 每日快照为准。应用内页头会直接显示当前「赛季 · 规则」。

项目仍在持续开发中。当前版本已接入 PokeDB 当季环境统计、PokeDB 速度表与社区上位构筑样本作为数据来源；环境统计会标注来源与口径，不包装成官方完整使用率。伤害计算仍属于实验性近似结果，不应视为官方结论或赛事依据。

> 正式访问地址：[luxraykit.com](https://luxraykit.com)

## 功能亮点

### 环境快照

- 单打 / 双打环境切换
- 宝可梦榜、完整榜单和环境详情页
- 携带道具占比、常见队友占比和常用招式统计
- 基于 PokeDB 最新赛季 HTML 统计的缓存快照；由 Cloudflare Worker 每日 5 个定点探针（聚集在 PokeDB 发布窗口附近）+ 内容签名（赛季 + 更新日）门控，仅在源变化时才重新抓取
- 数据来源与口径明确标注，不包装成官方完整使用率

### 队伍一览与上位构筑

- 主页「上位构筑」固定展示 4 张更新最新的队伍 + 「查看全部队伍」入口
- 独立「队伍一览」页：单 / 双打区分，按「含队伍码」「赛事 / 排位高分」筛选，按时间排序，按宝可梦名或队名搜索
- 「试试灵感」随机抽一支队伍的居中卡片弹窗，可直接导入或跳转队伍页
- 队伍卡片标注来源（PokeDB 环境榜 / VGCPastes 锦标赛）与可导入粒度（SP 分配 / 配招 / 队伍码 的 icon 胶囊）
- 样本可一键导入为本地队伍，导入提醒按当前样本动态说明可带入项与缺失项

### 队伍管理

- 本地队伍 CRUD，数据存于设备，无需账号
- 列表优先的移动端队伍视图、拖动排序
- 成员快速添加、成员编辑（形态 / 特性 / 道具 / 性格 / SP）和基础配队展示
- 成员卡片可一键**跳转速度线 / 伤害计算并代入当前配置**（伤害计算会先询问作为进攻方还是防守方）
- 队伍码写入、导入带入与详情页复制
- 队伍 JSON 导入 / 导出，本地备份更方便

### 工具集合

这些能力是二级辅助工具，用于验证思路，不是产品主流程。

- **速度线**：选自己的宝可梦入轴，调 SP / 性格 / 围巾 / 顺风 / 速度特性后实时看相对快慢；纵轴自带 PokeDB 参照档位（按 PokeDB 排版等距排列、不按数值拉伸，marker 独占一行不遮挡）；点任一档「超速他」反解出超过它所需的最小配置（最小充分 SP 推荐 + 满速兜底，围巾建议受环境携带率门控、速度特性自动识别）；参照档显示真实宝可梦头像与名单，同一速度实数下的多个「种族 × 性格」档按环境使用率排主档
- **伤害计算**：攻击方 / 防守方独立配置、队伍成员带入（特性 / 道具 / 性格 / SP，招式用当前规则可用进攻招式列表）、图鉴搜索、手动战斗条件和结果卡
- **规则图鉴**：Pokémon / 招式 / 道具 / 特性浏览、搜索、属性 / 道具分类筛选、详情和 learnset 招式筛选
- **属性速查**：速查拨盘（默认）与 18×18 完整克制矩阵双模式，支持键盘导航

### 我的

- 主题切换
- 本地数据导出 / 导入
- 离线缓存说明
- 清除本地数据

## PWA 特性

| 特性 | 说明 |
| --- | --- |
| 移动端优先 | 底部 Tab 导航和页面密度按手机使用设计，最大宽度约 430px |
| 可添加到主屏幕 | 支持通过浏览器安装 / 添加到主屏幕，具体入口取决于系统与浏览器 |
| 静态部署友好 | 构建产物为纯静态文件，可脱离 Worker 部署到任意静态托管（仅失去在线刷新） |
| 本地持久化 | 队伍、收藏和设置写入 IndexedDB，不依赖账号系统 |
| 离线缓存 | Service Worker 缓存核心静态资源，断网时可访问已缓存内容 |

常见安装方式：

- iOS Safari：打开页面后点击分享按钮，再选择“添加到主屏幕”。
- Android Chrome：打开页面后通过浏览器菜单选择“安装应用”或“添加到主屏幕”。

## 数据来源与限制

| 数据类别 | 当前状态 | 说明 |
| --- | --- | --- |
| 主数据 | 已接入 | 版本化 Regulation Set seed（生效规则与版本号见 `metadata.ts` 的 `currentRuleSet` / `currentDataVersion`；目录名 `seed/regMA/` 为历史遗留，与当前规则无关），来源包括官方规则 / allowlist、PokeAPI、PokéBase Champions、社区中文资料和本地人工复核标记 |
| 环境快照 | 已接入 | `public/data/pokedb/*.json` 缓存 PokeDB 最新赛季 Pokémon 统计；Cloudflare Worker 每日 5 个定点探针 + 内容签名门控，仅在源变化时重拉 |
| 上位构筑样本 | 已接入 | PokeDB trainer/list 解析的真实队报，叠加脚本摄入的 VGCPastes「Champions M-A / M-B」官方锦标赛构筑（每个规则一个构建期受管 chunk；队伍库默认展示全部规则，可按规则筛选） |
| 速度线参照档 | 已接入 | 一次性脚本抓 PokeDB 速度表生成静态快照 `src/data/speedTiers.ts`（每档含宝可梦图鉴号 / 形态 / 日文名）；规则或环境有变化时手动重跑 |
| 常用招式 | 已接入 | 维护脚本复用 Worker 解析器抓取 Pokémon 详情页的 `data-move-detail` 生成 `moveStats` |
| 速度计算 | 已接入 | 基于 Champions SP 口径计算最终速度：`floor((种族速 + SP + 20) × 性格修正)`，叠加围巾 ×1.5 / 速度特性 ×2 / 顺风 ×2 |
| 伤害计算 | 实验性近似 | 使用 `@smogon/calc` Gen9 主线公式近似，并代入项目采集的 Champions 招式参数与 SP 能力值；天气、场地、能力阶级等以用户手动选择为准，不做完整战斗流程模拟 |
| 合法性与机制 | 非权威 | 伤害、合法性和未确认机制不应被视为官方 Champions 正式结论 |

环境数据会先通过 `src/lib/environmentDataset.ts` 审计。未知 Pokémon / 招式 / 道具引用会被报告并从 UI 数据中剔除。`scripts/update-pokedb-environment.mjs` 会动态探测 PokeDB 最新赛季，复用 Worker 的 HTML 解析入口，并同步写入源码审计快照与 public 运行时 JSON。

## 本地运行

需要 **Node 24**（`.node-version` / `package.json` 的 `engines` / CI 三处一致）。

```bash
npm install
npm run dev
```

开发服务器默认绑定 `127.0.0.1`。建议使用浏览器移动端模拟器或真实手机调试，本项目界面以手机优先。

> 提示：本项目是 PWA，开发期 Service Worker 可能缓存旧资源。若改动未生效，可在浏览器 DevTools → Application → Service Workers 注销后硬刷新。

## 构建与部署

```bash
npm run build
npm run preview
```

生产构建输出至 `dist/`。线上由单一 Cloudflare Worker（`luxraykit-app`）托管 `dist/` 静态资源、`/api/*` 接口与 PokeDB 刷新 cron，通过 Cloudflare Workers Builds 在 push `main` 时自动部署（详见 [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md)）。得益于环境数据三级回退，`dist/` 也可部署到 Vercel、GitHub Pages 等任意静态托管平台（仅失去在线刷新）。

数据维护脚本：

```bash
npm run data:pokedb:environment        # 抓取 / 刷新 PokeDB 环境快照
npm run data:pokedb:environment:check  # 仅校验是否需要更新
npm run data:pokedb:speed              # 重新生成速度线参照档静态快照
npm run data:pokedb:speed:check        # 仅校验速度档快照是否过期
npm run data:vgcpastes:champions-ma    # 摄入 VGCPastes「Champions M-A」构筑
npm run data:vgcpastes:champions-mb    # 摄入 VGCPastes「Champions M-B」构筑
```

> 面向贡献者的架构、Cloudflare Worker 刷新管线与部署说明见 [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md)。

## 测试

```bash
npm test            # Vitest 单元 / 组件测试（含 Worker 与脚本工具单测）
npm run test:pwa    # Playwright PWA / 离线测试（用本机 Chrome）
```

PWA 视觉回归覆盖 **18 个**移动端状态，快照位于 `tests/pwa/visual.spec.ts-snapshots/`。它是 **CI-only** 的：基线在 Playwright 官方容器内生成，而开发在 macOS，本机既产不出 Linux 基线，Apple Silicon 的 arm64 容器还会用相同文件名覆盖 CI 的 amd64 基线。

- 校验：开 PR，`ci.yml` 的 `visual` job 是阻塞门禁
- 重建：`gh workflow run visual-baseline.yml --ref "$(git branch --show-current)"`

细节见 [`docs/qa/MOBILE_VISUAL_REGRESSION.md`](./docs/qa/MOBILE_VISUAL_REGRESSION.md)。

## 参与贡献

提交改动前请阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。项目要求 Node 24；PR 至少需要通过 `npm test`，涉及前端行为时还需要通过 `npm run build`。自动生成的数据和资产必须修改对应脚本后重新生成，不直接手改产物。

安全漏洞请按 [`SECURITY.md`](./SECURITY.md) 私下报告，不要先开公开 Issue。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React + Vite + TypeScript |
| 样式 | Tailwind CSS |
| 本地存储 | IndexedDB |
| 导航 | tab + view state（无 react-router） |
| PWA | 手写 Web App Manifest + Service Worker |
| 环境数据 | Cloudflare Worker（每日定点探针 + 内容签名门控刷新 PokeDB 统计，Durable Object alarm 分步执行） |
| 计算 | 自有 Champions 速度公式 + `@smogon/calc` Gen9 主线伤害近似 |
| 测试 | Vitest + Playwright |
| 部署 | 生产为单一 Cloudflare Worker（`luxraykit-app`，托管前端 + API + cron），经 Workers Builds 自动部署；构建产物也可纯静态托管 |

## 路线图

- [ ] 队报链接重做 + 双来源统一（指向有实际加点的落点）
- [ ] 浅色主题品牌色重做（向 Luxray Kit 品牌色对齐）
- [x] ~~更新 PWA manifest 名称与图标为 Luxray Kit 品牌（分享卡片 / OG 见下条）~~
- [ ] 完善 `luxraykit.com` 下的 SEO、Open Graph 和社媒分享预览
- [ ] 保持工具页稳定可用，避免把伤害计算扩展成战斗流程模拟器
- [ ] 支持 Regulation Set 多版本切换
- [x] ~~速度线页面重做 + 超速反哺建议~~
- [x] ~~队伍一览页 + 试试灵感~~
- [x] ~~队伍成员一键跳转速度线 / 伤害计算并代入配置~~

## 免责声明

Luxray Kit 是一个非官方粉丝制作工具。

本项目与任天堂株式会社、株式会社宝可梦、株式会社 Game Freak、株式会社 Creatures、The Pokémon Company International 及其关联方均无任何关联、授权或认可关系。

“Pokémon”“宝可梦”“ポケモン”“Luxray”及相关名称、角色、图像、商标和素材均为其各自权利方所有。本项目仅供个人学习、研究与粉丝交流，不以任何形式声称官方身份或授权关系。

本工具提供的数据、统计和计算结果基于公开资料、第三方开放数据、社区资料与本地整理。由于 Pokémon Champions 机制仍存在未确认部分，所有计算结果和数据展示均不构成正式对战建议。请以游戏内与官方发布的信息为准。

如有版权或商标方面的问题，请通过 [GitHub Issues](https://github.com/ffkiyo7/LuxrayKit/issues) 联系作者。

## License

Luxray Kit 的原创代码与原创文档采用 [MIT License](./LICENSE)。选择 MIT 是为了允许个人和社区自由使用、修改与分发代码，只要求保留版权与许可声明。

Pokémon 名称、商标、角色图像、道具图标、第三方数据、社区队伍内容及其他外部来源材料**不因存放在本仓库而获得 MIT 授权**，仍受各自权利方与来源条款约束。来源、适用范围和再分发注意事项见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

欢迎 PR 与 Issue。
