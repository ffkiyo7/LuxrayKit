"""Codex CLI JSONL adapter."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from ..models import Provider
from .base import AdapterEvent, AdapterError, ProviderAdapter, _model, _safe_text, _session_id


class CodexAdapter(ProviderAdapter):
    provider = Provider.CODEX

    def new_command(self, *, model: str, prompt: str, effort: str = "medium") -> list[str]:
        model = self.validate_model(model)
        effort = self.validate_effort(effort)
        return [
            str(self.executable),
            "exec",
            "--json",
            "--sandbox",
            "workspace-write",
            "-c",
            f'model_reasoning_effort="{effort}"',
            "-m",
            model,
            prompt,
        ]

    def resume_command(
        self,
        *,
        model: str,
        provider_session_id: str,
        prompt: str,
        effort: str = "medium",
    ) -> list[str]:
        model = self.validate_model(model)
        effort = self.validate_effort(effort)
        if not provider_session_id.strip():
            raise AdapterError("Codex resume requires a provider session id")
        return [
            str(self.executable),
            "exec",
            "resume",
            "--json",
            "-c",
            f'model_reasoning_effort="{effort}"',
            "-m",
            model,
            provider_session_id,
            prompt,
        ]

    def parse_line(self, line: str) -> list[AdapterEvent]:
        try:
            payload = json.loads(line)
        except (TypeError, json.JSONDecodeError):
            return [
                AdapterEvent(
                    kind="unknown",
                    provider=self.provider,
                    raw_type="invalid-json",
                    summary="provider emitted a non-JSON line",
                )
            ]
        if not isinstance(payload, dict):
            return [
                AdapterEvent(
                    kind="unknown",
                    provider=self.provider,
                    raw_type="non-object",
                    summary="provider emitted a non-object event",
                )
            ]
        raw_type = str(payload.get("type") or payload.get("event") or "unknown")
        session_id = _session_id(payload)
        reported_model = _model(payload.get("model") or payload.get("model_slug") or payload.get("model_name"))
        if raw_type in {"thread.started", "thread_start", "session.started"}:
            return [
                AdapterEvent(
                    kind="session_started",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    reported_model=reported_model,
                    summary="Codex session started",
                )
            ]

        item = payload.get("item") if isinstance(payload.get("item"), dict) else payload
        item_type = str(item.get("type") or "")
        if item_type in {"reasoning", "reasoning_message", "analysis"}:
            return []
        if item_type in {"agent_message", "assistant_message", "message"}:
            text = item.get("text") or item.get("message") or item.get("content")
            text = _safe_text(text, self.redactor)
            return [
                AdapterEvent(
                    kind="assistant_message",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    text=text,
                    reported_model=reported_model,
                )
            ] if text else []
        if item_type in {"command_execution", "tool_call", "tool_use"}:
            name = _safe_text(item.get("name") or item.get("command") or "tool", self.redactor, limit=120)
            phase = str(payload.get("phase") or payload.get("status") or "")
            kind = "tool_finished" if raw_type.endswith("completed") or phase in {"completed", "finished"} else "tool_started"
            return [
                AdapterEvent(
                    kind=kind,
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    tool_name=name,
                    reported_model=reported_model,
                    summary="Codex tool event",
                )
            ]
        if raw_type in {"turn.completed", "turn_complete", "response.completed"}:
            return [
                AdapterEvent(
                    kind="turn_finished",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    reported_model=reported_model,
                    summary="Codex turn completed",
                )
            ]
        if raw_type in {"error", "turn.failed", "response.failed"}:
            error = payload.get("error") or payload.get("message") or payload.get("detail")
            return [
                AdapterEvent(
                    kind="turn_failed",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    reported_model=reported_model,
                    text=_safe_text(error, self.redactor),
                    summary="Codex turn failed",
                )
            ]
        return [
            AdapterEvent(
                kind="unknown",
                provider=self.provider,
                raw_type=raw_type,
                session_id=session_id,
                reported_model=reported_model,
                summary="Codex event retained privately",
            )
        ]
