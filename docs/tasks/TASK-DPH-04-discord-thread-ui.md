# TASK-DPH-04：Discord Thread UI 与 owner 命令

状态：**实现与 fake 验收完成；真实 Thread/UI 验收待 owner 操作**
依赖：TASK-DPH-00、TASK-DPH-01、TASK-DPH-02、TASK-DPH-03
后续：TASK-DPH-05、TASK-DPH-06

## 目标

把 Harness 状态安全地映射到 Discord：Message Command 从原消息建 Thread、真实置顶状态卡、owner-only 续问/控制命令、队列显示和脱敏事件输出。

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

1. 注册并处理两个 guild Message Command。interaction 必须在 Discord 时限内 defer；后续创建 public Thread、持久化 thread ID、发状态卡并实际执行 pin。
2. 对同一个 source_message_id 使用数据库唯一约束。重复 interaction 必须返回既有 Thread/session，不创建第二条队列或工作树。
3. 仅接受配置的 guild、父频道、owner user ID 和由 Harness 记录的 Thread。忽略所有 bot author、其他用户、私信、其他频道和普通父频道消息。
4. Thread 内非控制文本创建 provider resume turn。控制命令仅支持 !status、!model <name>、!effort <level>、!provider <codex|claude>、!stop、!approve、!reject、!resume、!accept；未知控制命令只返回简短帮助。
5. !model 在 running turn 时拒绝并说明等待条件；!provider 不能伪称共享隐藏历史。归档 Thread 的合法输入先尝试 unarchive，失败时给出父频道 !resume S-#### fallback。
6. 状态卡展示 S-id、provider、requested/configured/reported model、branch、queue position、turn、状态、最后安全错误摘要和下一步。更新以 2 至 5 秒节流合并；绝不把每个 token 变为新消息。
7. 只向 Discord 发送脱敏 assistant/message/tool summary/exit code。隐藏 reasoning、raw JSONL、完整 stdout/stderr 和所有 secret 一律不发送。大日志以已脱敏附件处理，并遵守 Discord 文件大小限制。

## 必测场景

- fake interaction 建 Thread、发状态卡、pin，并在数据库产生唯一映射。
- 重复 source message、竞态 interaction、归档 Thread、pin 失败、权限失败均不丢 SQLite 状态。
- 非 owner/其他 bot/父频道文本没有任何队列或 provider 副作用。
- owner 连续两条 Thread 消息分别入队；状态卡显示正确位置。
- redaction fixture 中的 token、Bearer、API key、webhook URL 不出现在 Thread 或附件。
- !model、!effort、!provider、!stop 的非法状态/参数都有确定性错误，且不执行 shell。

## 真实验收

在 TASK-DPH-00 的隔离测试频道中，用 owner 自己的一条消息和一条 Hermes 消息分别触发 Message Command。确认手机/桌面可见 Thread、状态卡确已置顶、bot 不响应 Hermes/bot 消息。此时可以使用 fake provider，不要求创建 PR。

## 验收命令

~~~text
cd tools/dev-pipeline-harness
python -m unittest discover -s tests -v
git diff --check
~~~
