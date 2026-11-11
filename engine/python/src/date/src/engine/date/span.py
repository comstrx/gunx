from dataclasses import dataclass
from datetime import datetime as DateTime

from engine.error import Code, Fault

@dataclass(frozen=True, slots=True)
class Span:

    start : DateTime
    end   : DateTime

    def __post_init__ ( self ) -> None:

        if self.end < self.start: raise Fault(Code.BAD_REQUEST, "The span ends before it starts", "date.span")

    def seconds ( self ) -> float:

        return (self.end - self.start).total_seconds()

    def minutes ( self ) -> float:

        return self.seconds() / 60

    def hours ( self ) -> float:

        return self.seconds() / 3600

    def days ( self ) -> float:

        return self.seconds() / 86400

    def contains ( self, moment: DateTime ) -> bool:

        return self.start <= moment < self.end

    def overlaps ( self, other: Span ) -> bool:

        return self.start < other.end and other.start < self.end

    def intersect ( self, other: Span ) -> Span | None:

        start, end = max(self.start, other.start), min(self.end, other.end)

        return Span(start, end) if start < end else None

    def dump ( self ) -> dict[str, str]:

        return { "start": self.start.isoformat(), "end": self.end.isoformat() }
