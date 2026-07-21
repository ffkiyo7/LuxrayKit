# 实现方案:队伍库(VGCPastes)自动化刷新 + 验证防线

> 本文档是一次性实现任务书,写给执行本任务的 coding agent。实现合并后本文档可删除或归档。
> 执行前先读 `AGENTS.md`(工作规则)与 `docs/DEVELOPER_GUIDE.md` §6–§9(自动化与部署事实)。

## 背景与目标

队伍库 = 从 VGCPastes Champions 表格摄入的锦标赛队伍样本,由
`scripts/ingest-vgcpastes-champions.mjs` 生成 `src/data/external/vgcpastes/` 下 4 个 JSON
(`reg_{ma,mb}_champions_{ma,mb}_team_samples.json` + 两个 `*_audit.json`),前端在
`src/data/environment.ts` 按 regulation 独立 chunk 懒加载,合并进环境数据后在
`src/pages/TeamBrowseView.tsx`(队伍一览)展示。

目标:把队伍库的**机械刷新**做成纯 cron 跑脚本(复用现有 PokeDB 刷新 → 自动化 PR →
daily-auto-merge 模式),并为整条链路补上**确定性验证防线**(数据契约单测 + Playwright
渲染断言),保证自动合并进 `main`(≈直接上生产)的数据一定能在前端渲染出来。
**策展判断**(收紧筛选窗口、清理旧队、接入新 regulation)不在本任务自动化范围内——
本任务只为它写一份 runbook 文档(任务 6),执行者是另一个低频运行的 agent,PR 走
draft + 人工合并。

**主机拓扑(勿混淆)**:仓库 owner 有两台机器——①现有**外部维护 VPS**(东京
Lightsail,已配好 repo clone / gh 认证 / bot git 身份,可跑 PokeDB 静态快照 PR；但环境
快照另有 Worker→KV 在线刷新路径,且近期实测 Worker 成功而该 VPS 出口被拒,它不是唯一来源),
②**Hermes Agent 主机**(另一台 VPS,跑弱模型 agent)。轨道 1 的每周 cron 加在 ①上,
**与 Hermes 无关**;轨道 2 的 runbook 由 ②上的 Hermes 执行。两条轨道都不在 CI 之外
做任何验证,Playwright 只跑在 GitHub Actions。

**总原则:验证环节必须是确定性测试,不引入任何模型判断;自动合并通道只允许纯生成
JSON 通过。**

## 现状事实(已核实,直接引用,不必重新调研)

- 仓库当前样本数:M-A 99 支(筛选窗口已冻结,输出稳定)、M-B 30 支；2026-07-19
  `--dry-run` 从上游得到 M-B 143 支 / 0 issues，已超过策展 runbook 的约 120 支触发线，
  本任务不自动收紧筛选或提交该批生成数据。
- audit JSON 结构:`{ retrievedAt, sourceUrl, inputRows, filteredRows, importedTeams, issues[] }`。
- 样本字段:`id, dataKind('external-snapshot'), sourceId, sourceLabel, author, season('reg-ma'|'reg-mb'), score, regulation(仅 M-B 样本携带,值 'M-B'), title, battleType('doubles'), reportUrl, tournament?, eventRank?, dateShared?, replicaCode?, hasMoves, hasSpread, slots[6]`;slot 字段:`pokemonId, abilityId, itemId, nature, statPoints, moveIds`。
- CI:`.github/workflows/ci.yml` 单 job,check 名 **`Test, build, and validate Worker`**,已在
  ubuntu runner 上跑 Playwright(`npm run test:pwa -- tests/pwa/offline.spec.ts`,
  `playwright.config.ts` 用 runner 预装 Chrome,`webServer` 起 `npm run preview -- --port 4173`)。
- daily-auto-merge:`.github/workflows/daily-auto-merge.yml`,目前只合 head 为
  `automation/pokedb-environment-refresh` 的绿色 PR,门禁即上述 check 名。
- PokeDB 刷新 PR 脚本样板:`scripts/create-pokedb-environment-refresh-pr.mjs`
  (从 origin/main 重建分支 → 跑生成脚本 → **staged 文件白名单、越界抛错** → force-with-lease
  push → gh 创建/更新 PR)。新脚本照抄这个骨架。
- 前端导航路径(Playwright 用):`/` → 关掉引导(点「跳过」→「开始探索」,参考
  `tests/pwa/offline.spec.ts` 的 `dismissOnboarding`)→ 环境首页 → 点 aria-label
  **「查看全部队伍」** 按钮(仅当有样本时渲染)→ 「队伍一览」页。队伍计数文案为
  `` `${visibleSamples.length} 支队伍` ``(`TeamBrowseView.tsx` ~L246);规则筛选按钮组
  在「规则」标题下,按钮 name 为 `M-B` / `M-A` / `全部规则`,带 `aria-pressed`;默认
  regulation 筛选为 `all`、battleType 为 doubles(两个 JSON 里所有样本都是 doubles)。
- 视觉回归基线 `tests/pwa/visual.spec.ts-snapshots/` 为 **win32 专属,严禁在本任务中
  运行/重新生成**;新增 Playwright 测试必须是纯断言,不做截图对比。

---

## 任务 1:数据契约单测(vitest)

新建 `src/data/vgcpastesTeamSamples.contract.test.ts`(vitest 会自动收集;直接静态
import 4 个 JSON,vitest/vite 原生支持)。仓库未装 zod,用手写断言即可。

对每个样本文件断言:

- 是数组;**M-A `length >= 90`,M-B `length >= 20`**(数量下限;M-B 会随赛季增长,
  阈值只防"整批消失/大幅缩水"事故)。
- 每个样本:`id` 非空字符串且**跨两个文件全局唯一**;`dataKind === 'external-snapshot'`;
  `battleType === 'doubles'`;`title` 非空;`season` 与所在文件一致(`reg-ma`/`reg-mb`);
  M-B 文件的样本 `regulation === 'M-B'`,M-A 文件的样本不携带 `regulation` 字段;
  `slots` 长度为 6,每个 slot 的 `pokemonId` 为非空字符串;`hasMoves`/`hasSpread` 为 boolean。

对每个 audit 文件断言:

- `importedTeams` 等于对应样本文件的 `length`;`issues` 是数组;`retrievedAt` 可被
  `Date.parse` 解析。

注意:阈值常量写在测试文件顶部并加注释说明"由策展 runbook 负责随规模调整"。

## 任务 2:Playwright 渲染断言 `tests/pwa/team-samples.spec.ts`

目的:断言"JSON 里的队伍确实渲染到了页面上",覆盖"数据合并了但前端没展示"这类回归。

- 期望值在测试运行时用 `node:fs` 读取那两个样本 JSON 计算(不要硬编码 129/99/30;
  用 fs 而非 ts import,避免 Playwright 侧 tsconfig JSON 解析问题)。
- 步骤:
  1. 注册 `page.on('pageerror')` 与 `page.on('console')`(type === 'error')收集器。
  2. `context.clearCookies()` → `goto('/')` → 复用 offline.spec.ts 的 `dismissOnboarding`
     模式(可复制该 helper 或抽到共享文件)→ 等到 heading「环境」可见。
  3. 点 `getByRole('button', { name: '查看全部队伍' })`(必要时先滚动);断言 heading
     「队伍一览」可见。
  4. 先在「队伍类别」筛选组点 `赛事`，排除同属双打但不来自 VGCPastes 的 PokeDB
     排位样本；再断言文本 `` `${maLen + mbLen} 支队伍` `` 可见(规则仍为全部规则)。
  5. 点规则筛选按钮 `M-B`(exact,注意与「队伍类别」筛选组区分,必要时先定位「规则」
     分组再找按钮);断言 `` `${mbLen} 支队伍` `` 可见。
  6. 断言至少一张队伍卡片渲染(查看 `src/pages/TeamSampleCard.tsx` 选一个稳定
     selector,比如卡片上的导入按钮或第一支队伍的 title 文本;排序为最新优先)。
  7. 断言:`pageerror` 收集为空;console error 中**不含** `VGCPastes` 字样(环境 API 在
     vite preview 下会走静态快照回退,可能有无关噪音,所以只对 VGCPastes chunk 加载
     失败报错做硬断言)。
- **不截图、不动 visual 基线。**
- CI 接入:改 `.github/workflows/ci.yml` 现有 Playwright step,把命令改为
  `npm run test:pwa -- tests/pwa/offline.spec.ts tests/pwa/team-samples.spec.ts`
  (step 名可改为 "Run PWA smoke tests";**job 名 / check 名 `Test, build, and validate
  Worker` 绝对不能改**,daily-auto-merge 靠它做门禁)。

## 任务 3:摄入脚本跨平台修复

`scripts/ingest-vgcpastes-champions.mjs` 的网络回退硬编码了 `curl.exe`(~L223),在
Linux VPS 上回退路径必失败。改为按平台选择:
`const curlCommand = process.platform === 'win32' ? 'curl.exe' : 'curl';`
Windows 上行为保持不变。

## 任务 4:刷新 PR 脚本 `scripts/create-vgcpastes-refresh-pr.mjs`

照抄 `create-pokedb-environment-refresh-pr.mjs` 的骨架(命令探测、run/capture、
从 `origin/main` 重建分支、staged 白名单守卫、force-with-lease、gh 创建/更新 PR),差异点:

- 环境变量:`VGCPASTES_REFRESH_BASE_BRANCH`(默认 `main`)、`VGCPASTES_REFRESH_BRANCH`
  (默认 **`automation/vgcpastes-team-refresh`**)。
- 参数:`--reg=mb`(默认)或 `--reg=mb,ma`,决定跑哪些
  `npm run data:vgcpastes:champions-*`。cron 用默认值(M-A 窗口已冻结,重跑只是白耗
  ~100 次 pokepast.es 请求)。
- **健康门禁**(在 push/PR 之前,读取本次生成的 audit JSON):若任一所跑 regulation 的
  `issues.length > 10`,或 M-A 的 `importedTeams < 90`,或 M-B 的 `importedTeams < 20`,
  则打印报告并以非零码退出,
  **不提交不提 PR**(留给人/策展 agent 处理;防止上游或 pokepaste 抖动导致队伍库
  缩水后被自动合并)。阈值写成脚本顶部常量并注释。
- 提交白名单:仅 `src/data/external/vgcpastes/` 下那 4 个 JSON(沿用"staged 出现白名单
  外文件即抛错"守卫)。
- commit message / PR 标题:`data: refresh VGCPastes team library`;PR body 含每个
  regulation 的 `inputRows / filteredRows / importedTeams / issues 数`、host、时间戳。
  **PR 建为非 draft**(与 PokeDB 自动化分支同待遇,才能被 daily-auto-merge 合并;
  AGENTS.md 的"Agent PR 默认 Draft"适用于功能 PR,任务 7 会同步措辞)。
- `--dry-run`:保持当前 Git 分支、index 与 worktree 不变,跑完摄入与门禁后恢复生成文件,
  只打印将提交的文件与报告,跳过 fetch/切分支/commit/push/PR。
- 创建新 PR 时显式为非 draft；若复用的现有 PR 是 draft，先转为 ready 再更新标题与正文。
- `package.json` 增加 `"data:vgcpastes:pr": "node scripts/create-vgcpastes-refresh-pr.mjs"`。

## 任务 5:daily-auto-merge 支持多自动化分支

`.github/workflows/daily-auto-merge.yml`:把 `AUTOMATION_BRANCH` 改为空格分隔的
`AUTOMATION_BRANCHES='automation/pokedb-environment-refresh automation/vgcpastes-team-refresh'`,
外层循环分支、内层逻辑不变(CI check 成功、非 draft、无 hold 标签、head 不落后于
main、`--match-head-commit`)。同步更新文件头注释。**白名单以外的分支永远不合。**

## 任务 6:策展 runbook `docs/automation/TEAM_LIBRARY_CURATION.md`

写给低频运行的策展 agent(弱模型,运行在独立的 Hermes 主机上,**不是**外部维护 VPS)
的操作手册,要点:

- **主机前提**:Hermes 主机需要自己的 repo clone 与 gh 认证(能开 draft PR 即可,
  不需要合并权限);机器内存有限,本地验证以 `npm test` 为最低要求,`npm run build`
  内存不足时可交给 draft PR 的 CI 验证(CI 在 draft PR 上照常运行,而 daily-auto-merge
  只合非 draft,所以 draft 永远不会被自动合并)。
- **职责**(月度或按需):读两个 audit JSON 与样本数;M-B 总数超 ~120 或临近 regulation
  末期时,上调 `MB_MIN_SHARED_DATE`(保持滚动约 60 天)或收紧 `MB_PER_EVENT_CAP`;
  出现线下大赛后按脚本内注释把 M-B 策略向 M-A 式白名单演进;处理 audit issues
  (名称映射缺失 → 修 `src/lib/pokepasteSource` 的映射;抓取失败 → 重试);相应上调
  任务 1 契约测试与任务 4 门禁的阈值。
- **硬约束**:清理旧队**只能**通过改 `scripts/ingest-vgcpastes-champions.mjs` 的筛选
  常量后重跑脚本实现,**严禁手改生成 JSON**;保持"固定日期常量"设计,不要改成运行时
  滚动窗口(会让 `--check` 与产物每天漂移);严禁 push `main` 或两个 automation 分支;
  一律从 origin/main 开新分支、提 **draft PR**、人工合并;提 PR 前本地过 `npm test` 与
  `npm run build`;严禁运行/重生成视觉基线;发现新 regulation(如 M-C)时只提 proposal
  (issue 或 draft PR)说明接入方案,不得自行接入。
- 自动化 PR 的持久暂停只用 `hold` 标签；刷新脚本会把复用的 draft 自动化 PR 转回 ready。
- 两个 cron 共用 clone，PokeDB 半途失败可能留下脏生成文件并让 VGCPastes 下次拒跑；
  这是可见失败，PokeDB 后续成功刷新会自愈。

## 任务 7:文档同步(AGENTS.md 维护约定要求)

- `docs/DEVELOPER_GUIDE.md`:§7 新增「7.2 外部主机队伍库刷新器」——明确 cron 加在
  **§7.1 那台既有的外部维护 VPS** 上(同一 clone、同一 gh 认证,只是多一行 cron;
  与策展 agent 的主机无关),写清脚本、分支、健康门禁,cron 示例:每周一
  pokepaste/表格更新低峰时段跑 `npm run data:vgcpastes:pr`,如 `30 16 * * 1` UTC;§9 的 daily-auto-merge 描述改为两个自动化分支;§7 提及
  `data:vgcpastes:champions-*` 处补充 `--check` 与 PR 脚本。
- `AGENTS.md`:§4 中"只自动合并 `automation/pokedb-environment-refresh`"改为列出两个
  自动化分支;§3 生成文件表补一行 `src/data/external/vgcpastes/*.json` →
  `npm run data:vgcpastes:champions-ma|mb`。**保持全文 ≤200 行。**

## 交付方式与顺序

两个 PR(均 draft,人工合并;分支从 origin/main 开):

1. **PR A(先合,独立成立的安全网)**:任务 1 + 任务 2。
2. **PR B**:任务 3 + 4 + 5 + 6 + 7。

## 验收清单

- [ ] `npm test` 通过(含新契约测试)。
- [ ] `npm run build` 通过。
- [ ] `npm run test:pwa -- tests/pwa/team-samples.spec.ts` 本地通过(需要本机 Chrome;
      不要跑 visual.spec.ts)。
- [ ] 临时把某个样本 JSON 改成 `[]` 后,契约测试与 team-samples spec 都变红(验证防线
      真的能拦),**验证完还原文件**(`git checkout -- src/data/external/vgcpastes/`)。
- [ ] `node scripts/create-vgcpastes-refresh-pr.mjs --dry-run` 输出摄入报告与将提交文件,
      未产生 commit/push/PR(需要外网访问 Google Sheets 与 pokepast.es)。
- [ ] `daily-auto-merge.yml` 语法有效(`gh workflow view` 或 actionlint,如可用)。
- [ ] 换行为 LF(仓库 `.gitattributes` 治理,勿提交批量换行变更)。

## 明确不做(Out of scope)

- 外部维护 VPS 上的 cron 安装、以及 Hermes 主机的 clone/gh 认证配置(仓库 owner
  手动做,指引在任务 7 的 guide §7.2 与任务 6 的 runbook 里)。
- 修改任何筛选常量(`MB_MIN_SHARED_DATE` 等)、清理现有队伍——那是策展 runbook 的
  运行时职责,不是本次实现。
- M-A 样本退役/删除(等 M-C 时由人决策)。
- 部署后对生产站的 smoke(可选的第 3 层防线,本次不做)。
