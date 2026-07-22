"""Claude Code stream-json adapter."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from ..models import Provider
from .base import AdapterEvent, AdapterError, ProviderAdapter, _model, _safe_text, _session_id


DEFAULT_ALLOWED_TOOLS = (
    "Read",
    "Edit",
    "Write",
    "Bash(git status)",
    "Bash(git diff *)",
    "Bash(npm test)",
    "Bash(npm run build)",
)


class ClaudeAdapter(ProviderAdapter):
    provider = Provider.CLAUDE

    def __init__(
        self,
        executable: Path,
        *,
        allowed_models,
        allowed_efforts=None,
        allowed_tools=DEFAULT_ALLOWED_TOOLS,
        redactor=None,
    ):
        super().__init__(
            executable,
            allowed_models=allowed_models,
            allowed_efforts=allowed_efforts,
            redactor=redactor,
        )
        self.allowed_tools = tuple(tool.strip() for tool in allowed_tools if tool.strip())
        if not self.allowed_tools:
            raise AdapterError("Claude task tool allowlist cannot be empty")

    def _common(
        self,
        *,
        model: str,
        prompt: str,
        effort: str = "medium",
        resume_id: str | None = None,
    ) -> list[str]:
        model = self.validate_model(model)
        effort = self.validate_effort(effort)
        command = [str(self.executable), "-p"]
        if resume_id is not None:
            if not resume_id.strip():
                raise AdapterError("Claude resume requires a provider session id")
            command.extend(["--resume", resume_id])
        command.extend(
            [
                "--model",
                model,
                "--effort",
                effort,
                "--permission-mode",
                "dontAsk",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--allowed-tools",
                ",".join(self.allowed_tools),
                prompt,
            ]
        )
        return command

    def new_command(self, *, model: str, prompt: str, effort: str = "medium") -> list[str]:
        return self._common(model=model, prompt=prompt, effort=effort)

    def resume_command(
        self,
        *,
        model: str,
        provider_session_id: str,
        prompt: str,
        effort: str = "medium",
    ) -> list[str]:
        return self._common(
            model=model,
            prompt=prompt,
            effort=effort,
            resume_id=provider_session_id,
        )

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
        raw_type = str(payload.get("type") or payload.get("subtype") or "unknown")
        session_id = _session_id(payload)
        reported_model = _model(payload.get("model") or payload.get("model_name"))
        if payload.get("type") == "system" or payload.get("subtype") == "init":
            return [
                AdapterEvent(
                    kind="session_started",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    reported_model=reported_model,
                    summary="Claude session started",
                )
            ]

        events: list[AdapterEvent] = []
        stream_event = payload.get("event") if isinstance(payload.get("event"), dict) else None
        if stream_event is not None:
            delta = stream_event.get("delta")
            if isinstance(delta, dict) and delta.get("type") in {"text_delta", "text"}:
                text = _safe_text(delta.get("text"), self.redactor)
                if text:
                    events.append(
                        AdapterEvent(
                            kind="assistant_message",
                            provider=self.provider,
                            raw_type=str(stream_event.get("type") or raw_type),
                            session_id=session_id,
                            text=text,
                            reported_model=reported_model,
                        )
                    )
            content_block = stream_event.get("content_block")
            if isinstance(content_block, dict) and content_block.get("type") in {"tool_use", "tool_call"}:
                events.append(
                    AdapterEvent(
                        kind="tool_started",
                        provider=self.provider,
                        raw_type=str(stream_event.get("type") or raw_type),
                        session_id=session_id,
                        tool_name=_safe_text(content_block.get("name") or "tool", self.redactor, limit=120),
                        reported_model=reported_model,
                        summary="Claude tool started",
                    )
                )
        content = payload.get("content")
        message = payload.get("message") if isinstance(payload.get("message"), dict) else None
        if message is not None:
            content = message.get("content")
        if isinstance(content, dict):
            content = [content]
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type")
                if block_type in {"thinking", "redacted_thinking"}:
                    continue
                if block_type in {"text", "text_delta"}:
                    text = _safe_text(block.get("text"), self.redactor)
                    if text:
                        events.append(
                            AdapterEvent(
                                kind="assistant_message",
                                provider=self.provider,
                                raw_type=raw_type,
                                session_id=session_id,
                                text=text,
                                reported_model=reported_model,
                            )
                        )
                elif block_type in {"tool_use", "tool_call"}:
                    name = _safe_text(block.get("name") or "tool", self.redactor, limit=120)
                    events.append(
                        AdapterEvent(
                            kind="tool_started",
                            provider=self.provider,
                            raw_type=raw_type,
                            session_id=session_id,
                            tool_name=name,
                            reported_model=reported_model,
                            summary="Claude tool started",
                        )
                    )
                elif block_type in {"tool_result"}:
                    events.append(
                        AdapterEvent(
                            kind="tool_finished",
                            provider=self.provider,
                            raw_type=raw_type,
                            session_id=session_id,
                            reported_model=reported_model,
                            summary="Claude tool finished",
                        )
                    )
        if payload.get("type") == "result" or payload.get("subtype") in {"success", "error_during_execution"}:
            succeeded = payload.get("subtype") in {None, "success"} and not payload.get("is_error", False)
            events.append(
                AdapterEvent(
                    kind="turn_finished" if succeeded else "turn_failed",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    reported_model=reported_model,
                    text=_safe_text(payload.get("result") if not succeeded else None, self.redactor),
                    summary="Claude turn completed" if succeeded else "Claude turn failed",
                )
            )
        if payload.get("type") == "error":
            events.append(
                AdapterEvent(
                    kind="turn_failed",
                    provider=self.provider,
                    raw_type=raw_type,
                    session_id=session_id,
                    reported_model=reported_model,
                    text=_safe_text(payload.get("error") or payload.get("message"), self.redactor),
                    summary="Claude turn failed",
                )
            )
        if events:
            return events
        return [
            AdapterEvent(
                kind="unknown",
                provider=self.provider,
                raw_type=raw_type,
                session_id=session_id,
                reported_model=reported_model,
                summary="Claude event retained privately",
            )
        ]
