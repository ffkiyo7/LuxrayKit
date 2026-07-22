"""Small, dependency-free domain models shared by the harness."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any


class SessionStatus(str, Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_OWNER = "waiting_for_owner"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    CANCELLED = "cancelled"
    PLAN_APPROVED = "plan_approved"
    TASK_RUNNING = "task_running"
    REVIEW_PENDING = "review_pending"
    PR_OPEN = "pr_open"
    CI_PASSED = "ci_passed"
    PREVIEW_READY = "preview_ready"
    ACCEPTED = "accepted"
    MERGED = "merged"
    NEEDS_OWNER = "needs_owner"


class ProviderSessionStatus(str, Enum):
    ACTIVE = "active"
    SWITCHED = "switched"
    CLOSED = "closed"


class TurnState(str, Enum):
    QUEUED = "queued"
    LAUNCHING = "launching"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    CANCELLED = "cancelled"
    WAITING_FOR_OWNER = "waiting_for_owner"

    @property
    def terminal(self) -> bool:
        return self in {
            TurnState.SUCCEEDED,
            TurnState.FAILED,
            TurnState.INTERRUPTED,
            TurnState.CANCELLED,
        }


class Provider(str, Enum):
    CODEX = "codex"
    CLAUDE = "claude"


@dataclass(frozen=True)
class HarnessSession:
    id: str
    source_message_id: str
    discord_thread_id: str | None
    repo: Path
    worktree: Path
    branch: str
    status: SessionStatus
    context_path: Path | None
    status_message_id: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class ProviderSession:
    id: int
    harness_session_id: str
    provider: Provider
    provider_session_id: str | None
    default_model: str
    default_effort: str
    status: ProviderSessionStatus
    switched_from_id: int | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class Turn:
    id: str
    provider_session_id: int
    owner_message_id: str | None
    requested_model: str
    configured_model: str
    requested_effort: str
    configured_effort: str
    reported_model: str | None
    state: TurnState
    attempt: int
    unit_name: str | None
    started_at: str | None
    finished_at: str | None
    exit_code: int | None
    raw_path: Path | None
    sanitized_path: Path | None
    result_path: Path | None
    input_path: Path | None
    error_summary: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class PipelineRun:
    id: int
    harness_session_id: str
    plan_path: Path | None
    plan_hash: str | None
    base_sha: str | None
    head_sha: str | None
    review_round: int
    pr_number: int | None
    ci_state: str | None
    preview_url: str | None
    accepted_by: str | None
    accepted_head_sha: str | None
    created_at: str
    updated_at: str


def row_value(row: Any, key: str) -> Any:
    """Read a sqlite row without coupling callers to sqlite3.Row internals."""

    return row[key]
