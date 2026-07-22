# TASK-DPH-01：Harness scaffold、SQLite 状态与队列

状态：**已实现并通过自动化验收**
依赖：TASK-DPH-00 可未完成，但不得读取其 secret
后续：TASK-DPH-02

## 目标

在 LuxrayKit 内建立独立 Python 子项目，并实现可迁移的 SQLite 状态层、owner queue 和 source-message 去重。此任务不调用 Discord、provider CLI、Hermes、GitHub 或 systemd。

## 允许改动

~~~text
tools/dev-pipeline-harness/pyproject.toml
tools/dev-pipeline-harness/src/dev_pipeline_harness/**
tools/dev-pipeline-harness/tests/**
~~~

如确实需要忽略 Python 临时产物，只能最小化修改根 .gitignore，并说明原因。不得触碰 package.json、Worker、Hermes plugin、现有应用源码或生产配置。

## 实施要求

1. 使用 src layout；运行时仅依赖 Python 标准库和 discord.py 所需的明确依赖。测试优先用标准库 unittest，避免把 Python 依赖带入根 Node install。
2. 实现 Config 数据模型，只解析环境变量并校验绝对路径、正整数、Discord snowflake 和模型 allowlist；不得把 secret 写进 repr、异常或日志。
3. 实现 StateStore 与 schema migration。首次打开创建本规格定义的 harness_sessions、provider_sessions、turns、queue、event_cursors、pipeline_runs；设置 WAL、foreign_keys、busy_timeout。
4. S-#### 由 SQLite 事务分配，不依赖扫描目录或 Discord title。source_message_id 与 discord_thread_id 施加唯一约束。
5. 实现状态枚举和条件状态转移；非法转移必须报明确异常，不能静默覆盖 terminal turn。
6. 实现 queue 入队、取消、按 ordinal 排序、claim-next、release/finalize 的原子方法；同一 turn 不得有两个有效 queue 项。
7. 建立私有 state 目录、locks、sessions 目录，并在新建文件时显式设置 0700/0600。不得因测试在仓库内产生 SQLite、JSONL 或日志。

## 必测场景

- 新数据库 migration 可重复执行，版本升级不丢已有行。
- 两次并发式模拟为同一 source_message_id 建 session，只有一个成功。
- 两个 turn 入队后顺序稳定；claim-next 只能返回一个；terminal turn 不可再次 claim。
- requested_model、configured_model、reported_model 与 default_model 的语义符合落地规格。
- 非法状态转移、空 allowlist、相对目录、world-readable env 产生可行动的错误且不泄漏 secret。

## 验收命令

~~~text
cd tools/dev-pipeline-harness
python -m unittest discover -s tests -v
python -m compileall -q src
~~~

提交前还需从仓库根执行 git diff --check。此任务结束时不得有真实 provider 调用或 Discord 网络副作用。
