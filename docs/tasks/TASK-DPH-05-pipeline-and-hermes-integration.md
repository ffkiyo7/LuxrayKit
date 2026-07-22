# TASK-DPH-05：PLAN/TASK/review、Hermes 与 PR 门禁

状态：**实现与 mock 门禁验收完成；真实 PR/preview 链路留待 DPH-07**
依赖：TASK-DPH-01 至 TASK-DPH-04
后续：TASK-DPH-06、TASK-DPH-07

## 目标

实现 Harness 对现有开发流程的受控接线：生成/追踪 PLAN、TASK、REVIEW，使用目标 worktree 的 cwd 执行 Hermes 弱模型，实现 Draft PR、CI、preview 和 owner accept 的事实校验。此任务不允许自动合并。

## 允许改动

~~~text
tools/dev-pipeline-harness/src/dev_pipeline_harness/pipeline/**
tools/dev-pipeline-harness/src/dev_pipeline_harness/hermes.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/github.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/preview.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/context_pack.py
tools/dev-pipeline-harness/tests/**
ops/runbooks/dev-pipeline-harness.md
~~~

runbook 可以先创建骨架。不得修改 .github/workflows、wrangler 配置、main、现有 maintenance cron 或 Hermes gateway plugin。

## 实施要求

1. PipelineRun 只保存 Markdown 路径/hash、Git SHA、review round、PR/CI/preview 和 accept 审计。PLAN/TASK/REVIEW 内容仍由强模型写入 session worktree 的 docs 目录。
2. TASK parser 必须拒绝缺少目标、允许改动文件、禁区、DoD 或验证命令的任务。弱模型 prompt 固定包含这些约束和当前 worktree/branch，不得仅转发自然语言。
3. Hermes 弱模型执行使用 hermes -z 由 runner 的 cwd=<session-worktree> 启动；不得用 HTTP POST /v1/runs 代替，因为该 API 不携带 cwd。Hermes HTTP API 若保留，只可用于其自身的 status/stop 控制。
4. review 运行任务指定命令；默认 LuxrayKit 的相关改动至少 npm test，前端行为还需 npm run build。失败结果写 REVIEW，最多两轮；第三轮状态 needs_owner，除非 owner 已明确开启白名单内强模型直修。
5. PR 只能从 pipeline/S-#### 分支创建且默认 Draft。推送前验证工作树、branch、HEAD 和 Markdown 状态一致；严禁 push main。
6. !accept <PR#> <full-head-SHA> 只接受 owner，且必须实时核对：保存的 PR、远端 head SHA、CI 成功、preview URL/health 和没有新的 review/task 阻塞。核对通过后才调用 gh pr merge 的 match-head-commit；任一条件改变即拒绝。
7. !reject 只记录反馈并回到 review/task 状态；不删除 worktree、不关闭 PR、不改 main。所有 GitHub/Cloudflare 实际调用都经可 mock 的接口，以便单元测试不触网。

## 必测场景

- 无 cwd 的假 Hermes API 不能被选为 TASK executor；subprocess command 使用目标 worktree cwd。
- 不合格 TASK、白名单外文件、第二次 review 失败、head SHA 漂移、CI 非绿、preview 不健康都阻断下一阶段。
- accept 用旧 SHA、错误 owner、非 Draft/错误 PR、无 preview 的 UI 任务均不会调用 merge。
- mock GitHub 显示匹配 SHA/绿 CI/健康 preview 时，唯一合并调用带 match-head-commit。
- context pack 含需求、决策、HEAD、未解决项和安全摘要，不含 token/raw hidden reasoning。

## 验收命令

~~~text
cd tools/dev-pipeline-harness
python -m unittest discover -s tests -v
git diff --check
~~~

真实 GitHub PR、Cloudflare preview 和 merge 只在 TASK-DPH-07 的明确 dogfood 中使用。
