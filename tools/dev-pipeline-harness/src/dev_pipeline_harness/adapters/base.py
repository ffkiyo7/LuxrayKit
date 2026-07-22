"""Provider adapter contract."""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from ..models import Provider
from ..redaction import Redactor
from ..reasoning import default_reasoning_efforts


class AdapterError(ValueError):
    pass


@dataclass(frozen=True)
class AdapterEvent:
    kind: str
    provider: Provider
    raw_type: str
    session_id: str | None = None
    text: str | None = None
    tool_name: str | None = None
    reported_model: str | None = None
    summary: str | None = None

    @property
    def user_visible(self) -> bool:
        return self.kind in {
            "assistant_message",
            "tool_started",
            "tool_finished",
            "turn_finished",
            "turn_failed",
        }


def _safe_text(value, redactor: Redactor, *, limit: int = 4000) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True)
    text = redactor.redact(str(value)).strip()
    if not text:
        return None
    return text[:limit]


def _model(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _session_id(payload: dict) -> str | None:
    for key in ("thread_id", "session_id", "conversation_id"):
        value = payload.get(key)
        if value:
            return str(value)
    for key in ("thread", "session", "conversation"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            for id_key in ("id", "thread_id", "session_id"):
                if nested.get(id_key):
                    return str(nested[id_key])
    return None


class ProviderAdapter(ABC):
    provider: Provider

    def __init__(
        self,
        executable: Path,
        *,
        allowed_models: Iterable[str],
        allowed_efforts: Iterable[str] | None = None,
        redactor: Redactor | None = None,
    ):
        self.executable = Path(executable)
        self.allowed_models = tuple(str(model).strip() for model in allowed_models if str(model).strip())
        effort_values = allowed_efforts if allowed_efforts is not None else default_reasoning_efforts(self.provider)
        self.allowed_efforts = tuple(str(effort).strip().lower() for effort in effort_values if str(effort).strip())
        self.redactor = redactor or Redactor()
        if not self.executable.is_absolute():
            raise AdapterError("provider executable must be an absolute path")
        if not self.allowed_models:
            raise AdapterError("provider model allowlist cannot be empty")
        if not self.allowed_efforts:
            raise AdapterError("provider reasoning effort allowlist cannot be empty")

    def validate_model(self, model: str) -> str:
        model = model.strip()
        if model not in self.allowed_models:
            raise AdapterError("model is not in the provider allowlist")
        return model

    def validate_effort(self, effort: str) -> str:
        effort = effort.strip().lower()
        if effort not in self.allowed_efforts:
            raise AdapterError("reasoning effort is not in the provider allowlist")
        return effort

    def version_command(self) -> list[str]:
        return [str(self.executable), "--version"]

    @abstractmethod
    def new_command(self, *, model: str, prompt: str, effort: str = "medium") -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def resume_command(
        self,
        *,
        model: str,
        provider_session_id: str,
        prompt: str,
        effort: str = "medium",
    ) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def parse_line(self, line: str) -> list[AdapterEvent]:
        raise NotImplementedError

    def parse_stream(self, lines: Iterable[str]) -> list[AdapterEvent]:
        events: list[AdapterEvent] = []
        for line in lines:
            events.extend(self.parse_line(line))
        return events
