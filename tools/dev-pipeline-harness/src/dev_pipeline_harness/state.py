"""SQLite-backed machine state for the development pipeline harness."""

from __future__ import annotations

import sqlite3
import threading
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Sequence

from .filesystem import ensure_private_dir
from .models import (
    Dispatch,
    DispatchStatus,
    HarnessSession,
    PipelineRun,
    Provider,
    ProviderSession,
    ProviderSessionStatus,
    SessionStatus,
    Turn,
    TurnState,
)


class StateError(RuntimeError):
    """Base class for state-layer failures."""


class NotFoundError(StateError):
    pass


class DuplicateSessionError(StateError):
    pass


class InvalidTransition(StateError):
    pass


class QueueError(StateError):
    pass


SCHEMA_VERSION = 4

_SESSION_TRANSITIONS: dict[SessionStatus, set[SessionStatus]] = {
    SessionStatus.DRAFT: {SessionStatus.QUEUED, SessionStatus.CANCELLED},
    SessionStatus.QUEUED: {
        SessionStatus.RUNNING,
        SessionStatus.WAITING_FOR_OWNER,
        SessionStatus.CANCELLED,
        SessionStatus.INTERRUPTED,
        SessionStatus.FAILED,
    },
    SessionStatus.RUNNING: {
        SessionStatus.WAITING_FOR_OWNER,
        SessionStatus.FAILED,
        SessionStatus.INTERRUPTED,
        SessionStatus.CANCELLED,
    },
    SessionStatus.WAITING_FOR_OWNER: {
        SessionStatus.QUEUED,
        SessionStatus.PLAN_APPROVED,
        SessionStatus.TASK_RUNNING,
        SessionStatus.REVIEW_PENDING,
        SessionStatus.PR_OPEN,
        SessionStatus.CANCELLED,
    },
    SessionStatus.PLAN_APPROVED: {SessionStatus.TASK_RUNNING, SessionStatus.CANCELLED},
    SessionStatus.TASK_RUNNING: {
        SessionStatus.REVIEW_PENDING,
        SessionStatus.FAILED,
        SessionStatus.CANCELLED,
        SessionStatus.NEEDS_OWNER,
    },
    SessionStatus.REVIEW_PENDING: {
        SessionStatus.TASK_RUNNING,
        SessionStatus.PR_OPEN,
        SessionStatus.NEEDS_OWNER,
        SessionStatus.CANCELLED,
    },
    SessionStatus.PR_OPEN: {
        SessionStatus.CI_PASSED,
        SessionStatus.REVIEW_PENDING,
        SessionStatus.NEEDS_OWNER,
        SessionStatus.CANCELLED,
    },
    SessionStatus.CI_PASSED: {
        SessionStatus.PREVIEW_READY,
        SessionStatus.NEEDS_OWNER,
        SessionStatus.CANCELLED,
    },
    SessionStatus.PREVIEW_READY: {
        SessionStatus.ACCEPTED,
        SessionStatus.REVIEW_PENDING,
        SessionStatus.NEEDS_OWNER,
    },
    SessionStatus.ACCEPTED: {SessionStatus.MERGED},
    SessionStatus.MERGED: set(),
    SessionStatus.FAILED: {SessionStatus.QUEUED, SessionStatus.CANCELLED},
    SessionStatus.INTERRUPTED: {SessionStatus.QUEUED, SessionStatus.CANCELLED},
    SessionStatus.CANCELLED: set(),
    SessionStatus.NEEDS_OWNER: {
        SessionStatus.TASK_RUNNING,
        SessionStatus.REVIEW_PENDING,
        SessionStatus.CANCELLED,
    },
}


_TERMINAL_TURN_STATES = tuple(state.value for state in TurnState if state.terminal)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _optional_path(value: str | None) -> Path | None:
    return Path(value) if value else None


class StateStore:
    """Short-transaction SQLite repository.

    One connection is protected by a re-entrant lock.  Transactions use
    ``BEGIN IMMEDIATE`` for operations which allocate IDs or claim work, so
    competing Discord interactions cannot create duplicate sessions or turns.
    """

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path).expanduser()
        ensure_private_dir(self.db_path.parent)
        if self.db_path.exists():
            self.db_path.chmod(0o600)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            self.db_path,
            timeout=30,
            isolation_level=None,
            check_same_thread=False,
        )
        self._connection.row_factory = sqlite3.Row
        self._configure()
        self._migrate()
        self.db_path.chmod(0o600)

    def _configure(self) -> None:
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._connection.execute("PRAGMA busy_timeout=5000")
        self._connection.execute("PRAGMA synchronous=NORMAL")

    def _migrate(self) -> None:
        with self._lock:
            current = int(self._connection.execute("PRAGMA user_version").fetchone()[0])
            if current > SCHEMA_VERSION:
                raise StateError("database schema is newer than this harness")
            self._connection.execute("BEGIN IMMEDIATE")
            try:
                if current < 1:
                    self._create_schema()
                    current = 1
                if current < 2:
                    self._connection.execute(
                        "ALTER TABLE harness_sessions ADD COLUMN status_message_id TEXT"
                    )
                    current = 2
                if current < 3:
                    self._connection.execute(
                        "ALTER TABLE provider_sessions ADD COLUMN default_effort TEXT NOT NULL DEFAULT 'medium'"
                    )
                    self._connection.execute(
                        "ALTER TABLE turns ADD COLUMN requested_effort TEXT NOT NULL DEFAULT 'medium'"
                    )
                    self._connection.execute(
                        "ALTER TABLE turns ADD COLUMN configured_effort TEXT NOT NULL DEFAULT 'medium'"
                    )
                    current = 3
                if current < 4:
                    self._connection.executescript(
                        """
                        CREATE TABLE IF NOT EXISTS dispatches (
                            id TEXT PRIMARY KEY,
                            owner_user_id TEXT NOT NULL,
                            guild_id TEXT NOT NULL,
                            channel_id TEXT NOT NULL,
                            task TEXT NOT NULL,
                            status TEXT NOT NULL,
                            provider TEXT,
                            confirmation_message_id TEXT UNIQUE,
                            harness_session_id TEXT UNIQUE REFERENCES harness_sessions(id),
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_dispatches_status
                            ON dispatches(status, created_at);
                        """
                    )
                    current = 4
                self._connection.execute(f"PRAGMA user_version={current}")
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def _create_schema(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS session_sequence (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                next_value INTEGER NOT NULL CHECK (next_value >= 1)
            );
            INSERT OR IGNORE INTO session_sequence (id, next_value) VALUES (1, 1);

            CREATE TABLE IF NOT EXISTS turn_sequence (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                next_value INTEGER NOT NULL CHECK (next_value >= 1)
            );
            INSERT OR IGNORE INTO turn_sequence (id, next_value) VALUES (1, 1);

            CREATE TABLE IF NOT EXISTS harness_sessions (
                id TEXT PRIMARY KEY,
                source_message_id TEXT NOT NULL UNIQUE,
                discord_thread_id TEXT UNIQUE,
                repo TEXT NOT NULL,
                worktree TEXT NOT NULL UNIQUE,
                branch TEXT NOT NULL,
                status TEXT NOT NULL,
                context_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_harness_sessions_status
                ON harness_sessions(status);

            CREATE TABLE IF NOT EXISTS provider_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                harness_session_id TEXT NOT NULL REFERENCES harness_sessions(id),
                provider TEXT NOT NULL,
                provider_session_id TEXT,
                default_model TEXT NOT NULL,
                status TEXT NOT NULL,
                switched_from_id INTEGER REFERENCES provider_sessions(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(provider, provider_session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_provider_sessions_harness
                ON provider_sessions(harness_session_id, status);

            CREATE TABLE IF NOT EXISTS turns (
            id TEXT PRIMARY KEY,
                provider_session_id INTEGER NOT NULL REFERENCES provider_sessions(id),
                owner_message_id TEXT,
                requested_model TEXT NOT NULL,
                configured_model TEXT NOT NULL,
                reported_model TEXT,
                state TEXT NOT NULL,
                attempt INTEGER NOT NULL CHECK (attempt >= 1),
                unit_name TEXT,
                started_at TEXT,
                finished_at TEXT,
                exit_code INTEGER,
                raw_path TEXT,
                sanitized_path TEXT,
                result_path TEXT,
                input_path TEXT,
                error_summary TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_owner_message
                ON turns(owner_message_id) WHERE owner_message_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_turns_state ON turns(state);

            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                turn_id TEXT NOT NULL UNIQUE REFERENCES turns(id),
                ordinal INTEGER NOT NULL UNIQUE,
                queued_at TEXT NOT NULL,
                claimed_at TEXT,
                cancelled_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_queue_ready
                ON queue(cancelled_at, claimed_at, ordinal);

            CREATE TABLE IF NOT EXISTS event_cursors (
                turn_id TEXT PRIMARY KEY REFERENCES turns(id),
                raw_byte_offset INTEGER NOT NULL DEFAULT 0 CHECK (raw_byte_offset >= 0),
                last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_event_seq >= 0),
                discord_message_id TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                harness_session_id TEXT NOT NULL UNIQUE REFERENCES harness_sessions(id),
                plan_path TEXT,
                plan_hash TEXT,
                base_sha TEXT,
                head_sha TEXT,
                review_round INTEGER NOT NULL DEFAULT 0 CHECK (review_round >= 0),
                pr_number INTEGER,
                ci_state TEXT,
                preview_url TEXT,
                accepted_by TEXT,
                accepted_head_sha TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                harness_session_id TEXT,
                turn_id TEXT,
                input_message_id TEXT,
                unit_name TEXT,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dispatches (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                task TEXT NOT NULL,
                status TEXT NOT NULL,
                provider TEXT,
                confirmation_message_id TEXT UNIQUE,
                harness_session_id TEXT UNIQUE REFERENCES harness_sessions(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_dispatches_status
                ON dispatches(status, created_at);
            """
        )

    @contextmanager
    def _transaction(self, *, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            try:
                yield self._connection
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def __enter__(self) -> "StateStore":
        return self

    def __exit__(self, _type, _value, _traceback) -> None:
        self.close()

    @staticmethod
    def _session_from_row(row: sqlite3.Row) -> HarnessSession:
        return HarnessSession(
            id=row["id"],
            source_message_id=row["source_message_id"],
            discord_thread_id=row["discord_thread_id"],
            repo=Path(row["repo"]),
            worktree=Path(row["worktree"]),
            branch=row["branch"],
            status=SessionStatus(row["status"]),
            context_path=_optional_path(row["context_path"]),
            status_message_id=row["status_message_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _provider_from_row(row: sqlite3.Row) -> ProviderSession:
        return ProviderSession(
            id=int(row["id"]),
            harness_session_id=row["harness_session_id"],
            provider=Provider(row["provider"]),
            provider_session_id=row["provider_session_id"],
            default_model=row["default_model"],
            default_effort=row["default_effort"],
            status=ProviderSessionStatus(row["status"]),
            switched_from_id=row["switched_from_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _turn_from_row(row: sqlite3.Row) -> Turn:
        return Turn(
            id=row["id"],
            provider_session_id=int(row["provider_session_id"]),
            owner_message_id=row["owner_message_id"],
            requested_model=row["requested_model"],
            configured_model=row["configured_model"],
            requested_effort=row["requested_effort"],
            configured_effort=row["configured_effort"],
            reported_model=row["reported_model"],
            state=TurnState(row["state"]),
            attempt=int(row["attempt"]),
            unit_name=row["unit_name"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            exit_code=row["exit_code"],
            raw_path=_optional_path(row["raw_path"]),
            sanitized_path=_optional_path(row["sanitized_path"]),
            result_path=_optional_path(row["result_path"]),
            input_path=_optional_path(row["input_path"]),
            error_summary=row["error_summary"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _dispatch_from_row(row: sqlite3.Row) -> Dispatch:
        provider = row["provider"]
        return Dispatch(
            id=row["id"],
            owner_user_id=row["owner_user_id"],
            guild_id=row["guild_id"],
            channel_id=row["channel_id"],
            task=row["task"],
            status=DispatchStatus(row["status"]),
            provider=Provider(provider) if provider else None,
            confirmation_message_id=row["confirmation_message_id"],
            harness_session_id=row["harness_session_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _pipeline_from_row(row: sqlite3.Row) -> PipelineRun:
        return PipelineRun(
            id=int(row["id"]),
            harness_session_id=row["harness_session_id"],
            plan_path=_optional_path(row["plan_path"]),
            plan_hash=row["plan_hash"],
            base_sha=row["base_sha"],
            head_sha=row["head_sha"],
            review_round=int(row["review_round"]),
            pr_number=row["pr_number"],
            ci_state=row["ci_state"],
            preview_url=row["preview_url"],
            accepted_by=row["accepted_by"],
            accepted_head_sha=row["accepted_head_sha"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _next_sequence(self, conn: sqlite3.Connection, table: str) -> int:
        row = conn.execute(f"SELECT next_value FROM {table} WHERE id = 1").fetchone()
        if row is None:  # pragma: no cover - protected by migration
            raise StateError("state sequence is missing")
        value = int(row[0])
        conn.execute(f"UPDATE {table} SET next_value = ? WHERE id = 1", (value + 1,))
        return value

    def create_session(
        self,
        *,
        source_message_id: str,
        repo: Path,
        worktree: Path,
        branch: str,
        discord_thread_id: str | None = None,
        status: SessionStatus = SessionStatus.DRAFT,
        context_path: Path | None = None,
    ) -> HarnessSession:
        session, created = self.get_or_create_session(
            source_message_id=source_message_id,
            repo=repo,
            worktree=worktree,
            branch=branch,
            discord_thread_id=discord_thread_id,
            status=status,
            context_path=context_path,
        )
        if not created:
            raise DuplicateSessionError("source message already has a harness session")
        return session

    def get_or_create_session(
        self,
        *,
        source_message_id: str,
        repo: Path,
        worktree: Path,
        branch: str,
        discord_thread_id: str | None = None,
        status: SessionStatus = SessionStatus.DRAFT,
        context_path: Path | None = None,
    ) -> tuple[HarnessSession, bool]:
        source_message_id = str(source_message_id).strip()
        if not source_message_id:
            raise StateError("source message id is required")
        repo = Path(repo)
        worktree = Path(worktree)
        if not repo.is_absolute() or not worktree.is_absolute():
            raise StateError("repo and worktree must be absolute paths")
        branch = branch.strip()
        if not branch:
            raise StateError("branch is required")
        with self._transaction(immediate=True) as conn:
            existing = conn.execute(
                "SELECT * FROM harness_sessions WHERE source_message_id = ?",
                (source_message_id,),
            ).fetchone()
            if existing is not None:
                return self._session_from_row(existing), False
            session_number = self._next_sequence(conn, "session_sequence")
            session_id = f"S-{session_number:04d}"
            now = _utc_now()
            try:
                conn.execute(
                    """
                    INSERT INTO harness_sessions
                    (id, source_message_id, discord_thread_id, repo, worktree, branch,
                     status, context_path, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        source_message_id,
                        str(discord_thread_id) if discord_thread_id else None,
                        str(repo),
                        str(worktree),
                        branch,
                        status.value,
                        str(context_path) if context_path else None,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise DuplicateSessionError("session identity conflicts with existing state") from exc
            row = conn.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
            assert row is not None
            return self._session_from_row(row), True

    def get_or_create_pipeline_session(
        self,
        *,
        source_message_id: str,
        repo: Path,
        worktree_root: Path,
        discord_thread_id: str | None = None,
    ) -> tuple[HarnessSession, bool]:
        """Allocate S-#### and its canonical worktree path in one transaction."""

        source_message_id = str(source_message_id).strip()
        repo = Path(repo)
        worktree_root = Path(worktree_root)
        if not source_message_id:
            raise StateError("source message id is required")
        if not repo.is_absolute() or not worktree_root.is_absolute():
            raise StateError("repo and worktree root must be absolute paths")
        with self._transaction(immediate=True) as conn:
            existing = conn.execute(
                "SELECT * FROM harness_sessions WHERE source_message_id = ?",
                (source_message_id,),
            ).fetchone()
            if existing is not None:
                return self._session_from_row(existing), False
            session_number = self._next_sequence(conn, "session_sequence")
            session_id = f"S-{session_number:04d}"
            now = _utc_now()
            try:
                conn.execute(
                    """
                    INSERT INTO harness_sessions
                    (id, source_message_id, discord_thread_id, repo, worktree, branch,
                     status, context_path, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                    """,
                    (
                        session_id,
                        source_message_id,
                        str(discord_thread_id) if discord_thread_id else None,
                        str(repo),
                        str(worktree_root / session_id),
                        f"pipeline/{session_id}",
                        SessionStatus.DRAFT.value,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise DuplicateSessionError("pipeline session identity conflicts with existing state") from exc
            row = conn.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
            assert row is not None
            return self._session_from_row(row), True

    def get_session(self, session_id: str) -> HarnessSession:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        if row is None:
            raise NotFoundError("harness session not found")
        return self._session_from_row(row)

    def list_sessions(self) -> list[HarnessSession]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM harness_sessions ORDER BY id"
            ).fetchall()
        return [self._session_from_row(row) for row in rows]

    def find_session_by_source(self, source_message_id: str) -> HarnessSession | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM harness_sessions WHERE source_message_id = ?",
                (str(source_message_id),),
            ).fetchone()
        return self._session_from_row(row) if row else None

    def find_session_by_thread(self, discord_thread_id: str) -> HarnessSession | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM harness_sessions WHERE discord_thread_id = ?",
                (str(discord_thread_id),),
            ).fetchone()
        return self._session_from_row(row) if row else None

    def create_dispatch(
        self,
        *,
        owner_user_id: str,
        guild_id: str,
        channel_id: str,
        task: str,
    ) -> Dispatch:
        """Persist a proposed dispatch before any worktree or provider starts."""

        task = str(task).strip()
        identifiers = {
            "owner user id": str(owner_user_id).strip(),
            "guild id": str(guild_id).strip(),
            "channel id": str(channel_id).strip(),
        }
        if not task:
            raise StateError("dispatch task is required")
        if len(task) > 2000:
            raise StateError("dispatch task exceeds the 2000-character command limit")
        if any(not value for value in identifiers.values()):
            raise StateError("dispatch owner, guild, and channel ids are required")
        with self._transaction(immediate=True) as conn:
            for _ in range(4):
                dispatch_id = f"D-{secrets.token_hex(8)}"
                now = _utc_now()
                try:
                    conn.execute(
                        """
                        INSERT INTO dispatches
                        (id, owner_user_id, guild_id, channel_id, task, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            dispatch_id,
                            identifiers["owner user id"],
                            identifiers["guild id"],
                            identifiers["channel id"],
                            task,
                            DispatchStatus.PENDING.value,
                            now,
                            now,
                        ),
                    )
                    row = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
                    assert row is not None
                    return self._dispatch_from_row(row)
                except sqlite3.IntegrityError:
                    continue
        raise StateError("could not allocate a unique dispatch id")

    def get_dispatch(self, dispatch_id: str) -> Dispatch:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM dispatches WHERE id = ?", (str(dispatch_id),)
            ).fetchone()
        if row is None:
            raise NotFoundError("dispatch not found")
        return self._dispatch_from_row(row)

    def list_open_dispatches(self) -> list[Dispatch]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT * FROM dispatches
                WHERE status IN (?, ?) AND confirmation_message_id IS NOT NULL
                ORDER BY created_at
                """,
                (DispatchStatus.PENDING.value, DispatchStatus.CLAIMED.value),
            ).fetchall()
        return [self._dispatch_from_row(row) for row in rows]

    def set_dispatch_confirmation_message(self, dispatch_id: str, message_id: str) -> Dispatch:
        message_id = str(message_id).strip()
        if not message_id:
            raise StateError("dispatch confirmation message id is required")
        with self._transaction(immediate=True) as conn:
            row = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
            if row is None:
                raise NotFoundError("dispatch not found")
            try:
                conn.execute(
                    """
                    UPDATE dispatches
                    SET confirmation_message_id = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (message_id, _utc_now(), dispatch_id),
                )
            except sqlite3.IntegrityError as exc:
                raise StateError("confirmation message already belongs to a dispatch") from exc
            result = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
        assert result is not None
        return self._dispatch_from_row(result)

    def update_dispatch_task(self, dispatch_id: str, task: str) -> Dispatch:
        task = str(task).strip()
        if not task:
            raise StateError("dispatch task is required")
        if len(task) > 2000:
            raise StateError("dispatch task exceeds the 2000-character command limit")
        with self._transaction(immediate=True) as conn:
            row = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
            if row is None:
                raise NotFoundError("dispatch not found")
            if DispatchStatus(row["status"]) is not DispatchStatus.PENDING:
                raise StateError("a dispatched task can no longer be edited")
            conn.execute(
                "UPDATE dispatches SET task = ?, updated_at = ? WHERE id = ?",
                (task, _utc_now(), dispatch_id),
            )
            result = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
        assert result is not None
        return self._dispatch_from_row(result)

    def claim_dispatch(self, dispatch_id: str, provider: Provider) -> tuple[Dispatch, bool]:
        """Reserve a pending dispatch so only the first provider choice starts it."""

        with self._transaction(immediate=True) as conn:
            row = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
            if row is None:
                raise NotFoundError("dispatch not found")
            status = DispatchStatus(row["status"])
            if status is not DispatchStatus.PENDING:
                return self._dispatch_from_row(row), False
            conn.execute(
                """
                UPDATE dispatches
                SET status = ?, provider = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (
                    DispatchStatus.CLAIMED.value,
                    provider.value,
                    _utc_now(),
                    dispatch_id,
                    DispatchStatus.PENDING.value,
                ),
            )
            result = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
        assert result is not None
        return self._dispatch_from_row(result), True

    def complete_dispatch(self, dispatch_id: str, harness_session_id: str) -> Dispatch:
        with self._transaction(immediate=True) as conn:
            row = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
            if row is None:
                raise NotFoundError("dispatch not found")
            status = DispatchStatus(row["status"])
            if status is DispatchStatus.STARTED:
                if row["harness_session_id"] != harness_session_id:
                    raise StateError("dispatch already belongs to another harness session")
                return self._dispatch_from_row(row)
            if status is not DispatchStatus.CLAIMED:
                raise StateError("dispatch must be claimed before it can start")
            self._require_session(conn, harness_session_id)
            conn.execute(
                """
                UPDATE dispatches
                SET status = ?, harness_session_id = ?, updated_at = ?
                WHERE id = ?
                """,
                (DispatchStatus.STARTED.value, harness_session_id, _utc_now(), dispatch_id),
            )
            result = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
        assert result is not None
        return self._dispatch_from_row(result)

    def release_dispatch(self, dispatch_id: str, provider: Provider) -> Dispatch:
        """Return a failed in-process start to the confirmation card for retry."""

        with self._transaction(immediate=True) as conn:
            row = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
            if row is None:
                raise NotFoundError("dispatch not found")
            if (
                DispatchStatus(row["status"]) is DispatchStatus.CLAIMED
                and row["provider"] == provider.value
                and row["harness_session_id"] is None
            ):
                conn.execute(
                    """
                    UPDATE dispatches
                    SET status = ?, provider = NULL, updated_at = ?
                    WHERE id = ?
                    """,
                    (DispatchStatus.PENDING.value, _utc_now(), dispatch_id),
                )
            result = conn.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
        assert result is not None
        return self._dispatch_from_row(result)

    def reconcile_dispatch_claims(self) -> None:
        """Recover a process crash between claiming a card and recording its session."""

        with self._transaction(immediate=True) as conn:
            rows = conn.execute(
                "SELECT * FROM dispatches WHERE status = ?", (DispatchStatus.CLAIMED.value,)
            ).fetchall()
            for row in rows:
                session = conn.execute(
                    "SELECT id FROM harness_sessions WHERE source_message_id = ?",
                    (f"dispatch:{row['id']}",),
                ).fetchone()
                if session is None:
                    conn.execute(
                        """
                        UPDATE dispatches
                        SET status = ?, provider = NULL, updated_at = ?
                        WHERE id = ?
                        """,
                        (DispatchStatus.PENDING.value, _utc_now(), row["id"]),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE dispatches
                        SET status = ?, harness_session_id = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (DispatchStatus.STARTED.value, session["id"], _utc_now(), row["id"]),
                    )

    def set_discord_thread(self, session_id: str, discord_thread_id: str) -> HarnessSession:
        with self._transaction(immediate=True) as conn:
            self._require_session(conn, session_id)
            try:
                conn.execute(
                    "UPDATE harness_sessions SET discord_thread_id = ?, updated_at = ? WHERE id = ?",
                    (str(discord_thread_id), _utc_now(), session_id),
                )
            except sqlite3.IntegrityError as exc:
                raise DuplicateSessionError("Discord thread already belongs to a session") from exc
            row = conn.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        assert row is not None
        return self._session_from_row(row)

    def set_context_path(self, session_id: str, context_path: Path) -> HarnessSession:
        if not Path(context_path).is_absolute():
            raise StateError("context path must be absolute")
        with self._transaction(immediate=True) as conn:
            self._require_session(conn, session_id)
            conn.execute(
                "UPDATE harness_sessions SET context_path = ?, updated_at = ? WHERE id = ?",
                (str(context_path), _utc_now(), session_id),
            )
            row = conn.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        assert row is not None
        return self._session_from_row(row)

    def set_status_message_id(self, session_id: str, message_id: str) -> HarnessSession:
        message_id = str(message_id).strip()
        if not message_id:
            raise StateError("status message id is required")
        with self._transaction(immediate=True) as conn:
            self._require_session(conn, session_id)
            conn.execute(
                "UPDATE harness_sessions SET status_message_id = ?, updated_at = ? WHERE id = ?",
                (message_id, _utc_now(), session_id),
            )
            row = conn.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        assert row is not None
        return self._session_from_row(row)

    def transition_session(
        self,
        session_id: str,
        new_status: SessionStatus,
        *,
        expected: SessionStatus | None = None,
    ) -> HarnessSession:
        with self._transaction(immediate=True) as conn:
            row = self._require_session(conn, session_id)
            current = SessionStatus(row["status"])
            if expected is not None and current is not expected:
                raise InvalidTransition(
                    f"session {session_id} is {current.value}; expected {expected.value}"
                )
            if new_status is not current and new_status not in _SESSION_TRANSITIONS[current]:
                raise InvalidTransition(
                    f"invalid session transition {current.value} -> {new_status.value}"
                )
            conn.execute(
                "UPDATE harness_sessions SET status = ?, updated_at = ? WHERE id = ?",
                (new_status.value, _utc_now(), session_id),
            )
            result = conn.execute(
                "SELECT * FROM harness_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        assert result is not None
        return self._session_from_row(result)

    def create_provider_session(
        self,
        *,
        harness_session_id: str,
        provider: Provider,
        default_model: str,
        default_effort: str = "medium",
        provider_session_id: str | None = None,
        switched_from_id: int | None = None,
    ) -> ProviderSession:
        if not default_model.strip():
            raise StateError("default model is required")
        if not default_effort.strip():
            raise StateError("default reasoning effort is required")
        with self._transaction(immediate=True) as conn:
            self._require_session(conn, harness_session_id)
            if switched_from_id is not None:
                previous = conn.execute(
                    "SELECT * FROM provider_sessions WHERE id = ? AND harness_session_id = ?",
                    (switched_from_id, harness_session_id),
                ).fetchone()
                if previous is None:
                    raise StateError("provider switch source is not in this harness session")
                conn.execute(
                    "UPDATE provider_sessions SET status = ?, updated_at = ? WHERE id = ?",
                    (ProviderSessionStatus.SWITCHED.value, _utc_now(), switched_from_id),
                )
            now = _utc_now()
            try:
                cursor = conn.execute(
                    """
                    INSERT INTO provider_sessions
                    (harness_session_id, provider, provider_session_id, default_model,
                     default_effort, status, switched_from_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        harness_session_id,
                        provider.value,
                        provider_session_id,
                        default_model,
                        default_effort,
                        ProviderSessionStatus.ACTIVE.value,
                        switched_from_id,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise StateError("provider session identity conflicts with existing state") from exc
            row = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        assert row is not None
        return self._provider_from_row(row)

    def get_provider_session(self, provider_session_id: int) -> ProviderSession:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_id,)
            ).fetchone()
        if row is None:
            raise NotFoundError("provider session not found")
        return self._provider_from_row(row)

    def list_provider_sessions(self, harness_session_id: str) -> list[ProviderSession]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM provider_sessions WHERE harness_session_id = ? ORDER BY id",
                (harness_session_id,),
            ).fetchall()
        return [self._provider_from_row(row) for row in rows]

    def set_provider_session_id(self, provider_session_row_id: int, provider_session_id: str) -> ProviderSession:
        provider_session_id = provider_session_id.strip()
        if not provider_session_id:
            raise StateError("provider session id is required")
        with self._transaction(immediate=True) as conn:
            row = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_row_id,)
            ).fetchone()
            if row is None:
                raise NotFoundError("provider session not found")
            existing = row["provider_session_id"]
            if existing and existing != provider_session_id:
                raise StateError("provider session id cannot be changed")
            try:
                conn.execute(
                    "UPDATE provider_sessions SET provider_session_id = ?, updated_at = ? WHERE id = ?",
                    (provider_session_id, _utc_now(), provider_session_row_id),
                )
            except sqlite3.IntegrityError as exc:
                raise StateError("provider session id is already registered") from exc
            result = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_row_id,)
            ).fetchone()
        assert result is not None
        return self._provider_from_row(result)

    def set_default_model(self, provider_session_row_id: int, model: str) -> ProviderSession:
        model = model.strip()
        if not model:
            raise StateError("model is required")
        with self._transaction(immediate=True) as conn:
            row = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_row_id,)
            ).fetchone()
            if row is None:
                raise NotFoundError("provider session not found")
            running = conn.execute(
                """
                SELECT 1 FROM turns
                WHERE provider_session_id = ? AND state IN ('launching', 'running')
                LIMIT 1
                """,
                (provider_session_row_id,),
            ).fetchone()
            if running is not None:
                raise QueueError("cannot change model while provider session is running")
            conn.execute(
                "UPDATE provider_sessions SET default_model = ?, updated_at = ? WHERE id = ?",
                (model, _utc_now(), provider_session_row_id),
            )
            result = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_row_id,)
            ).fetchone()
        assert result is not None
        return self._provider_from_row(result)

    def set_default_effort(self, provider_session_row_id: int, effort: str) -> ProviderSession:
        effort = effort.strip().lower()
        if not effort:
            raise StateError("reasoning effort is required")
        with self._transaction(immediate=True) as conn:
            row = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_row_id,)
            ).fetchone()
            if row is None:
                raise NotFoundError("provider session not found")
            running = conn.execute(
                """
                SELECT 1 FROM turns
                WHERE provider_session_id = ? AND state IN ('launching', 'running')
                LIMIT 1
                """,
                (provider_session_row_id,),
            ).fetchone()
            if running is not None:
                raise QueueError("cannot change reasoning effort while provider session is running")
            conn.execute(
                "UPDATE provider_sessions SET default_effort = ?, updated_at = ? WHERE id = ?",
                (effort, _utc_now(), provider_session_row_id),
            )
            result = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_row_id,)
            ).fetchone()
        assert result is not None
        return self._provider_from_row(result)

    def create_turn(
        self,
        *,
        provider_session_id: int,
        owner_message_id: str | None,
        requested_model: str,
        configured_model: str,
        requested_effort: str = "medium",
        configured_effort: str = "medium",
        input_path: Path | None = None,
        attempt: int = 1,
    ) -> Turn:
        requested_model = requested_model.strip()
        configured_model = configured_model.strip()
        requested_effort = requested_effort.strip().lower()
        configured_effort = configured_effort.strip().lower()
        if not requested_model or not configured_model:
            raise StateError("requested and configured model are required")
        if not requested_effort or not configured_effort:
            raise StateError("requested and configured reasoning effort are required")
        if attempt < 1:
            raise StateError("turn attempt must be positive")
        with self._transaction(immediate=True) as conn:
            provider_row = conn.execute(
                "SELECT * FROM provider_sessions WHERE id = ?", (provider_session_id,)
            ).fetchone()
            if provider_row is None:
                raise NotFoundError("provider session not found")
            turn_number = self._next_sequence(conn, "turn_sequence")
            turn_id = f"T-{turn_number:04d}"
            now = _utc_now()
            try:
                conn.execute(
                    """
                    INSERT INTO turns
                    (id, provider_session_id, owner_message_id, requested_model,
                     configured_model, requested_effort, configured_effort,
                     reported_model, state, attempt, input_path, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
                    """,
                    (
                        turn_id,
                        provider_session_id,
                        str(owner_message_id) if owner_message_id else None,
                        requested_model,
                        configured_model,
                        requested_effort,
                        configured_effort,
                        TurnState.QUEUED.value,
                        attempt,
                        str(input_path) if input_path else None,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise QueueError("owner message already has a turn") from exc
            row = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        assert row is not None
        return self._turn_from_row(row)

    def get_turn(self, turn_id: str) -> Turn:
        with self._lock:
            row = self._connection.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        if row is None:
            raise NotFoundError("turn not found")
        return self._turn_from_row(row)

    def list_active_turns(self) -> list[Turn]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM turns WHERE state IN ('launching', 'running') ORDER BY id"
            ).fetchall()
        return [self._turn_from_row(row) for row in rows]

    def list_turns(self, harness_session_id: str) -> list[Turn]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT t.* FROM turns t
                JOIN provider_sessions p ON p.id = t.provider_session_id
                WHERE p.harness_session_id = ? ORDER BY t.id
                """,
                (harness_session_id,),
            ).fetchall()
        return [self._turn_from_row(row) for row in rows]

    def enqueue_turn(self, turn_id: str) -> int:
        with self._transaction(immediate=True) as conn:
            turn = self._require_turn(conn, turn_id)
            state = TurnState(turn["state"])
            if state is not TurnState.QUEUED:
                raise QueueError("only a queued turn can be enqueued")
            existing = conn.execute(
                "SELECT 1 FROM queue WHERE turn_id = ? AND cancelled_at IS NULL", (turn_id,)
            ).fetchone()
            if existing is not None:
                raise QueueError("turn is already queued")
            row = conn.execute("SELECT COALESCE(MAX(ordinal), 0) + 1 FROM queue").fetchone()
            ordinal = int(row[0])
            now = _utc_now()
            conn.execute(
                "INSERT INTO queue(turn_id, ordinal, queued_at) VALUES (?, ?, ?)",
                (turn_id, ordinal, now),
            )
            session_id = conn.execute(
                """
                SELECT p.harness_session_id FROM provider_sessions p
                JOIN turns t ON t.provider_session_id = p.id WHERE t.id = ?
                """,
                (turn_id,),
            ).fetchone()[0]
            session = self._require_session(conn, session_id)
            if SessionStatus(session["status"]) in {
                SessionStatus.DRAFT,
                SessionStatus.WAITING_FOR_OWNER,
                SessionStatus.FAILED,
                SessionStatus.INTERRUPTED,
            }:
                conn.execute(
                    "UPDATE harness_sessions SET status = ?, updated_at = ? WHERE id = ?",
                    (SessionStatus.QUEUED.value, now, session_id),
                )
            return ordinal

    def queue_position(self, turn_id: str) -> int | None:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT q.ordinal, q.claimed_at, q.cancelled_at, t.state
                FROM queue q JOIN turns t ON t.id = q.turn_id
                WHERE q.turn_id = ?
                """,
                (turn_id,),
            ).fetchone()
            if row is None or row["cancelled_at"] is not None or TurnState(row["state"]).terminal:
                return None
            if row["claimed_at"] is not None:
                return 0
            count = self._connection.execute(
                """
                SELECT COUNT(*) FROM queue
                WHERE cancelled_at IS NULL AND claimed_at IS NULL AND ordinal <= ?
                """,
                (row["ordinal"],),
            ).fetchone()[0]
        return int(count)

    def list_queue(self) -> list[tuple[int, Turn]]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT q.ordinal, t.* FROM queue q
                JOIN turns t ON t.id = q.turn_id
                WHERE q.cancelled_at IS NULL ORDER BY q.ordinal
                """
            ).fetchall()
        return [(int(row["ordinal"]), self._turn_from_row(row)) for row in rows]

    def claim_next(self, *, unit_name: str | None = None) -> Turn | None:
        with self._transaction(immediate=True) as conn:
            active = conn.execute(
                "SELECT 1 FROM turns WHERE state IN ('launching', 'running') LIMIT 1"
            ).fetchone()
            if active is not None:
                return None
            row = conn.execute(
                """
                SELECT t.* FROM queue q JOIN turns t ON t.id = q.turn_id
                WHERE q.cancelled_at IS NULL AND q.claimed_at IS NULL
                  AND t.state = 'queued'
                ORDER BY q.ordinal LIMIT 1
                """
            ).fetchone()
            if row is None:
                return None
            session_id = conn.execute(
                """
                SELECT p.harness_session_id FROM provider_sessions p
                JOIN turns t ON t.provider_session_id = p.id WHERE t.id = ?
                """,
                (row["id"],),
            ).fetchone()[0]
            resolved_unit = unit_name or self._default_unit_name(row, session_id)
            now = _utc_now()
            updated = conn.execute(
                """
                UPDATE queue SET claimed_at = ?
                WHERE turn_id = ? AND claimed_at IS NULL AND cancelled_at IS NULL
                """,
                (now, row["id"]),
            ).rowcount
            if updated != 1:
                return None
            conn.execute(
                "UPDATE turns SET state = ?, unit_name = ?, updated_at = ? WHERE id = ?",
                (TurnState.LAUNCHING.value, resolved_unit, now, row["id"]),
            )
            conn.execute(
                "UPDATE harness_sessions SET status = ?, updated_at = ? WHERE id = ?",
                (SessionStatus.RUNNING.value, now, session_id),
            )
            result = conn.execute("SELECT * FROM turns WHERE id = ?", (row["id"],)).fetchone()
        assert result is not None
        return self._turn_from_row(result)

    @staticmethod
    def _default_unit_name(row: sqlite3.Row, session_id: str) -> str:
        return f"dev-pipeline-turn-{session_id}-{row['id']}"

    def mark_turn_running(self, turn_id: str) -> Turn:
        with self._transaction(immediate=True) as conn:
            row = self._require_turn(conn, turn_id)
            if TurnState(row["state"]) is not TurnState.LAUNCHING:
                raise InvalidTransition("turn is not launching")
            now = _utc_now()
            conn.execute(
                "UPDATE turns SET state = ?, started_at = ?, updated_at = ? WHERE id = ?",
                (TurnState.RUNNING.value, now, now, turn_id),
            )
            result = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        assert result is not None
        return self._turn_from_row(result)

    def finalize_turn(
        self,
        turn_id: str,
        *,
        state: TurnState,
        exit_code: int | None,
        raw_path: Path | None = None,
        sanitized_path: Path | None = None,
        result_path: Path | None = None,
        error_summary: str | None = None,
    ) -> Turn:
        if not state.terminal:
            raise StateError("finalize_turn requires a terminal turn state")
        with self._transaction(immediate=True) as conn:
            row = self._require_turn(conn, turn_id)
            current = TurnState(row["state"])
            if current.terminal:
                result = row
            elif current not in {TurnState.LAUNCHING, TurnState.RUNNING}:
                raise InvalidTransition("turn is not running")
            else:
                now = _utc_now()
                conn.execute(
                    """
                    UPDATE turns SET state = ?, finished_at = ?, exit_code = ?,
                        raw_path = ?, sanitized_path = ?, result_path = ?,
                        error_summary = ?, updated_at = ? WHERE id = ?
                    """,
                    (
                        state.value,
                        now,
                        exit_code,
                        str(raw_path) if raw_path else None,
                        str(sanitized_path) if sanitized_path else None,
                        str(result_path) if result_path else None,
                        error_summary,
                        now,
                        turn_id,
                    ),
                )
                session_id = conn.execute(
                    """
                    SELECT p.harness_session_id FROM provider_sessions p
                    JOIN turns t ON t.provider_session_id = p.id WHERE t.id = ?
                    """,
                    (turn_id,),
                ).fetchone()[0]
                next_session_status = {
                    TurnState.SUCCEEDED: SessionStatus.WAITING_FOR_OWNER,
                    TurnState.FAILED: SessionStatus.FAILED,
                    TurnState.INTERRUPTED: SessionStatus.INTERRUPTED,
                    TurnState.CANCELLED: SessionStatus.CANCELLED,
                }[state]
                conn.execute(
                    "UPDATE harness_sessions SET status = ?, updated_at = ? WHERE id = ?",
                    (next_session_status.value, now, session_id),
                )
                result = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        assert result is not None
        return self._turn_from_row(result)

    def cancel_turn(self, turn_id: str) -> Turn:
        with self._transaction(immediate=True) as conn:
            row = self._require_turn(conn, turn_id)
            state = TurnState(row["state"])
            if state is not TurnState.QUEUED:
                raise QueueError("only an unclaimed queued turn can be cancelled")
            queue_row = conn.execute(
                "SELECT claimed_at, cancelled_at FROM queue WHERE turn_id = ?", (turn_id,)
            ).fetchone()
            if queue_row is None or queue_row["claimed_at"] is not None:
                raise QueueError("turn is already claimed")
            now = _utc_now()
            conn.execute("UPDATE queue SET cancelled_at = ? WHERE turn_id = ?", (now, turn_id))
            conn.execute(
                "UPDATE turns SET state = ?, finished_at = ?, updated_at = ? WHERE id = ?",
                (TurnState.CANCELLED.value, now, now, turn_id),
            )
            result = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        assert result is not None
        return self._turn_from_row(result)

    def set_turn_reported_model(self, turn_id: str, model: str) -> Turn:
        model = model.strip()
        if not model:
            raise StateError("reported model is required")
        with self._transaction(immediate=True) as conn:
            self._require_turn(conn, turn_id)
            conn.execute(
                "UPDATE turns SET reported_model = ?, updated_at = ? WHERE id = ?",
                (model, _utc_now(), turn_id),
            )
            row = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        assert row is not None
        return self._turn_from_row(row)

    def update_turn_paths(
        self,
        turn_id: str,
        *,
        raw_path: Path | None = None,
        sanitized_path: Path | None = None,
        result_path: Path | None = None,
        input_path: Path | None = None,
    ) -> Turn:
        paths = [raw_path, sanitized_path, result_path, input_path]
        if any(path is not None and not Path(path).is_absolute() for path in paths):
            raise StateError("turn paths must be absolute")
        with self._transaction(immediate=True) as conn:
            self._require_turn(conn, turn_id)
            conn.execute(
                """
                UPDATE turns SET raw_path = COALESCE(?, raw_path),
                    sanitized_path = COALESCE(?, sanitized_path),
                    result_path = COALESCE(?, result_path),
                    input_path = COALESCE(?, input_path), updated_at = ? WHERE id = ?
                """,
                (
                    str(raw_path) if raw_path else None,
                    str(sanitized_path) if sanitized_path else None,
                    str(result_path) if result_path else None,
                    str(input_path) if input_path else None,
                    _utc_now(),
                    turn_id,
                ),
            )
            row = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        assert row is not None
        return self._turn_from_row(row)

    def ensure_event_cursor(self, turn_id: str) -> tuple[int, int, str | None]:
        with self._transaction(immediate=True) as conn:
            self._require_turn(conn, turn_id)
            row = conn.execute(
                "SELECT raw_byte_offset, last_event_seq, discord_message_id FROM event_cursors WHERE turn_id = ?",
                (turn_id,),
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO event_cursors(turn_id, updated_at) VALUES (?, ?)",
                    (turn_id, _utc_now()),
                )
                return 0, 0, None
            return int(row[0]), int(row[1]), row[2]

    def update_event_cursor(
        self,
        turn_id: str,
        *,
        raw_byte_offset: int,
        last_event_seq: int,
        discord_message_id: str | None = None,
    ) -> None:
        if raw_byte_offset < 0 or last_event_seq < 0:
            raise StateError("event cursor offsets cannot be negative")
        with self._transaction(immediate=True) as conn:
            self._require_turn(conn, turn_id)
            conn.execute(
                """
                INSERT INTO event_cursors(turn_id, raw_byte_offset, last_event_seq,
                    discord_message_id, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(turn_id) DO UPDATE SET
                    raw_byte_offset = excluded.raw_byte_offset,
                    last_event_seq = excluded.last_event_seq,
                    discord_message_id = excluded.discord_message_id,
                    updated_at = excluded.updated_at
                """,
                (turn_id, raw_byte_offset, last_event_seq, discord_message_id, _utc_now()),
            )

    def create_pipeline_run(self, harness_session_id: str, **values) -> PipelineRun:
        allowed = {
            "plan_path",
            "plan_hash",
            "base_sha",
            "head_sha",
            "review_round",
            "pr_number",
            "ci_state",
            "preview_url",
            "accepted_by",
            "accepted_head_sha",
        }
        unknown = set(values) - allowed
        if unknown:
            raise StateError("unknown pipeline fields")
        with self._transaction(immediate=True) as conn:
            self._require_session(conn, harness_session_id)
            existing = conn.execute(
                "SELECT * FROM pipeline_runs WHERE harness_session_id = ?", (harness_session_id,)
            ).fetchone()
            if existing is not None:
                raise StateError("pipeline run already exists")
            now = _utc_now()
            normalized = {
                key: (str(value) if isinstance(value, Path) else value)
                for key, value in values.items()
            }
            cursor = conn.execute(
                """
                INSERT INTO pipeline_runs
                (harness_session_id, plan_path, plan_hash, base_sha, head_sha,
                 review_round, pr_number, ci_state, preview_url, accepted_by,
                 accepted_head_sha, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    harness_session_id,
                    normalized.get("plan_path"),
                    normalized.get("plan_hash"),
                    normalized.get("base_sha"),
                    normalized.get("head_sha"),
                    normalized.get("review_round", 0),
                    normalized.get("pr_number"),
                    normalized.get("ci_state"),
                    normalized.get("preview_url"),
                    normalized.get("accepted_by"),
                    normalized.get("accepted_head_sha"),
                    now,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM pipeline_runs WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        assert row is not None
        return self._pipeline_from_row(row)

    def get_pipeline_run(self, harness_session_id: str) -> PipelineRun:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM pipeline_runs WHERE harness_session_id = ?", (harness_session_id,)
            ).fetchone()
        if row is None:
            raise NotFoundError("pipeline run not found")
        return self._pipeline_from_row(row)

    def update_pipeline_run(self, harness_session_id: str, **values) -> PipelineRun:
        allowed = {
            "plan_path",
            "plan_hash",
            "base_sha",
            "head_sha",
            "review_round",
            "pr_number",
            "ci_state",
            "preview_url",
            "accepted_by",
            "accepted_head_sha",
        }
        if set(values) - allowed:
            raise StateError("unknown pipeline fields")
        if not values:
            return self.get_pipeline_run(harness_session_id)
        with self._transaction(immediate=True) as conn:
            self._require_session(conn, harness_session_id)
            if conn.execute(
                "SELECT 1 FROM pipeline_runs WHERE harness_session_id = ?", (harness_session_id,)
            ).fetchone() is None:
                raise NotFoundError("pipeline run not found")
            normalized = {
                key: str(value) if isinstance(value, Path) else value for key, value in values.items()
            }
            assignments = ", ".join(f"{key} = ?" for key in normalized)
            params = list(normalized.values()) + [_utc_now(), harness_session_id]
            conn.execute(
                f"UPDATE pipeline_runs SET {assignments}, updated_at = ? WHERE harness_session_id = ?",
                params,
            )
            row = conn.execute(
                "SELECT * FROM pipeline_runs WHERE harness_session_id = ?", (harness_session_id,)
            ).fetchone()
        assert row is not None
        return self._pipeline_from_row(row)

    def record_audit(
        self,
        *,
        actor: str,
        action: str,
        harness_session_id: str | None = None,
        turn_id: str | None = None,
        input_message_id: str | None = None,
        unit_name: str | None = None,
        details_json: str = "{}",
    ) -> int:
        if not actor or not action:
            raise StateError("audit actor and action are required")
        with self._transaction(immediate=True) as conn:
            cursor = conn.execute(
                """
                INSERT INTO audit_events
                (actor, action, harness_session_id, turn_id, input_message_id,
                 unit_name, details_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    actor,
                    action,
                    harness_session_id,
                    turn_id,
                    input_message_id,
                    unit_name,
                    details_json,
                    _utc_now(),
                ),
            )
            return int(cursor.lastrowid)

    @staticmethod
    def _require_session(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM harness_sessions WHERE id = ?", (session_id,)).fetchone()
        if row is None:
            raise NotFoundError("harness session not found")
        return row

    @staticmethod
    def _require_turn(conn: sqlite3.Connection, turn_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM turns WHERE id = ?", (turn_id,)).fetchone()
        if row is None:
            raise NotFoundError("turn not found")
        return row
