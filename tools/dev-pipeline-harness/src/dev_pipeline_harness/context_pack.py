"""Safe handoff context for explicit provider switches."""

from __future__ import annotations

from pathlib import Path

from .filesystem import ensure_private_file
from .redaction import Redactor


def build_context_pack(
    *,
    path: Path,
    requirements: str,
    decisions: str,
    head_sha: str,
    unresolved: str,
    safe_error_summary: str = "",
    redactor: Redactor | None = None,
) -> Path:
    redactor = redactor or Redactor()
    if not path.is_absolute():
        raise ValueError("context pack path must be absolute")
    content = "\n".join(
        [
            "# Provider handoff context",
            "",
            "This file is a bounded handoff. Raw transcript, hidden reasoning, credentials, and complete environment values are omitted.",
            "",
            "## Requirements",
            redactor.redact(requirements),
            "",
            "## Decisions",
            redactor.redact(decisions),
            "",
            "## Recorded HEAD",
            redactor.redact(head_sha),
            "",
            "## Unresolved items",
            redactor.redact(unresolved),
            "",
            "## Safe error summary",
            redactor.redact(safe_error_summary),
            "",
        ]
    )
    ensure_private_file(path)
    path.write_text(content, encoding="utf-8")
    path.chmod(0o600)
    return path
