# 队伍库策展操作手册

本文面向低频 Hermes 策展 agent。它不负责每周机械刷新；职责是按月或按需调整 VGCPastes 队伍库的筛选策略，并用 draft PR 交给人工审核。Hermes 服务可以和外部维护任务位于同一台 VM，但必须使用独立 clone 与调度器：策展默认在 `/home/ubuntu/LuxrayKit`，机械刷新默认在 `/home/ubuntu/LuxrayKit-maintenance`。

## 主机准备与验证边界

Hermes 策展需要独立的 LuxrayKit clone、Node/npm 依赖和 `gh` 认证。GitHub 凭据只需能推送普通分支并创建 draft PR，不需要合并权限。同机部署时不要让 Hermes agent 在 maintenance clone 中运行，也不要让系统 cron 切换策展 clone 的分支。

机器内存有限时，本地至少运行：

```bash
npm test
```

正常情况下还应运行 `npm run build`。如果构建因主机内存不足无法完成，在 PR 正文中明确记录，并依赖 draft PR 上照常运行的 GitHub CI。Draft PR 永远不进入 daily auto-merge。

## 何时介入

月度巡检或以下情况触发策展：

> 2026-07-19 首次机械刷新 dry-run 已得到 M-B 143 支、0 issues（仓库基线为 30 支）。
> 这批数据可以按机械刷新流程合入；合入后应尽快安排第一次策展巡检。

- 阅读 `src/data/external/vgcpastes/` 下两个 audit JSON，核对输入行数、筛选后行数、样本数与 issues。
- M-B 样本超过约 120 支或临近 regulation 末期时，上调 `MB_MIN_SHARED_DATE`，维持约 60 天窗口，或收紧 `MB_PER_EVENT_CAP`。
- 出现有代表性的线下大赛后，参考脚本中 M-A 的赛事白名单与名次 cap，把 M-B 从宽松赛事筛选逐步演进为明确策展。
- 名称映射缺失时，修正 `src/lib/pokepasteSource` 的映射；抓取失败先重试，确认持续失败后再记录或处理来源。
- 策展后样本规模稳定增长时，同步上调 `src/data/vgcpastesTeamSamples.contract.test.ts` 与 `scripts/create-vgcpastes-refresh-pr.mjs` 的最低数量门禁。

## 硬约束

- 只通过修改 `scripts/ingest-vgcpastes-champions.mjs` 的筛选常量并重跑脚本来清理旧队，严禁手改生成 JSON。
- 保持固定日期常量；不要改成运行时滚动窗口，否则 `--check` 与生成产物会每天漂移。
- 严禁 push `main`、`automation/pokedb-environment-refresh` 或 `automation/vgcpastes-team-refresh`。
- 每次从最新 `origin/main` 新建普通策展分支，只创建 draft PR，由人工合并。
- 不运行或重生成 `tests/pwa/visual.spec.ts-snapshots/`。
- 发现新 regulation（例如 M-C）时，只提交 issue 或 draft proposal 说明数据源、字段、筛选、前端标签与迁移方案，不自行接入。

## 标准流程

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c chore/curate-vgcpastes-YYYY-MM

npm run data:vgcpastes:champions-ma:check
npm run data:vgcpastes:champions-mb:check
```

阅读 audit 与样本规模，调整筛选常量后重新生成受影响 regulation：

```bash
npm run data:vgcpastes:champions-mb
npm test
npm run build
git diff --check
```

确认 diff 仅包含有意修改的脚本、门禁/测试阈值和脚本生成的 JSON，再提交并创建 draft PR：

```bash
git add -- scripts/ingest-vgcpastes-champions.mjs src/data/external/vgcpastes \
  src/data/vgcpastesTeamSamples.contract.test.ts scripts/create-vgcpastes-refresh-pr.mjs
git commit -m "data: curate VGCPastes team library"
git push -u origin HEAD
gh pr create --draft --base main --title "data: curate VGCPastes team library"
```

PR 正文应记录旧/新筛选窗口、每项 cap、M-A/M-B 样本数、issues 变化和本地未完成的验证。
