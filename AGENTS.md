# AGENTS.md — Agent 工作规则

适用于在本仓库工作的所有 coding agent（Codex / Claude Code 等）。本文件只收录**仓库特有、无法从代码自然推断**的规则；架构、数据流、Worker、脚本与部署等工程事实以 [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) 为权威来源。

> **本文件的维护约定**：本文件（经 CLAUDE.md 的 `@AGENTS.md` 导入）在每次会话启动时全量载入上下文——保持全文 **200 行以内**，只收"无法从代码推断且高风险"的规则，细节一律沉到开发指南按需阅读。**禁止**在本文件或 CLAUDE.md 中用 `@` 语法导入 `docs/DEVELOPER_GUIDE.md` 等大文件：`@path` 导入会把整份文件塞进每个会话的上下文，普通 Markdown 链接或反引号包裹的路径才是正确的引用方式。

## 1. 文档权威性与阅读策略

- 每次新会话开始时，确认 `docs/DEVELOPER_GUIDE.md` 存在，并将其视为工程事实的权威文档。
- Read the relevant sections of the guide when the task touches architecture, Pokémon Champions mechanics, IndexedDB migrations, generated data, Cloudflare Workers, KV, deployment, or automation.
- For small isolated UI, copy, or documentation edits, inspect only the directly relevant files unless additional context is needed.
- If repository documentation conflicts, treat the current code and `docs/DEVELOPER_GUIDE.md` as authoritative and flag the conflict to the user. `docs/progress/` 等进度文档可能过期（guide §10 有已知过期清单）。
- **Push 前**：基于本轮代码改动判断是否需要同步更新 `docs/DEVELOPER_GUIDE.md`——尤其是改动了刷新管线、路由、KV、部署或分支策略时（见 guide 文末维护约定）。

## 2. 业务规则（已确认的固定机制，勿按主线宝可梦知识"修正"）

- **Champions SP 不是主线 EV**。每项 0–32、总计上限 66（`src/lib/statPoints.ts`）；速度公式为 `floor((种族值 + SP + 20) × 性格修正)`（`src/lib/calculations.ts`）。这是已确认的固定机制，不要向主线 EV / IV / 等级公式"纠偏"。
- **两条独立时间轴**。规则类型（Regulation，如 M-A / M-B）决定可用宝可梦、道具等池子；赛季（Season，如 M-1…M-4）是规则周期内的 Pokemon Champion游戏内排位赛季。截至 2026-07，当前为 **M-B 规则下的 M-4 赛季**；具体以 `src/data/seed/regMA/metadata.ts` 的 `currentRuleSet`、`src/data/schedule.ts` 和快照 `seasonLabel` 为准，不要硬编码。
- **`regMA` 是历史目录名，不等于当前规则**。`src/data/seed/regMA/` 与 `public/data/pokedb/reg-ma-environment.json` 的命名是历史遗留，当前承载的是 M-B 规则数据；当前规则集只看 `currentRuleSet.id`。
- **机制门控与产品边界是有意设计**。`calculateSpeedWithMechanismGate`（`src/lib/calculations.ts`）对未确认机制返回 blocked 是故意的；伤害计算保持"实验性近似"定位。不要擅自补全被门控的机制，也不要把工具扩展成战斗流程模拟器——产品边界见 `docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`。

## 3. 生成文件：改脚本，不手改产物

以下文件由脚本或 wrangler 生成，手改会在下次生成时被覆盖：

| 产物 | 再生成方式 |
| --- | --- |
| `src/data/seed/regMA/catalog-batch-*.ts` 等带 `Auto-generated` 头的 seed 文件 | 对应 `scripts/generate-*.mjs` |
| `src/data/speedTiers.ts` | `npm run data:pokedb:speed` |
| `src/data/external/**`、`public/data/pokedb/*.json` | `npm run data:pokedb:environment`（生产由 VPS 自动 PR 刷新） |
| `cloudflare/environment-worker/src/worker-configuration.d.ts` | `npm run worker:app:types` |

## 4. 部署与自动化事实（无法从代码推断）

- 部署**只走 Cloudflare Workers Builds**（Git 集成）：push `main` 即自动构建并部署到 luxraykit.com。GitHub Actions 只负责 CI 与 daily auto-merge，**不部署**。
- **合并进 `main` ≈ 上线**。`main` 无分支保护；`daily-auto-merge.yml` 只自动合并 `automation/pokedb-environment-refresh` 分支的 PR，其余 PR 一律人工合并。
- 环境快照刷新由**东京 VPS（AWS Lightsail）cron** 运行维护脚本并提 PR（分支即上一条）。Worker 内 cron + Durable Object 刷新管线代码仍在，但已被 VPS 流程实质取代——Cloudflare 出口 IP 已被数据源 PokeDB 封禁。
- Workers Builds 的 preview 部署与生产**共享同一 KV namespace**：在 preview 上一律把 KV 当生产数据对待，只读。
- IndexedDB 库名 `pokemon-champions-assistant` 是历史标识，**永不可改**（改名即老用户本地数据全丢，见 guide §1 / §4.3）。

## 5. PR 与验证

- 由 Agent 创建的普通功能 PR **默认 Draft**，除非用户明确要求 ready for review。
- 提交前至少通过 `npm test`；涉及前端行为的改动跑 `npm run build`（含 `tsc -b` 全量类型检查）。
- 视觉回归基线（`tests/pwa/visual.spec.ts-snapshots/`）为 win32 平台专属，**不要在非 Windows 环境重新生成基线**。
- 换行统一由 `.gitattributes`（`eol=lf`）治理；不要提交大批量纯换行变更。
