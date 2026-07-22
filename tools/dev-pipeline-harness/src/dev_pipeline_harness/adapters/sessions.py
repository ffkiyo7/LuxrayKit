"""Provider session bookkeeping, model switching and safe context packs."""

from __future__ import annotations

import subprocess
from pathlib import Path

from ..context_pack import build_context_pack
from ..filesystem import StateLayout
from ..models import Provider, ProviderSession, TurnState
from ..reasoning import default_reasoning_efforts
from ..state import QueueError, StateStore
from .base import AdapterError, AdapterEvent


class ModelSwitchError(ValueError):
    pass


def validate_allowlisted_model(model: str, allowlist: tuple[str, ...]) -> str:
    model = model.strip()
    if not model or model not in allowlist:
        raise ModelSwitchError("model is not in the configured provider allowlist")
    return model


def validate_allowlisted_effort(effort: str, allowlist: tuple[str, ...]) -> str:
    effort = effort.strip().lower()
    if not effort or effort not in allowlist:
        raise ModelSwitchError("reasoning effort is not in the configured provider allowlist")
    return effort


def write_context_pack(state: StateStore, layout: StateLayout, harness_session_id: str) -> Path:
    session = state.get_session(harness_session_id)
    providers = state.list_provider_sessions(harness_session_id)
    turns = state.list_turns(harness_session_id)
    path = layout.session_dir(harness_session_id) / "context.md"
    try:
        result = subprocess.run(
            ["git", "-C", str(session.worktree), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        head_sha = result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        head_sha = "unavailable; inspect the worktree before continuing"

    provider_lines = [
        f"- row {provider.id}: {provider.provider.value}; default model {provider.default_model}; "
        f"default effort {provider.default_effort}; status {provider.status.value}"
        for provider in providers
    ]
    turn_lines = [
        f"- {turn.id}: requested {turn.requested_model}/{turn.requested_effort}; "
        f"configured {turn.configured_model}/{turn.configured_effort}; "
        f"reported {turn.reported_model or 'not reported'}; state {turn.state.value}; attempt {turn.attempt}"
        for turn in turns
    ]
    errors = [turn.error_summary for turn in turns if turn.error_summary]
    build_context_pack(
        path=path,
        requirements=(
            f"Continue session {session.id} in repository {session.repo}, worktree {session.worktree}, "
            f"branch {session.branch}. Preserve the existing TASK scope and owner gates."
        ),
        decisions="\n".join(provider_lines + turn_lines) or "No provider or turn history has been recorded.",
        head_sha=head_sha,
        unresolved=(
            f"Session status: {session.status.value}.\n"
            "Review the recorded state before starting a new turn; never infer completion from a Discord message."
        ),
        safe_error_summary="\n".join(errors),
    )
    state.set_context_path(harness_session_id, path)
    return path


class ProviderSessionController:
    def __init__(
        self,
        *,
        state: StateStore,
        layout: StateLayout,
        allowlists: dict[Provider, tuple[str, ...]],
        effort_allowlists: dict[Provider, tuple[str, ...]] | None = None,
    ):
        self.state = state
        self.layout = layout.ensure()
        self.allowlists = allowlists
        self.effort_allowlists = effort_allowlists or {
            provider: default_reasoning_efforts(provider) for provider in Provider
        }

    def change_model(self, provider_session_row_id: int, requested_model: str) -> ProviderSession:
        provider_session = self.state.get_provider_session(provider_session_row_id)
        allowlist = self.allowlists.get(provider_session.provider, ())
        model = validate_allowlisted_model(requested_model, allowlist)
        try:
            return self.state.set_default_model(provider_session_row_id, model)
        except QueueError as exc:
            raise ModelSwitchError("provider session is busy; wait until its turn is idle") from exc

    def change_effort(self, provider_session_row_id: int, requested_effort: str) -> ProviderSession:
        provider_session = self.state.get_provider_session(provider_session_row_id)
        effort = validate_allowlisted_effort(
            requested_effort,
            self.effort_allowlists.get(provider_session.provider, ()),
        )
        try:
            return self.state.set_default_effort(provider_session_row_id, effort)
        except QueueError as exc:
            raise ModelSwitchError("provider session is busy; wait until its turn is idle") from exc

    def switch_provider(
        self,
        *,
        harness_session_id: str,
        provider: Provider,
        requested_model: str,
        switched_from_id: int,
        requested_effort: str = "medium",
    ) -> ProviderSession:
        model = validate_allowlisted_model(requested_model, self.allowlists.get(provider, ()))
        effort = validate_allowlisted_effort(
            requested_effort,
            self.effort_allowlists.get(provider, ()),
        )
        previous = self.state.get_provider_session(switched_from_id)
        if previous.harness_session_id != harness_session_id:
            raise ModelSwitchError("provider switch source does not belong to the session")
        if any(
            turn.state in {TurnState.LAUNCHING, TurnState.RUNNING}
            for turn in self.state.list_turns(harness_session_id)
        ):
            raise ModelSwitchError("provider switch is only allowed while the session is idle")
        write_context_pack(self.state, self.layout, harness_session_id)
        return self.state.create_provider_session(
            harness_session_id=harness_session_id,
            provider=provider,
            default_model=model,
            default_effort=effort,
            switched_from_id=switched_from_id,
        )

    def record_event(self, turn_id: str, event: AdapterEvent) -> None:
        turn = self.state.get_turn(turn_id)
        provider_session = self.state.get_provider_session(turn.provider_session_id)
        if event.provider is not provider_session.provider:
            raise AdapterError("provider event does not match recorded provider session")
        if event.kind == "session_started" and event.session_id:
            self.state.set_provider_session_id(provider_session.id, event.session_id)
        if event.reported_model:
            self.state.set_turn_reported_model(turn_id, event.reported_model)
