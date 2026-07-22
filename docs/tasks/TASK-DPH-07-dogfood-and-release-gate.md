# TASK-DPH-07：低风险 dogfood 与发布门禁

状态：**待 owner 择日执行；当前明确不启动真实 smoke/dogfood**
依赖：TASK-DPH-00 至 TASK-DPH-06 全部通过
后续：Harness v1 可投入日常使用

## 目标

用一个低风险、仅文档的 LuxrayKit 改动完整验证 Harness。此任务是运行验证，不是功能扩展；任何生产合并仍须由 owner 在 Discord 中带 SHA 明确批准。

## Dogfood 范围

- 选择不改 Worker、KV、构建脚本、依赖、产品行为的文档澄清。
- 由 owner 从真实 Discord 原消息用 Message Command 建 session。
- 在 S-#### worktree 中创建 PLAN、至少一个 TASK 和 REVIEW。
- 至少用一个 provider 完成文档改动；若配额/账号允许，分别验证 Codex 和 Claude 的 start/resume/model-switch。
- 创建 Draft PR，等 CI 与影子 Worker preview；owner 检查后决定 accept 或 reject。

## 必须验证的链路

1. Message Command 对同一源消息去重，Thread、真实置顶状态卡、owner-only 文本续问均工作。
2. 两条 Thread 同时排队时最多一个 transient provider unit 运行；另一条的状态卡显示正确位置。
3. 中断一个可安全中断的 turn 后，原 Thread 能以相同 provider session 恢复；Harness service restart 后不重复执行已完成 turn。
4. 同 provider 的模型 A 到模型 B resume 维持 provider session ID；跨 provider 创建新的 provider session 和 context pack。
5. 原始 JSONL/secret 不出现在 Discord、PR diff、review 或 runbook。
6. 弱模型如参与，只能通过 hermes -z 在 S-#### cwd 写文档，不能写策展/maintenance clone。
7. Draft PR 的 CI、preview health、head SHA 与状态库一致；!accept 使用完整 SHA，错误 SHA/未绿 CI/非 owner 均被拒绝。

## 合并门禁

- Harness 不得自行 merge；执行者不得替 owner 发 !accept。
- owner 若接受，Harness 在合并前重新查询 PR head、CI 和 preview，再以 match-head-commit 执行。
- owner 若拒绝，保留 worktree、turn 转录和 PR，进入 review/task 状态；不要自动关闭或删除任何内容。
- 合并后验证 main 的 Workers Builds 生产部署和目标文档内容；若 owner 未 accept，停在 Draft PR，不把“CI 绿”视为上线。

## 交付证据

在 session worktree 的 docs/reviews 或对应 review 文档中记录：S-id、非敏感 provider/version、测试命令结果、PR 号、head SHA、CI 结论、preview URL、owner 决策和恢复演练结论。不得记录 token、email、session 全文或 secret。

## 完成定义

只有上述链路全部有证据且 owner 亲自做出 accept/reject 时，Harness v1 才能标为可用。若任何 provider、Discord 权限、恢复、脱敏或 SHA 门禁失败，保留 Draft PR 并回到对应 DPH TASK 修复。
