# 资产与数据源审计报告

> 审计时间：2026-06-18
> 方式：源码静态核对 + 远端实时 HTTP 可用性测试 + 线上 Worker 实测
> 范围：图鉴文本/图片、属性 icon、环境数据、宝可梦自身数据、上位队伍、道具图标
> 说明：本次审计为只读评估，未改动任何代码或运行时数据。

## 一、资产/数据源总清单

| 资产类别 | 数据源 | 接入位置 | 落地形式 |
| --- | --- | --- | --- |
| 宝可梦图片（立绘/缩略图） | PokeAPI sprites `raw.githubusercontent.com/PokeAPI/sprites` | `scripts/generate-pokemon-icons.mjs` / `scripts/update-mb-assets.mjs` | 本地 `public/assets/pokemon/{artwork,thumbs}` |
| M-B 新 Mega 立绘 | i.pokebase.app CDN | `scripts/update-mb-assets.mjs`（从 `/pokemon` 页抽 CDN URL） | 本地 PNG |
| 道具图标 | PokéBase `/items` + i.pokebase CDN 硬编码 URL + PokeAPI sprites/items + Serebii ZA | `scripts/generate-item-icons.mjs` / `scripts/update-mb-assets.mjs` | 本地 `public/assets/items` |
| 属性 icon | 无外部依赖 —— `ui.tsx` 内联 `typeColors` 十六进制色板 + 中文名映射 | `src/components/ui.tsx:75` | 纯代码，零资产风险 |
| 图鉴文本（招式中文名/描述） | 42arch/pokemon-dataset-zh（主）+ PokeAPI（回退）+ 手动覆写 | `scripts/generate-champions-moves.mjs` | `src/data/seed/regMA/move-catalog.ts` |
| 图鉴文本（特性中文/效果） | 52poke wiki `api.php`（主）+ PokeAPI | `scripts/generate-ability-effects.mjs` | catalog batches |
| 宝可梦自身数据（种族值/属性/特性） | PokeAPI + PokéBase Champions `/pokemon` + 人工复核 | catalog batches / `mega-catalog*.ts` | seed 数据 |
| 招式可学习关系（learnset） | PokéBase Champions `/pokemon` | `scripts/generate-champions-moves.mjs` | `src/data/seed/regMA/move-catalog.ts` |
| 性格 | PokeAPI nature | `scripts/generate-natures.mjs` | seed |
| Mega 形态数据 | 硬编码旧世代竞技数据（`mega-catalog.ts`）+ PokéBase（`mega-catalog-mb.ts`） | `scripts/generate-mega-forms.mjs` + 人工 | 两份 mega 目录合并 |
| 规则元数据 | champions.pokemon.com + 历史 web-view.app.pokemonchampions.jp | `src/data/seed/regMA/metadata.ts` | seed |
| 道具合法性快照 | rotompicks.com | `src/data/seed/regMA/metadata.ts` | seed |
| 环境数据（静态回退） | champs.pokedb.tokyo HTML 页（`/pokemon/list`、`/pokemon/show`、`/trainer/list`，动态探测最新赛季） | `scripts/update-pokedb-environment.mjs` 复用 Worker 解析器 | `public/data/pokedb/reg-ma-environment.json` |
| 环境数据（线上主源） | champs.pokedb.tokyo HTML 页（`/pokemon/list`、`/pokemon/show`、`/trainer/list`，动态探测最新赛季） | `cloudflare/environment-worker/src/index.ts` + `src/lib/pokedbEnvironment.ts` | Cloudflare KV |
| 上位队伍 | 同上（PokeDB trainer/list 真实队报链接） | Worker / 维护脚本 | KV / seed JSON |

## 二、远端可用性实测结果

| 数据源 | 状态 | 说明 |
| --- | --- | --- |
| champs.pokedb.tokyo `/opendata` 单双打 JSON | ✅ 200 | 静态管线正常 |
| champs.pokedb.tokyo `/pokemon/list`、`/trainer/list` | ✅ 200 | 线上 Worker 管线正常 |
| pokeapi.co（move/species） | ✅ 200 | |
| PokeAPI sprites（立绘） | ✅ 200 | |
| pokebase.app `/pokemon-champions/pokemon` | ❌ 000（连续 3 次 50s 超时） | 关键页不可达，见第四节 |
| pokebase.app `/pokemon-champions/items` | ✅ 200（1.5s） | 仅 `/pokemon` 子页出问题 |
| i.pokebase.app CDN（图片） | ✅ 200 | |
| serebii.net ZA 道具图标 | ✅ 200 | |
| 42arch/pokemon-dataset-zh | ✅ 200 | |
| wiki.52poke.com `/api.php` | ✅ 200（脚本 UA） | `/wiki/` HTML 路径对默认 UA 返回 403，但脚本走 api.php 正常 |
| 官方 web-view（M-A eligible） | ✅ 200 | 仍返回旧的 213 行 M-A 数据（已知滞后） |
| champions.pokemon.com / pokemon-home news / rotompicks | ✅ 200 | |
| 线上 Worker `/api/environment/latest` | ✅ 200，fresh | 已自动推进到 Season 3 / M-3，刷新于 2026-06-17 |

## 三、多交叉数据源问题（重点）

1. **PokeDB 解析管线已统一（2026-06-18 已处理）**
   - 静态维护脚本已改为动态探测 PokeDB 最新赛季；
   - 维护脚本通过 esbuild 临时打包并复用线上 Worker 的 HTML 抓取/解析入口；
   - 旧 S1 `/opendata` JSON 仅作为测试夹具/历史快照保留，不再作为运行时静态回退来源。

2. **环境数据回退赛季错位已修复（2026-06-18 已处理）**
   - 优先级链调整为：`Worker(实时)` → `静态 JSON(维护脚本生成的最新赛季)` → `seed(开发样例)`；
   - public 回退文件改为规则集级别的 `/data/pokedb/reg-ma-environment.json`，避免文件名继续表达 S1；
   - Service Worker 预缓存同步更新到新文件，并 bump cache name 防止旧缓存沿用 S1。

3. **图片/道具图标来源碎片化**：立绘分散在 PokeAPI sprites + i.pokebase CDN；道具图标分散在 4 个来源（PokéBase 抓取页、i.pokebase 硬编码 URL、PokeAPI、Serebii）。新增项时来源判断逻辑散落在多个脚本里。

4. **Mega 数据双目录**：`mega-catalog.ts`（硬编码旧世代竞技数值）+ `mega-catalog-mb.ts`（PokéBase），在 `catalog.ts` 合并。

5. **eligible 宝可梦双来源且已分歧**：官方 web-view 仍是 M-A 的 213 行，PokéBase 已是 M-B 的 235 行，`metadata.ts` 已记录此分歧并标 `manual-review`。

## 四、实测发现的当前数据完整性缺口

1. **线上 Worker（S3/M-3）审计日志报告 16 个 unknown Pokemon keys**：`0257-00/0260-00/0303-00/0376-00/0398-00/0545-00/0560-00/0604-00/0668-00/0689-00/0691-00/0861-00/0870-00/0972-00/0979-00/1000-00`。这是本赛季实际上榜的 M-B 新基础宝可梦子集（非 22 只 M-B 新增基础宝可梦的全量；未上榜的不会出现在 notes 里）。本地 allowlist 已包含这些 M-B 条目（`src/data/seed/regMA/allowlist.ts:1994` 起）、catalog 也已聚合全部 batch，所以本地映射是齐的——问题指向**线上 Worker 跑的是早于 M-B 映射更新的旧 bundle**。这些 unknown 主要由 allowlist/catalog 映射决定，与当前工作区未提交的 Mega sprite 修正没有直接因果；修复动作应表述为“将当前 main 分支 bundle 重新部署到 Worker”，而非“提交 Mega 改动即可解决”。这些宝可梦会被审计静默剔除出环境榜。

2. **`src/data/external/pokedbItemNameMap.ts` 缺少 Raichu Mega Stone 映射**（已确认无 `ライチュウ`）：线上 notes 当前报 3 个 unknown item —— `ライチュウナイトＸ`、`ライチュウナイトＹ`，以及 `持ち物なし`（“无持物”哨兵文本）。前两者是真实映射缺口（道具图标 `raichunite` / `raichunite-x` 本地已存在，见 `src/data/seed/regMA/item-icon-mapping.ts:108`，但日文名→id 映射未补）；`持ち物なし` 则说明 Worker 侧未像静态脚本那样把“无持物”纳入 `ignoredItemNames` 过滤，属解析口径不一致而非缺数据。

3. **PokéBase `/pokemon` 页不可达**：招式 learnset、M-B Mega 数据、eligible 校对三项维护脚本都依赖此页，当前若重跑会失败。需确认是该站点临时反爬/宕机，还是本审计网络环境受限。

## 五、长期维护建议

### 高优先级

1. **统一 PokeDB 解析逻辑**（✅ 已完成）：静态维护脚本已复用 Worker 的 PokeDB HTML 抓取/解析入口，并取消 S1 硬编码、改为动态探测赛季。
2. **修复回退赛季错位**（✅ 已完成）：静态回退 JSON 已切到 `/data/pokedb/reg-ma-environment.json`，并已刷新到 M-3；Service Worker 也同步预缓存新地址。
3. **补齐映射缺口并对齐解析口径**（✅ 代码已落地，待部署生效）：在 `pokedbItemNameMap.ts` 补 Raichu Mega Stone X/Y 的日文名映射；将 Worker 解析与静态脚本的 `ignoredItemNames` 对齐，过滤掉 `持ち物なし` 这类“无持物”哨兵；并将当前 main 分支 bundle 重新部署到 Worker，使本地已齐的 M-B allowlist/catalog 映射在线上生效。
4. **给 Worker 审计加告警**（✅ 已完成）：`/api/environment/status` 已暴露 snapshot audit 计数、明细和阈值告警；`/api/environment/latest` 也通过响应头标出 audit alert 与 unknown 总数，避免 unknown keys/items 只停留在 `dataFreshness.notes`。

### 中优先级

5. **资产来源单一化清单**：把“每个道具/立绘的来源 URL + license risk”集中成一份机器可读 manifest（现散落在多个 `.mjs` 的硬编码字典里），便于审查与重抓。
6. **为脆弱外部源加冗余/缓存**：PokéBase `/pokemon` 本次实测超时，招式与 Mega 全靠它；建议保留抓取 HTML 快照缓存（脚本已有 `.npm-cache`，可纳入可重放归档），并准备 PokeAPI 作为 learnset/数值的备援校验。
7. **license 风险持续标注**：PokeAPI sprites、PokéBase、52poke 在 manifest 中均标 `high` risk，README 免责声明已覆盖；保持每个资产保留来源记录，不对外声称官方授权。

### 低优先级 / 已健康

8. 属性 icon 为纯代码色板，无任何外部依赖与版权风险，无需维护动作。
9. PokeAPI、Serebii、42arch、rotompicks、官方站点全部可用，无需立即处理。

## 六、处理进度

- 2026-06-18：完成高优先级 #3。`src/data/external/pokedbItemNameMap.ts` 补入 `ライチュウナイトＸ→raichunite-x`、`ライチュウナイトＹ→raichunite`；`src/lib/pokedbEnvironment.ts` 抽出共享 `IGNORED_ITEM_NAMES`/`isIgnoredItemName`，在 `normalizeItemId`、详情统计 `itemStats`、trainer 列表三处复用，详情统计不再把 `持ち物なし` 计入 unknown。后续 M-3 快照刷新时又补齐 `いのちのたま`、`たつじんのおび`、天气岩石/镜片/头带类道具、M-B 新 Mega 石日文别名，以及 PokeDB move key `789/874/889` 和 ability key `283`。
- 2026-06-18：完成高优先级 #1/#2。`scripts/update-pokedb-environment.mjs` 改为动态探测最新 PokeDB 赛季，复用 Worker HTML 抓取/解析入口生成 statistics snapshot；运行时静态回退从 `/data/pokedb/reg-ma-s1-environment.json` 切到 `/data/pokedb/reg-ma-environment.json`，`public/sw.js` 同步预缓存新快照并 bump cache。已生成 M-3 静态回退快照：单打 228 个排名 / 前 60 详情页，双打 211 个排名 / 前 60 详情页，单/双 unknown Pokemon、item、move、ability、nature 均为 0。旧 S1 opendata JSON 继续作为测试夹具/历史快照保留。
- 2026-06-18：完成高优先级 #4。Worker 新增 `EnvironmentAuditStatus` 汇总：默认阈值为 0，可用 `ENVIRONMENT_AUDIT_UNKNOWN_THRESHOLD` 覆盖；发布 refresh job、跳过 refresh、`/api/environment/status` 都会汇总当前 snapshot 的 unknown Pokemon/item/move/ability/nature 与 failed detail keys；`/api/environment/latest` 新增 `x-luxray-audit-alert`、`x-luxray-audit-unknown-count`，并在超阈值时将 `x-luxray-worker-status` 标为 `degraded`。定向 Worker 单测覆盖 status 输出和 latest header。
- 待办：无。
