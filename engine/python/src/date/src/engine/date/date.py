from collections.abc import Iterable, Iterator
from datetime import UTC, date as Day, datetime as DateTime, timedelta as TimeDelta
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from engine.error import Code, Fault
from engine.string import string
from .arch import (
    ARABIC, BACKWARD, CLOCK, CLOCKED, COMPACT, DAYS, DAY_NAMES, DIRECTIVE, END, ENDLESS, EPOCH, EPOCH_MS, FEW, FILLER,
    FORMATS, FORWARD, GLUED, HOURS, LAST, LIMIT, MICRO, MILLI, MINUTES, MONTHS, MONTH_NAMES, NEXT, NOON, ONES, QUARTER,
    SECONDS, SHORT, SOON, STEPS, TWO, UNITS, WEEK, WEEKEND, WORDS_UNITS,
)
from .span import Span
import calendar, time

class Date:

    def __init__ ( self ) -> None:

        self._frozen: DateTime | None = None

    def now ( self ) -> DateTime:

        return self._frozen or DateTime.now(UTC)

    def today ( self ) -> Day:

        return self.now().date()

    def stamp ( self ) -> float:

        return self._frozen.timestamp() if self._frozen else time.time()

    def millis ( self ) -> int:

        return self.to_millis(self._frozen) if self._frozen else time.time_ns() // 1_000_000

    def monotonic ( self ) -> float:

        return time.perf_counter()

    def freeze ( self, at: DateTime | None ) -> None:

        self._frozen = self.utc(at) if at else None

    def utc ( self, value: DateTime ) -> DateTime:

        if value.tzinfo is None: return value.replace(tzinfo=UTC)

        try: return value.astimezone(UTC)
        except OverflowError as error: raise self._beyond_(value) from error

    def zone ( self, name: str ) -> ZoneInfo:

        try: return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError) as error:

            raise Fault(Code.BAD_REQUEST, reason="date.zone", errors={ "zone": [name[:LIMIT]] }) from error

    def zones ( self ) -> list[str]:

        return sorted(available_timezones())

    def offset ( self, zone: str, at: DateTime | None = None ) -> int:

        shift = self.local(at or self.now(), zone).utcoffset()

        return int(shift.total_seconds()) if shift else 0

    def local ( self, value: DateTime, zone: str ) -> DateTime:

        try: return self.utc(value).astimezone(self.zone(zone))
        except OverflowError as error: raise self._beyond_(value) from error

    def parse ( self, text: object, formats: tuple[str, ...] = FORMATS ) -> DateTime:

        if isinstance(text, DateTime): return self.utc(text)
        if isinstance(text, (int, float)) and not isinstance(text, bool): return self.of(text)

        raw = string.digits(str(text)).strip()

        if not raw or len(raw) > LIMIT: raise self._refuse_(text)
        if raw.isascii() and raw.isdigit(): return self._digits_(raw)

        try: return self.utc(DateTime.fromisoformat(raw))
        except ValueError: pass

        words, at = self._clock_(raw.lower())
        found     = self._keyword_(words, self.now())
        shift     = self._relative_(words) if found is None else None

        if shift is not None: found = self.add(self.now(), **{ shift[0]: shift[1] })
        if found is None: found = self._formatted_(raw, formats)
        if found is None: raise self._refuse_(text)

        return found.replace(hour=at[0], minute=at[1], second=0, microsecond=0) if at else self.utc(found)

    def day ( self, text: object ) -> Day:

        if isinstance(text, Day) and not isinstance(text, DateTime): return text

        try: return Day.fromisoformat(str(text).strip())
        except ValueError as error: raise self._refuse_(text) from error

    def of ( self, stamp: float ) -> DateTime:

        try: return DateTime.fromtimestamp(stamp / 1000 if abs(stamp) >= EPOCH_MS else stamp, UTC)
        except (OverflowError, OSError, ValueError) as error: raise self._refuse_(stamp) from error

    def from_millis ( self, millis: float ) -> DateTime:

        try: return EPOCH + TimeDelta(milliseconds=millis)
        except (OverflowError, ValueError) as error: raise self._refuse_(millis) from error

    def to_millis ( self, value: DateTime ) -> int:

        return (self.utc(value) - EPOCH) // MILLI

    def iso ( self, value: DateTime | None = None ) -> str:

        return self.utc(value or self.now()).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def http ( self, value: DateTime | None = None ) -> str:

        return self.utc(value or self.now()).strftime("%a, %d %b %Y %H:%M:%S GMT")

    def format ( self, value: DateTime, pattern: str = "%Y-%m-%d %H:%M", zone: str = "UTC", locale: str = "en" ) -> str:

        local  = self.local(value, zone)
        filled = pattern

        if locale == "ar":

            month  = MONTH_NAMES[local.month - 1]
            day    = DAY_NAMES[local.weekday()]
            names  = { "%B": month, "%b": month, "%A": day, "%a": day, "%p": "م" if local.hour >= NOON else "ص" }
            filled = DIRECTIVE.sub(lambda found: names.get(found.group(0), found.group(0)), pattern)

        try: return local.strftime(filled)
        except ValueError as error: raise Fault(Code.INTERNAL, reason="date.format") from error

    def at ( self, value: DateTime, moment: str, zone: str = "UTC" ) -> DateTime:

        parts = [part.strip(" ") for part in moment.split(":")]
        clock = len(parts) <= CLOCKED and all(part.isascii() and part.isdigit() for part in parts)

        if not clock or len(moment) > LIMIT: raise self._refuse_(moment)

        hour, minute, second = (int(parts[index]) if len(parts) > index else 0 for index in range(CLOCKED))

        try: local = self.local(value, zone).replace(hour=hour, minute=minute, second=second, microsecond=0)
        except (OverflowError, ValueError) as error: raise self._refuse_(moment) from error

        return self._instant_(local)

    def after ( self, seconds: float, since: DateTime | None = None ) -> DateTime:

        try: return (since or self.now()) + TimeDelta(seconds=seconds)
        except (OverflowError, ValueError) as error: raise self._beyond_(seconds) from error

    def before ( self, seconds: float, since: DateTime | None = None ) -> DateTime:

        try: return (since or self.now()) - TimeDelta(seconds=seconds)
        except (OverflowError, ValueError) as error: raise self._beyond_(seconds) from error

    def add (
        self, value: DateTime | None = None, *, years: int = 0, months: int = 0, weeks: int = 0, days: int = 0,
        hours: int = 0, minutes: int = 0, seconds: float = 0,
    ) -> DateTime:

        moment = value or self.now()

        try:

            if years or months:

                total  = moment.year * MONTHS + (moment.month - 1) + years * MONTHS + months
                year, month = divmod(total, MONTHS)
                last   = calendar.monthrange(year, month + 1)[1]
                moment = moment.replace(year=year, month=month + 1, day=min(moment.day, last))

            return moment + TimeDelta(weeks=weeks, days=days, hours=hours, minutes=minutes, seconds=seconds)

        except (OverflowError, ValueError) as error: raise self._beyond_(moment) from error

    def sub (
        self, value: DateTime | None = None, *, years: int = 0, months: int = 0, weeks: int = 0, days: int = 0,
        hours: int = 0, minutes: int = 0, seconds: float = 0,
    ) -> DateTime:

        return self.add(
            value, years=-years, months=-months, weeks=-weeks, days=-days, hours=-hours, minutes=-minutes,
            seconds=-seconds,
        )

    def between ( self, start: DateTime, end: DateTime ) -> float:

        return (self.utc(end) - self.utc(start)).total_seconds()

    def diff ( self, start: DateTime, end: DateTime, unit: str = "seconds" ) -> float:

        if unit in SECONDS: return self.between(start, end) / SECONDS[unit]

        first, last = self.utc(start), self.utc(end)
        months = (last.year - first.year) * MONTHS + last.month - first.month

        if (last.day, last.time()) < (first.day, first.time()): months -= 1

        if unit == "months": return float(months)
        if unit == "years": return float(int(months / MONTHS))

        raise Fault(Code.INTERNAL, reason="date.unit", errors={ "unit": [unit] })

    def expired ( self, at: DateTime | None ) -> bool:

        return at is not None and self.utc(at) <= self.now()

    def start_of ( self, unit: str, value: DateTime | None = None, zone: str = "UTC", week_start: int = 0 ) -> DateTime:

        return self._instant_(self._floor_(unit, value, zone, week_start))

    def end_of ( self, unit: str, value: DateTime | None = None, zone: str = "UTC", week_start: int = 0 ) -> DateTime:

        floor = self._floor_(unit, value, zone, week_start)

        try: return self._instant_(self.add(floor, **STEPS[unit]) - MICRO, last=True)
        except Fault: return END

    def start_of_day ( self, value: DateTime | None = None, zone: str = "UTC" ) -> DateTime:

        return self.start_of("day", value, zone)

    def start_of_month ( self, value: DateTime | None = None, zone: str = "UTC" ) -> DateTime:

        return self.start_of("month", value, zone)

    def floor ( self, value: DateTime, seconds: float ) -> DateTime:

        if not 0 < seconds < ENDLESS: raise Fault(Code.INTERNAL, reason="date.floor")

        stamp = self.utc(value).timestamp()

        return self.of(stamp - stamp % seconds)

    def same ( self, left: DateTime, right: DateTime, unit: str = "day", zone: str = "UTC" ) -> bool:

        return self.start_of(unit, left, zone) == self.start_of(unit, right, zone)

    def is_today ( self, value: DateTime, zone: str = "UTC" ) -> bool:

        return self.same(value, self.now(), "day", zone)

    def is_past ( self, value: DateTime ) -> bool:

        return self.utc(value) < self.now()

    def is_future ( self, value: DateTime ) -> bool:

        return self.utc(value) > self.now()

    def is_weekend ( self, value: DateTime, weekend: tuple[int, ...] = WEEKEND, zone: str = "UTC" ) -> bool:

        return self.local(value, zone).weekday() in weekend

    def is_leap ( self, value: DateTime | int ) -> bool:

        return calendar.isleap(value if isinstance(value, int) else value.year)

    def age ( self, birth: DateTime | Day, at: DateTime | None = None ) -> int:

        born = birth.date() if isinstance(birth, DateTime) else birth
        when = (at or self.now()).date()

        return when.year - born.year - ((when.month, when.day) < (born.month, born.day))

    def quarter ( self, value: DateTime ) -> int:

        return (value.month - 1) // QUARTER + 1

    def week ( self, value: DateTime ) -> int:

        return value.isocalendar()[1]

    def weekday ( self, value: DateTime ) -> int:

        return value.weekday()

    def day_of_year ( self, value: DateTime ) -> int:

        return value.timetuple().tm_yday

    def days_in_month ( self, value: DateTime ) -> int:

        return calendar.monthrange(value.year, value.month)[1]

    def range ( self, start: DateTime, end: DateTime, step: TimeDelta | str = "1d" ) -> Iterator[DateTime]:

        try: delta = step if isinstance(step, TimeDelta) else TimeDelta(seconds=self._seconds_(step))
        except OverflowError as error: raise Fault(Code.INTERNAL, reason="date.step") from error

        if delta <= TimeDelta(0): raise Fault(Code.INTERNAL, reason="date.step")

        return self._walk_(self.utc(start), self.utc(end), delta)

    def business_days (
        self, start: DateTime, end: DateTime, weekend: tuple[int, ...] = WEEKEND, holidays: Iterable[Day] = (),
    ) -> int:

        first = self.utc(start).date()
        last  = self.utc(end).date()

        if last < first: return -self.business_days(end, start, weekend, holidays)

        weeks, rest = divmod((last - first).days, WEEK)
        opening     = first.weekday()
        worked      = sum(day not in weekend for day in range(WEEK))
        tail        = sum((opening + step) % WEEK not in weekend for step in range(1, rest + 1))
        closed      = sum(first < day <= last and day.weekday() not in weekend for day in set(holidays))

        return weeks * worked + tail - closed

    def add_business_days (
        self, value: DateTime, count: int, weekend: tuple[int, ...] = WEEKEND, holidays: Iterable[Day] = (),
    ) -> DateTime:

        skipped = set(holidays)
        current = self.utc(value)
        step    = TimeDelta(days=1 if count >= 0 else -1)
        left    = abs(count)

        if all(day in weekend for day in range(WEEK)): raise Fault(Code.INTERNAL, reason="date.weekend")

        try:

            while left:

                current += step

                if current.weekday() not in weekend and current.date() not in skipped: left -= 1

        except OverflowError as error: raise self._beyond_(count) from error

        return current

    def span ( self, start: DateTime, end: DateTime ) -> Span:

        return Span(self.utc(start), self.utc(end))

    def humanize (
        self, value: DateTime, since: DateTime | None = None, locale: str = "en", short: bool = False,
    ) -> str:

        seconds = int(self.between(value, since or self.now()))
        past    = seconds >= 0
        amount  = abs(seconds)

        if amount < SOON: return "الآن" if locale == "ar" else "now" if short else "just now"

        for unit, size in UNITS:

            if amount < size: continue

            count = amount // size

            if short: return f"{count}{SHORT[unit]}" if past else f"+{count}{SHORT[unit]}"

            if locale == "ar":

                one, two, many = ARABIC[unit]
                word = one if count == 1 else two if count == TWO else f"{count} {many if count <= FEW else one}"

                return f"منذ {word}" if past else f"بعد {word}"

            word = f"{count} {unit}{'s' if count != 1 else ''}"

            return f"{word} ago" if past else f"in {word}"

        return "just now"

    def duration ( self, seconds: float ) -> str:

        try: whole = int(seconds)
        except (OverflowError, ValueError) as error: raise self._beyond_(seconds) from error

        total = abs(whole)
        parts: list[str] = []

        for unit, size in (("d", 86400), ("h", 3600), ("m", 60), ("s", 1)):

            count, total = divmod(total, size)

            if count: parts.append(f"{count}{unit}")

        return ("-" if whole < 0 else "") + " ".join(parts) if parts else "0s"

    def _seconds_ ( self, step: str ) -> float:

        shift = self._relative_(step.strip().lower()) if len(step) <= LIMIT else None

        if shift is None or shift[0] not in SECONDS:

            raise Fault(Code.INTERNAL, reason="date.step", errors={ "step": [step[:LIMIT]] })

        return shift[1] * SECONDS[shift[0]]

    def _refuse_ ( self, text: object ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Cannot read the date", "date.parse", { "value": [self._shown_(text)] })

    def _beyond_ ( self, value: object ) -> Fault:

        return Fault(Code.BAD_REQUEST, "The date is out of range", "date.range", { "value": [self._shown_(value)] })

    def _shown_ ( self, value: object ) -> str:

        try: return str(value)[:LIMIT]
        except ValueError: return type(value).__name__

    def _walk_ ( self, current: DateTime, last: DateTime, delta: TimeDelta ) -> Iterator[DateTime]:

        while current < last:

            yield current

            if last - current <= delta: return

            current += delta

    def _digits_ ( self, raw: str ) -> DateTime:

        pattern = COMPACT.get(len(raw))

        if pattern is not None:

            try: return DateTime.strptime(raw, pattern).replace(tzinfo=UTC)
            except ValueError: pass

        return self.of(int(raw))

    def _keyword_ ( self, text: str, now: DateTime ) -> DateTime | None:

        if text not in DAYS: return None

        offset = DAYS[text]

        if offset is None: return now

        return now.replace(hour=0, minute=0, second=0, microsecond=0) + TimeDelta(days=offset)

    def _relative_ ( self, text: str ) -> tuple[str, int] | None:

        sign  = 1
        count: int | None = None
        unit: str | None = None

        for token in GLUED.sub(r"\1 \2", text).split():

            bare = token.startswith("ال") and token not in WORDS_UNITS and token not in NEXT | LAST
            word = token[2:] if bare else token

            if token in FORWARD: sign = 1
            elif token in BACKWARD: sign = -1
            elif token.isascii() and token.isdigit(): count = int(token)
            elif token in ONES: count = ONES[token]
            elif word in WORDS_UNITS:

                unit, count = WORDS_UNITS[word][0], WORDS_UNITS[word][1] if count is None else count
            elif token in FILLER: continue
            else: return None

            if (token in NEXT or token in LAST) and count is None: count = 1

        if unit is None: return None

        return unit, sign * (1 if count is None else count)

    def _floor_ ( self, unit: str, value: DateTime | None, zone: str, week_start: int ) -> DateTime:

        local = self.local(value or self.now(), zone)
        day   = local.replace(hour=0, minute=0, second=0, microsecond=0, fold=0)

        try:

            if unit == "minute": found = local.replace(second=0, microsecond=0, fold=0)
            elif unit == "hour": found = local.replace(minute=0, second=0, microsecond=0, fold=0)
            elif unit == "day": found = day
            elif unit == "week": found = day - TimeDelta(days=(day.weekday() - week_start) % WEEK)
            elif unit == "month": found = day.replace(day=1)
            elif unit == "quarter": found = day.replace(day=1, month=(day.month - 1) // QUARTER * QUARTER + 1)
            elif unit == "year": found = day.replace(day=1, month=1)
            else: raise Fault(Code.INTERNAL, reason="date.unit", errors={ "unit": [unit[:LIMIT]] })

        except OverflowError as error: raise self._beyond_(local) from error

        return found

    def _instant_ ( self, wall: DateTime, last: bool = False ) -> DateTime:

        early, late   = wall.replace(fold=0), wall.replace(fold=1)
        before, after = early.utcoffset(), late.utcoffset()

        if before is None or after is None or before >= after: return self.utc(late if last else early)

        low, high = self.utc(late), self.utc(early)

        while high - low > MICRO:

            middle = low + (high - low) // 2

            if middle.astimezone(wall.tzinfo).utcoffset() == before: low = middle
            else: high = middle

        return low if last else high

    def _clock_ ( self, text: str ) -> tuple[str, tuple[int, int] | None]:

        found = CLOCK.search(text)

        if found is None: return text, None

        hour, minute, meridian = int(found.group(1)), int(found.group(2) or 0), (found.group(3) or "").lower()

        if meridian in ("pm", "م") and hour < NOON: hour += NOON
        if meridian in ("am", "ص") and hour == NOON: hour = 0
        if hour >= HOURS or minute >= MINUTES: return text, None

        return text[:found.start()].strip(), (hour, minute)

    def _formatted_ ( self, text: str, formats: tuple[str, ...] = FORMATS ) -> DateTime | None:

        for pattern in formats:

            try: return DateTime.strptime(text, pattern).replace(tzinfo=UTC)
            except ValueError: continue

        try: return self.utc(parsedate_to_datetime(text))
        except (TypeError, ValueError, IndexError): return None
