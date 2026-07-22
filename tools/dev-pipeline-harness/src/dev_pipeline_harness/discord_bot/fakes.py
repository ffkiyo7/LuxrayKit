"""Tiny fake Discord objects used by protocol tests."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FakeAuthor:
    id: int
    bot: bool = False


@dataclass
class FakeGuild:
    id: int


@dataclass
class FakeChannel:
    id: int
    parent_id: int | None = None
    archived: bool = False
    messages: list[str] = field(default_factory=list)


@dataclass
class FakeMessage:
    id: int
    content: str
    author: FakeAuthor
    guild: FakeGuild | None
    channel: FakeChannel
