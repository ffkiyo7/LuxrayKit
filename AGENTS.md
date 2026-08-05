# AGENTS.md — Agent 工作规则

适用于在本仓库工作的所有 coding agent（Codex / Claude Code 等）。

工程事实（架构、数据流、Worker、脚本、部署）以 [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) 为权威来源，按需阅读。本文件只收录**推断不出、且改错代价高**的规则——本文件每次会话全量载入，请保持精简，细节一律沉到开发指南。**禁止**用 `@path` 语法导入开发指南等大文件（会把整份文件塞进每个会话），普通 Markdown 链接即可。

## 1. 业务机制（勿按主线宝可梦知识"纠正"）

- **Champions SP 不是主线 EV**：每项 0–32、总计上限 66（`src/lib/statPoints.ts`）；速度为 `floor((种族值 + SP + 20) × 性格修正)`（`src/lib/calculations.ts`）。这是已确认的固定机制，不要向主线 EV / IV / 等级公式"纠偏"。
- **Regulation 与 Season 是两条独立时间轴**：规则（M-A / M-B…）决定可用池子，赛季（M-1…）是排位周期。一律读 `src/data/schedule.ts` 与 `src/data/seed/regMA/metadata.ts` 的 `currentRuleSet`，**不要在任何地方硬编码当前赛季或规则**。
- **`regMA/` 是历史目录名**，与当前规则无关（当前承载 M-B 数据）。
- **产品边界**：伤害计算保持"实验性近似"，不要扩展成战斗流程模拟器。详见 `docs/product/PRODUCT_SCOPE_AND_TOOL_BOUNDARIES.md`。

## 2. 部署与数据红线

- **push `main` 即上线**：部署只走 Cloudflare Workers Builds，`main` 无分支保护。GitHub Actions 只做 CI 与 daily auto-merge，不部署；auto-merge 仅限 `automation/pokedb-environment-refresh` 与 `automation/vgcpastes-team-refresh` 两个分支的纯数据 PR。
- **preview 与生产共享同一 KV namespace**：在 preview 上一律把 KV 当生产数据，只读。
- **IndexedDB 库名 `pokemon-champions-assistant` 永不可改**（改名 = 老用户本地数据全丢）。

## 3. PR 与验证

- Agent 创建的功能 PR **默认 Draft**，除非用户明确要求 ready for review。
- 提交前至少跑 `npm test`；涉及前端行为的改动跑 `npm run build`（含 `tsc -b` 全量类型检查）。
- **视觉回归是 CI-only**：开发在 macOS，本机无法产出 Linux 基线（且 Playwright 快照名只带平台不带架构，arm64 会静默覆盖 CI 的 amd64 基线）。校验靠 CI 的 `visual` 阻塞门禁，重建走 `gh workflow run visual-baseline.yml --ref <当前分支>`。
- 视觉用例吃冻结数据（fixture + 固定时钟），**不要为了"让截图跟上最新数据"去改用例或放宽阈值**——这层解耦是为了让日常数据刷新不卡住 auto-merge。

## 4. 生成产物

带 `Auto-generated` 头的文件、`src/data/speedTiers.ts`、`src/data/external/**`、`public/data/pokedb/*.json`、Worker 类型声明等均由 `scripts/` 或 wrangler 生成：**改脚本，不手改产物**（对应命令见 `package.json` 的 `data:*` / `worker:*`）。
