"""Provider-specific reasoning effort levels.

The provider CLIs do not expose exactly the same effort vocabulary.  Keep the
allowlists explicit so a Discord control cannot silently request a level the
selected provider does not understand.
"""

from __future__ import annotations

from .models import Provider


CODEX_REASONING_EFFORTS = ("none", "minimal", "low", "medium", "high", "xhigh")
CLAUDE_REASONING_EFFORTS = ("low", "medium", "high", "xhigh", "max")
DEFAULT_REASONING_EFFORT = "medium"


def default_reasoning_efforts(provider: Provider) -> tuple[str, ...]:
    if provider is Provider.CODEX:
        return CODEX_REASONING_EFFORTS
    if provider is Provider.CLAUDE:
        return CLAUDE_REASONING_EFFORTS
    raise ValueError(f"unknown provider: {provider}")
