from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from engine.date import date
from engine.rand import rand

type Handler = Callable[[Message], Awaitable[None]]
type Arm     = Callable[[Any], Awaitable[None]]

WILD     = frozenset("*#")
RESERVED = frozenset({ "id", "attempts" })
TOPIC    = 255
STALE    = "broker.stale"

@dataclass(frozen=True, slots=True)
class Message:

    id       : str
    topic    : str
    payload  : dict[str, Any]
    headers  : dict[str, str] = field(default_factory=dict)
    attempts : int = 1
    tag      : Any = None
    queue    : str = ""

    @classmethod
    def make ( cls, topic: str, payload: Mapping[str, Any], headers: Mapping[str, str] | None = None ) -> Message:

        return cls(str(rand.uuid7()), topic, dict(payload), { "sent_at": date.iso(), **(headers or {}) })
