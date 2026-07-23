"""Bounded status-card formatting for Discord."""

from __future__ import annotations

from dataclasses import dataclass

from .models import HarnessSession, ProviderSession, Turn
from .redaction import Redactor


@dataclass(frozen=True)
class StatusCard:
    title: str
    description: str
    fields: tuple[tuple[str, str], ...]


def build_status_card(
    *,
    session: HarnessSession,
    provider: ProviderSession | None,
    turn: Turn | None,
    queue_position: int | None,
    error_summary: str | None = None,
    redactor: Redactor | None = None,
) -> StatusCard:
    redactor = redactor or Redactor()
    provider_name = provider.provider.value if provider else "not-started"
    configuration = "locked" if provider and provider.configuration_locked else "awaiting selection"
    requested = turn.requested_model if turn else "-"
    configured = turn.configured_model if turn else (provider.default_model if provider else "-")
    requested_effort = turn.requested_effort if turn else "-"
    configured_effort = turn.configured_effort if turn else (provider.default_effort if provider else "-")
    reported = (turn.reported_model if turn and turn.reported_model else "not reported") if turn else "not reported"
    turn_id = turn.id if turn else "-"
    state = turn.state.value if turn else session.status.value
    queue = "running" if queue_position == 0 else (str(queue_position) if queue_position is not None else "-")
    safe_error = redactor.redact(error_summary or "")[:500] or "-"
    next_step = {
        "draft": "强模型 turn 已入队，等待 runner。",
        "queued": "等待唯一 runner slot。",
        "launching": "transient unit 正在启动。",
        "running": "等待 provider 完成；可用 !stop。",
        "waiting_for_owner": "等待 owner 的 PLAN/TASK/验收动作。",
        "failed": "检查安全错误摘要后使用 !resume 或修正配置。",
        "interrupted": "确认 worktree 后使用 !resume。",
    }.get(state, "按状态卡和 owner 门禁继续。")
    if provider and not provider.configuration_locked and turn is None:
        next_step = "请使用此置顶卡选择并固定配置；固定前不会创建或运行模型 turn。"
    return StatusCard(
        title=f"{session.id} · {provider_name}",
        description=redactor.redact(next_step)[:1000],
        fields=(
            ("provider", provider_name),
            ("configuration", configuration),
            ("requested model", redactor.redact(requested)),
            ("configured model", redactor.redact(configured)),
            ("requested effort", redactor.redact(requested_effort)),
            ("configured effort", redactor.redact(configured_effort)),
            ("reported model", redactor.redact(reported)),
            ("branch", redactor.redact(session.branch)),
            ("queue position", queue),
            ("turn", turn_id),
            ("status", state),
            ("last safe error", safe_error),
        ),
    )


def status_card_text(card: StatusCard) -> str:
    rows = [f"## {card.title}", card.description, ""]
    rows.extend(f"**{name}:** {value}" for name, value in card.fields)
    return "\n".join(rows)
