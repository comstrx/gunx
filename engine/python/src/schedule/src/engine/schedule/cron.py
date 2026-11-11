from dataclasses import dataclass
from datetime import datetime, timedelta

from engine.error import Code, Fault
from .arch import ALIASES, BOUNDS, DECEMBER, FIELDS, HORIZON, NAMES, SATURDAY, SUNDAY, WIDEST

@dataclass(frozen=True, slots=True)
class Cron:

    text    : str
    minutes : frozenset[int]
    hours   : frozenset[int]
    days    : frozenset[int]
    months  : frozenset[int]
    weekdays: frozenset[int]
    any_day : bool
    any_week: bool

    @classmethod
    def parse ( cls, text: str ) -> Cron:

        if type(text) is not str or len(text) > WIDEST: raise cls._refuse_(str(text)[:64])

        raw    = ALIASES.get(text.strip().lower(), text.strip().lower())
        fields = raw.split()

        if len(fields) != FIELDS: raise cls._refuse_(text)

        sets = [cls._field_(part, low, high, text) for part, (low, high) in zip(fields, BOUNDS, strict=True)]

        return cls(text.strip(), sets[0], sets[1], sets[2], sets[3], sets[4], fields[2] == "*", fields[4] == "*")

    @classmethod
    def _field_ ( cls, part: str, low: int, high: int, text: str ) -> frozenset[int]:

        found: set[int] = set()

        for piece in part.split(","):

            body, _, step = piece.partition("/")
            every = int(step) if step.isdigit() else 1

            if step and (not step.isdigit() or every < 1): raise cls._refuse_(text)

            if body == "*": start, end = low, high
            elif "-" in body:

                a, _, b = body.partition("-")
                start, end = cls._value_(a, low, high, text), cls._value_(b, low, high, text)

            else:

                start = cls._value_(body, low, high, text)
                end   = high if step else start

            if start > end: raise cls._refuse_(text)

            found.update(range(start, end + 1, every))

        if SUNDAY in found and high == SATURDAY:

            found.discard(SUNDAY)
            found.add(0)

        return frozenset(found)

    @classmethod
    def _value_ ( cls, token: str, low: int, high: int, text: str ) -> int:

        value = NAMES.get(token) if token in NAMES else (int(token) if token.isdigit() else None)

        if value is None or value < low or value > (high + (1 if high == SATURDAY else 0)): raise cls._refuse_(text)

        return value

    def matches ( self, at: datetime ) -> bool:

        return at.minute in self.minutes and at.hour in self.hours and at.month in self.months and self._day_(at)

    def next ( self, after: datetime ) -> datetime:

        if not isinstance(after, datetime): raise Fault(Code.INTERNAL, reason="cron.moment")

        candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
        horizon   = candidate + timedelta(minutes=HORIZON)

        for _ in range(HORIZON):

            if candidate > horizon: break

            if candidate.month not in self.months: candidate = self._month_(candidate)
            elif not self._day_(candidate): candidate = (candidate + timedelta(days=1)).replace(hour=0, minute=0)
            elif candidate.hour not in self.hours: candidate = (candidate + timedelta(hours=1)).replace(minute=0)
            elif candidate.minute not in self.minutes: candidate += timedelta(minutes=1)
            else: return candidate

        raise Fault(Code.INTERNAL, reason="cron.horizon", errors={ "cron": [self.text] })

    def _day_ ( self, at: datetime ) -> bool:

        weekday = (at.weekday() + 1) % 7
        day_ok  = at.day in self.days
        week_ok = weekday in self.weekdays

        if not self.any_day and not self.any_week: return day_ok or week_ok

        return day_ok and week_ok

    @staticmethod
    def _month_ ( at: datetime ) -> datetime:

        year, month = (at.year + 1, 1) if at.month == DECEMBER else (at.year, at.month + 1)

        return at.replace(year=year, month=month, day=1, hour=0, minute=0)

    def describe ( self ) -> dict[str, object]:

        return { "cron": self.text, "minutes": sorted(self.minutes), "hours": sorted(self.hours) }

    @staticmethod
    def _refuse_ ( text: str ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Cannot read the schedule", "cron.parse", { "cron": [text[:64]] })
