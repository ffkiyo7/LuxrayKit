"""Secret-aware redaction for all user-visible harness output."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable


_PATTERNS = (
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+"),
    re.compile(r"(?i)(?:api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+"),
    re.compile(r"https://(?:discord(?:app)?\.com|discord\.com)/api/webhooks/[^\s]+"),
    re.compile(r"\b(?:sk|rk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{10,}\b"),
)


@dataclass
class Redactor:
    exact_secrets: set[str] = field(default_factory=set)

    @classmethod
    def from_environment(cls, environ: dict[str, str] | None = None) -> "Redactor":
        import os

        values = environ if environ is not None else os.environ
        secrets = {
            value
            for key, value in values.items()
            if value and any(marker in key.upper() for marker in ("TOKEN", "SECRET", "PASSWORD", "API_KEY"))
        }
        return cls(secrets)

    def add(self, secret: str | None) -> None:
        if secret:
            self.exact_secrets.add(secret)

    def redact(self, text: str) -> str:
        result = text
        for secret in sorted(self.exact_secrets, key=len, reverse=True):
            result = result.replace(secret, "[REDACTED]")
        for pattern in _PATTERNS:
            result = pattern.sub("[REDACTED]", result)
        return result
