# TASK-DPH-03：Codex/Claude adapter 与模型切换

状态：**已完成：disposable repo 中的真实 Codex 双模型 start/resume、Claude start/resume/effort 切换，以及 Codex → Claude context-pack 切换均已通过。VPS 上的 Claude.ai Pro 登录态已复核；`opus` / `claude-opus-4-8` 均可调用。Harness 默认且唯一允许模型为 `claude-opus-4-8`。**
依赖：TASK-DPH-02
后续：TASK-DPH-04、TASK-DPH-06

## 目标

把 Codex 和 Claude Code 统一为可恢复的 provider adapter，并以最小、一次性的真实 smoke 验证 start、resume 和同 provider 换模型。真实 smoke 会消耗账号配额，只能在执行者明确告知 owner 后运行，且必须使用 disposable Git repo。

## 允许改动

~~~text
tools/dev-pipeline-harness/src/dev_pipeline_harness/adapters/**
tools/dev-pipeline-harness/src/dev_pipeline_harness/models.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/config.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/redaction.py
tools/dev-pipeline-harness/tests/**
docs/plans/dev-pipeline-harness-spike.md
~~~

最后一项只用于记录实测后的 CLI version/事件字段修订；不得记录 session transcript、token、email 或完整命令输出。

## 实施要求

1. adapter API 固定输出 session_started、assistant_message、tool_started、tool_finished、turn_finished、turn_failed；未知事件保留在私有 raw 转录，并以安全摘要记录。
2. Codex 新建使用 exec --json、workspace-write sandbox 和配置模型；从 thread.started 立即保存 ID。恢复使用 exec resume --json、同一 ID 和 -m。禁止 ephemeral。
3. Claude 新建/恢复使用 -p、--output-format stream-json、--verbose、--include-partial-messages、--model；恢复必须带 --resume。使用 --permission-mode dontAsk 加任务级明确工具 allowlist，禁止 bypassPermissions。
4. 所有 argv 由 list 构建，不经 shell。每次执行记录 CLI version、cwd、requested/configured model 和 command 类型，但不记录 prompt 中的 secret。
5. `/dispatch` 建立的初始 provider session 在置顶配置卡中选择 default 值，并在“固定配置并开始”时与 source turn 原子化持久化；入队时 snapshot 模型。无效模型在本地 allowlist 阶段拒绝，provider 拒绝也不得修改 default_model。固定后的 Discord session 不接受 `!model` 修改。
6. 若内部恢复流程需要 provider 切换，必须新建 provider_sessions 行、生成 context.md 并标 switched_from_id；严禁复用另一 provider 的 session ID。当前 Discord 产品交互不开放 `!provider`，provider 在 `/dispatch` 确认卡中一次性选择。
7. reasoning effort 按 provider 独立 allowlist 校验并持久化 default/configured snapshot；Codex 使用 `model_reasoning_effort`，Claude 使用 `--effort`，不得把不受支持的 level 传给另一 provider。初始配置卡中 Codex 可选择 model/effort；Claude 固定 `claude-opus-4-8`、仅可选择 effort；固定后不接受 `!effort` 修改。

## 真实 smoke

在 mktemp 创建的 disposable Git repo 中，对每种已配置 provider 执行简短非敏感提示：

1. 模型 A 新建 session，保存 ID。
2. 模型 B resume 同一 ID，并验证数据库 ID 未变。
3. 读取事件确认第二 turn 没有被当作新 provider session。
4. 以非法 allowlist 外模型创建 turn，验证安全失败。
5. 在每个 provider 中切换至少一个合法 effort，并验证命令 argv 与 turn snapshot 一致；非法 effort 安全失败。
6. 从 Codex 切 Claude（或反向）验证新 provider session/context pack。

若账户没有两个允许模型、provider 需要额外登录、或 smoke 会超出 owner 的配额授权，停止并报告该条件，不要降级为伪造测试结果。

## 验收

- fixture 测试覆盖 Codex JSONL、Claude stream-json、截断行、未知事件和 secret 脱敏。
- 两 provider 的真实最小 smoke 均记录通过/失败的非敏感证据和 CLI version。
- 同 provider 换模型保持 provider_session_id；跨 provider 绝不保持该 ID。
- Claude resume 从原 worktree cwd 启动；无裸 codex PATH 依赖。

## 验收命令

~~~text
cd tools/dev-pipeline-harness
python -m unittest discover -s tests -v
<CODEX_BIN> exec resume --help
<CLAUDE_BIN> --help
~~~
