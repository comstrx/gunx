from .base import Base
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime as DateTime, timedelta as TimeDelta

from engine.error import Code, Fault
from .arch import ZERO

@dataclass(frozen=True, slots=True)
class Span:

    start : DateTime
    end   : DateTime

    def __post_init__ ( self ) -> None:

        start, end = Base.utc(self.start), Base.utc(self.end)

        if end < start: raise Fault(Code.BAD_REQUEST, "The span ends before it starts", "date.span")

        if start is not self.start: object.__setattr__(self, "start", start)
        if end is not self.end: object.__setattr__(self, "end", end)

    def seconds ( self ) -> float:

        return (self.end - self.start).total_seconds()

    def minutes ( self ) -> float:

        return self.seconds() / 60

    def hours ( self ) -> float:

        return self.seconds() / 3600

    def days ( self ) -> float:

        return self.seconds() / 86400

    def contains ( self, moment: DateTime ) -> bool:

        return self.start <= Base.utc(moment) < self.end

    def overlaps ( self, other: Span ) -> bool:

        return max(self.start, other.start) < min(self.end, other.end)

    def intersect ( self, other: Span ) -> Span | None:

        start, end = max(self.start, other.start), min(self.end, other.end)

        return Span(start, end) if start < end else None

    def dump ( self ) -> dict[str, str]:

        return { "start": self.start.isoformat(), "end": self.end.isoformat() }

    def split ( self, step: TimeDelta ) -> Iterator[Span]:

        if step <= ZERO: raise Fault(Code.INTERNAL, reason="date.step")

        current = self.start

        while current < self.end:

            end = self.end if self.end - current <= step else current + step

            yield Span(current, end)

            current = end
