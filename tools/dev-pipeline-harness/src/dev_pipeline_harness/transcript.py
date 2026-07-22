"""Private raw transcripts and replayable, redacted Discord logs."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .filesystem import ensure_private_file


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


@dataclass(frozen=True)
class TranscriptPaths:
    raw: Path
    sanitized: Path
    result: Path


class TranscriptWriter:
    def __init__(self, paths: TranscriptPaths, redactor):
        self.paths = paths
        self.redactor = redactor
        for path in (paths.raw, paths.sanitized, paths.result):
            ensure_private_file(path)

    def append(self, *, stream: str, line: str) -> int:
        if stream not in {"stdout", "stderr"}:
            raise ValueError("unknown transcript stream")
        raw_record = {"ts": _now(), "stream": stream, "line": line}
        raw_bytes = (json.dumps(raw_record, ensure_ascii=False) + "\n").encode("utf-8")
        safe_record = {
            **raw_record,
            "line": self.redactor.redact(line),
        }
        safe_bytes = (json.dumps(safe_record, ensure_ascii=False) + "\n").encode("utf-8")
        with self.paths.raw.open("ab") as raw_handle:
            raw_handle.write(raw_bytes)
            raw_handle.flush()
            os.fsync(raw_handle.fileno())
            offset = raw_handle.tell()
        with self.paths.sanitized.open("ab") as safe_handle:
            safe_handle.write(safe_bytes)
            safe_handle.flush()
        return offset

    def write_result(self, result: dict) -> None:
        temporary = self.paths.result.with_suffix(self.paths.result.suffix + ".tmp")
        ensure_private_file(temporary)
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.paths.result)
        os.chmod(self.paths.result, 0o600)


def read_delta(path: Path, offset: int = 0) -> tuple[list[str], int]:
    """Read only complete UTF-8 lines after a byte offset."""

    if offset < 0:
        raise ValueError("offset cannot be negative")
    if not path.exists():
        return [], offset
    with path.open("rb") as handle:
        handle.seek(offset)
        data = handle.read()
    complete = data.rsplit(b"\n", 1)
    if len(complete) == 1:
        return [], offset
    payload, _partial = complete
    lines = payload.splitlines(keepends=True)
    new_offset = offset + len(payload) + 1
    return [line.decode("utf-8", errors="replace").rstrip("\n") for line in lines], new_offset


def load_result(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        result = json.load(handle)
    if not isinstance(result, dict):
        raise ValueError("turn result must be a JSON object")
    return result
