# TASK-DPH-02：Worktree、transient runner 与恢复

状态：**已实现并通过 fake provider/远端 transient 验收**
依赖：TASK-DPH-01
后续：TASK-DPH-03

## 目标

实现独立 worktree 的创建、全局单并发调度、systemd --user transient turn runner、可重放转录和启动后的 reconcile。先用 fake provider 验证，不调用真实 Codex/Claude。

## 允许改动

~~~text
tools/dev-pipeline-harness/src/dev_pipeline_harness/worktrees.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/scheduler.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/runner.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/systemd.py
tools/dev-pipeline-harness/src/dev_pipeline_harness/transcript.py
tools/dev-pipeline-harness/tests/**
~~~

可以新建同一 src 包中的辅助模块。不得改现有 ~/LuxrayKit-maintenance、生产 clone、Cloudflare 配置或实际 provider 配置。

## 实施要求

1. worktree manager 先 fetch origin/main，再以 pipeline/S-#### 从 origin/main 创建到 WORKTREE_ROOT/S-####。必须 realpath 校验，拒绝策展 clone、maintenance clone、已有目标、非 Git repo 和不干净的受控服务 checkout。
2. coordinator 在 SQLite transaction 中 claim 一个 turn，再用 systemd-run --user 创建唯一 unit dev-pipeline-turn-S-####-T-####。实际 CLI 由 runner 执行，不由 bot 持有 stdout pipe。
3. runner 先取得全局 flock 和以 worktree realpath 哈希命名的 flock；使用 create_subprocess_exec、cwd=worktree、无 shell。runner 写 raw JSONL、脱敏日志、result JSON，并以幂等 SQLite transaction 最终化 turn。
4. systemd unit 必须设置 WorkingDirectory、KillMode=control-group、UMask=0077、TimeoutStopSec；runner 不继承 Discord token，也不得把完整 env 写入日志。
5. 实现 stop、reconcile 和 event cursor。重启后 active unit 只重新消费转录；unit 已结束且 result 存在时只导入一次；没有 unit/result 时标 interrupted，绝不重跑同一 attempt。
6. 禁止自动删除 worktree。archive/delete 必须是未来显式 owner 命令，不在本任务实现。

## 必测场景

- 使用临时 Git repo 和 fake JSONL provider 创建 worktree，分支/基础 SHA/路径均正确。
- 同时排两条 fake turn，第二条等待，第一条结束后才开始第二条。
- 模拟 runner 写完 result 后 coordinator 崩溃；reconcile 不重复执行且状态正确。
- 模拟 active unit；reconcile 不产生第二个 unit。
- stop 作用于记录的 unit/cgroup，不杀 Hermes 或其他用户进程。
- raw 文件为 0600，Discord 副本已被 fake secret 脱敏。

## 验收命令

~~~text
cd tools/dev-pipeline-harness
python -m unittest discover -s tests -v
systemd-run --user --wait --collect /usr/bin/true
git -C /home/ubuntu/LuxrayKit worktree list
~~~

最后一条只用于 VPS 验证；不得移除、重置或清理已有 worktree。
