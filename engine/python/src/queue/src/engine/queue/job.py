from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from engine.context import context
from engine.date import date
from engine.error import Fault
from engine.rand import rand
from .arch import (
    BACKOFF, DEFAULT, MAX_BACKOFF, MAX_TIMEOUT, MAX_TRIES, named, real, STAMP, STAMPED, TRIES, whole, wrong,
)

@dataclass(frozen=True, slots=True)
class Job:

    id        : str
    name      : str
    payload   : dict[str, Any]
    queue     : str = DEFAULT
    tries     : int = TRIES
    backoff   : float = BACKOFF
    attempt   : int = 0
    unique    : str | None = None
    facts     : dict[str, Any] = field(default_factory=dict)
    timeout   : float = 0.0
    available : str = ""

    def __post_init__ ( self ) -> None:

        payload: object = self.payload
        facts: object = self.facts

        if not named(self.id) or not named(self.name) or not named(self.queue): raise wrong("name")
        if not isinstance(payload, dict) or not isinstance(facts, dict): raise wrong("payload")
        if not whole(self.tries, 1, MAX_TRIES) or not whole(self.attempt, 0, MAX_TRIES): raise wrong("tries")
        if not real(self.backoff, MAX_BACKOFF) or not real(self.timeout, MAX_TIMEOUT): raise wrong("timing")
        if self.unique is not None and not named(self.unique): raise wrong("unique")
        if type(self.available) is not str or len(self.available) > STAMP: raise wrong("available")
        if self.available and not STAMPED.fullmatch(self.available): raise wrong("available")

        try: _ = date.parse(self.available) if self.available else None
        except Fault as fault: raise wrong("available") from fault

    @classmethod
    def make (
        cls, name: str, payload: Mapping[str, Any], queue: str = DEFAULT, tries: int = TRIES, backoff: float = BACKOFF,
        unique: str | None = None, timeout: float = 0.0, delay: float = 0.0,
    ) -> Job:

        available = date.iso(date.after(delay)) if delay > 0 else ""

        facts = context.dump()

        return cls(str(rand.uuid7()), name, dict(payload), queue, tries, backoff, 0, unique, facts, timeout, available)

    def dump ( self ) -> dict[str, Any]:

        return {
            "id": self.id, "name": self.name, "payload": self.payload, "queue": self.queue, "tries": self.tries,
            "backoff": self.backoff, "attempt": self.attempt, "unique": self.unique, "facts": self.facts,
            "timeout": self.timeout, "available": self.available,
        }

    @classmethod
    def load ( cls, raw: Mapping[str, Any] ) -> Job:

        if not isinstance(raw, Mapping): raise wrong("payload")

        try:

            return cls(
                str(raw.get("id", "")), str(raw.get("name", "")), dict(raw.get("payload") or {}),
                str(raw.get("queue") or DEFAULT), int(raw.get("tries") or TRIES),
                float(BACKOFF if raw.get("backoff") is None else raw["backoff"]),
                int(raw.get("attempt") or 0), raw.get("unique"), dict(raw.get("facts") or {}),
                float(raw.get("timeout") or 0.0), str(raw.get("available") or ""),
            )

        except (TypeError, ValueError, OverflowError) as error: raise wrong("payload") from error

    def again ( self ) -> Job:

        wait = min(3600.0, self.backoff * (2 ** self.attempt))

        return Job(
            self.id, self.name, self.payload, self.queue, self.tries, self.backoff, self.attempt + 1, self.unique,
            self.facts, self.timeout, date.iso(date.after(wait)),
        )

    def exhausted ( self ) -> bool:

        return self.attempt + 1 >= self.tries

    def due ( self ) -> bool:

        return not self.available or date.expired(date.parse(self.available))
