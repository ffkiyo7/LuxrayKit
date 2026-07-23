# TASK-DPH-04：Discord Thread UI 与 owner 命令

状态：**实现与 fake 验收完成；真实 Thread/UI 验收待 owner 操作**
依赖：TASK-DPH-00、TASK-DPH-01、TASK-DPH-02、TASK-DPH-03
后续：TASK-DPH-05、TASK-DPH-06

## 目标

把 Harness 状态安全地映射到 Discord：唯一 `/dispatch task:<任务>` 先发原生确认卡，再由 owner 选择 provider 建 Thread；保留真实置顶状态卡、owner-only 续问/控制命令、队列显示和脱敏事件输出。

## 允许改动

~~~text
tools/dev-pipeline-harness/src/dev_pipeline_harness/discord_bot/**
tools/dev-pipeline-harness/src/dev_pipeline_harness/commands.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/formatting.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/redaction.py
tools/dev-pipeline-harness/tests/**
~~~

可以为 Discord 模型增加接口层和 fake client。不得修改 Hermes plugin、现有 Discord webhook 配置、Cloudflare Worker 或任何 bot token 文件。

## 实施要求

1. 只注册并处理一个 guild Slash Command：`/dispatch task:<任务>`。它先持久化待确认任务，在父频道发原生确认卡（Codex、Claude、修改任务三个组件）；provider 选择前不得创建 session、队列、worktree 或模型 turn。
2. 确认卡原样显示 owner 输入的 task；“修改任务”以 Discord Modal 提供多行 Text Input，提交后更新同一张卡。待确认任务及其 confirmation message ID 必须可迁移地持久化，bot 重启后按钮仍可处理。
3. 同一待确认任务的并发按钮 interaction 只能创建一个 session/worktree；之后的点击返回既有 Thread/session，不创建第二条队列或工作树。
4. 仅接受配置的 guild、父频道、owner user ID 和由 Harness 记录的 Thread。拒绝其他用户、私信和其他频道的 Slash/Button/Modal interaction；忽略所有 bot author 和普通父频道消息。
5. Thread 内非控制文本创建 provider resume turn。控制命令仅支持 !status、!model <name>、!effort <level>、!provider <codex|claude>、!stop、!approve、!reject、!resume、!accept；未知控制命令只返回简短帮助。
6. !model 在 running turn 时拒绝并说明等待条件；!provider 不能伪称共享隐藏历史。归档 Thread 的合法输入先尝试 unarchive，失败时给出父频道 !resume S-#### fallback。
7. 状态卡展示 S-id、provider、requested/configured/reported model、branch、queue position、turn、状态、最后安全错误摘要和下一步。更新以 2 至 5 秒节流合并；绝不把每个 token 变为新消息。
8. `/dispatch` 确认卡可原样复述 owner task；其余发往 Discord 的 assistant/message/tool summary/exit code 仍须脱敏。隐藏 reasoning、raw JSONL、完整 stdout/stderr 一律不发送。大日志以已脱敏附件处理，并遵守 Discord 文件大小限制。

## 必测场景

- fake `/dispatch` 在 provider 选择前不建 session/worktree；确认后建 Thread、发状态卡、pin，并在数据库产生唯一映射。
- Modal 改写 task、重复/竞态 provider click、归档 Thread、pin 失败、权限失败均不丢 SQLite 状态。
- 非 owner/其他 bot/父频道文本没有任何队列或 provider 副作用。
- owner 连续两条 Thread 消息分别入队；状态卡显示正确位置。
- redaction fixture 中的 token、Bearer、API key、webhook URL 不出现在 Thread 或附件。
- !model、!effort、!provider、!stop 的非法状态/参数都有确定性错误，且不执行 shell。

## 真实验收

在 TASK-DPH-00 的隔离测试频道中，用 owner 在手机和桌面分别执行 `/dispatch task:<低风险文本>`。确认确认卡原样复述 task、Modal 可改写、两个 provider 按钮仅 owner 可用，且选择前没有 session/worktree；选择后可见 Thread、状态卡确已置顶。此时可以使用 fake provider，不要求创建 PR。

## 验收命令

~~~text
cd tools/dev-pipeline-harness
python -m unittest discover -s tests -v
git diff --check
~~~
