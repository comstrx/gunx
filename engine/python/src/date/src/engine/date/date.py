from bisect import bisect_left, bisect_right
from collections.abc import Iterable, Iterator
from datetime import UTC, date as Day, datetime as DateTime, timedelta as TimeDelta
from email.utils import format_datetime, parsedate_to_datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from engine.error import Code, Fault
from engine.string import string
from .arch import (
    ARABIC, BACKWARD, CLOCK, CLOCKED, COMPACT, DAYS, DAY_NAMES, DIRECTIVE, DURATION, END, ENDLESS, EPOCH, EPOCH_MS, FEW,
    FILLER, FORMAT, FORMATS, FORWARD, GLUED, HOURS, LAST, LIMIT, MICRO, MILLI, MINUTES, MONTHS, MONTH_NAMES, NEXT,
    NOON, ONES, QUARTER, SECONDS, SHORT, SOON, STEPS, TWO, UNITS, WEEK, WEEKEND, WORDS_UNITS, ZERO, utc,
)
from .span import Span
import calendar, time

class Date:

    def __init__ ( self ) -> None:

        self._frozen: DateTime | None = None
        self._zone    = "UTC"
        self._pattern = FORMAT

    def options ( self, *, zone: str | None = None, pattern: str | None = None ) -> Date:

        scoped = Date()
        scoped._zone    = self._zone if zone is None else zone
        scoped._pattern = self._pattern if pattern is None else pattern
        scoped._frozen  = self._frozen
        scoped.format(EPOCH)

        return scoped

    def now ( self ) -> DateTime:

        return self._frozen or DateTime.now(UTC)

    def today ( self ) -> Day:

        return self.local(self.now()).date()

    def stamp ( self ) -> float:

        return self._frozen.timestamp() if self._frozen else time.time()

    def millis ( self ) -> int:

        return self.to_millis(self._frozen) if self._frozen else time.time_ns() // 1_000_000

    def monotonic ( self ) -> float:

        return time.perf_counter()

    def freeze ( self, at: DateTime | None ) -> None:

        self._frozen = self.utc(at) if at else None

    def utc ( self, value: DateTime ) -> DateTime:

        return value if value.tzinfo is UTC else utc(value)

    def zone ( self, name: str ) -> ZoneInfo:

        if len(name) > LIMIT: raise Fault(Code.BAD_REQUEST, reason="date.zone", errors={ "zone": [name[:LIMIT]] })

        try: return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError) as error:

            raise Fault(Code.BAD_REQUEST, reason="date.zone", errors={ "zone": [name[:LIMIT]] }) from error

    def zones ( self ) -> list[str]:

        return sorted(available_timezones())

    def offset ( self, zone: str | None = None, at: DateTime | None = None ) -> int:

        shift = self.local(at or self.now(), zone).utcoffset()

        return int(shift.total_seconds()) if shift else 0

    def local ( self, value: DateTime, zone: str | None = None ) -> DateTime:

        name = self._zone if zone is None else zone

        if name == "UTC": return self.utc(value)

        try: return self.utc(value).astimezone(self.zone(name))
        except OverflowError as error: raise self._beyond_(value) from error

    def parse ( self, text: object, formats: tuple[str, ...] = FORMATS ) -> DateTime:

        if isinstance(text, DateTime): return self.utc(text)
        if isinstance(text, (int, float)) and not isinstance(text, bool): return self.of(text)

        raw = str(text).strip()

        if not raw or len(raw) > LIMIT: raise self._refuse_(text)

        if not raw.isascii(): raw = string.digits(raw)
        if raw.isascii() and raw.isdigit(): return self._digits_(raw)

        try: return self.utc(DateTime.fromisoformat(raw))
        except ValueError: pass

        found = self._phrase_(raw, formats)

        if found is None: raise self._refuse_(text)

        return found

    def day ( self, text: object ) -> Day:

        if isinstance(text, DateTime): return self.local(text).date()
        if isinstance(text, Day): return text

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

        return format_datetime(self.utc(value or self.now()), usegmt=True)

    def format (
        self, value: DateTime | None = None, pattern: str | None = None, zone: str | None = None, locale: str = "en",
    ) -> str:

        local  = self.local(value or self.now(), zone)
        filled = self._pattern if pattern is None else pattern

        if locale == "ar":

            month  = MONTH_NAMES[local.month - 1]
            day    = DAY_NAMES[local.weekday()]
            names  = { "%B": month, "%b": month, "%A": day, "%a": day, "%p": "م" if local.hour >= NOON else "ص" }
            filled = DIRECTIVE.sub(lambda found: names.get(found.group(0), found.group(0)), filled)

        try: return local.strftime(filled)
        except ValueError as error: raise Fault(Code.INTERNAL, reason="date.format") from error

    def at ( self, value: DateTime, moment: str, zone: str | None = None ) -> DateTime:

        if len(moment) > LIMIT: raise self._refuse_(moment)

        parts = [part.strip(" ") for part in moment.split(":")]
        clock = len(parts) <= CLOCKED and all(part.isascii() and part.isdigit() for part in parts)

        if not clock: raise self._refuse_(moment)

        hour, minute, second = (int(parts[index]) if len(parts) > index else 0 for index in range(CLOCKED))

        try: local = self.local(value, zone).replace(hour=hour, minute=minute, second=second, microsecond=0)
        except (OverflowError, ValueError) as error: raise self._refuse_(moment) from error

        return self._instant_(local)

    def after ( self, seconds: float, since: DateTime | None = None ) -> DateTime:

        moment = self.utc(since) if since is not None else self.now()

        try: return moment + TimeDelta(seconds=seconds)
        except (OverflowError, ValueError) as error: raise self._beyond_(seconds) from error

    def before ( self, seconds: float, since: DateTime | None = None ) -> DateTime:

        moment = self.utc(since) if since is not None else self.now()

        try: return moment - TimeDelta(seconds=seconds)
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
        sign = 1 if last >= first else -1

        if sign < 0: first, last = last, first

        months = (last.year - first.year) * MONTHS + last.month - first.month

        if (last.day, last.time()) < (first.day, first.time()): months -= 1

        if unit == "months": return float(sign * months)
        if unit == "years": return float(sign * (months // MONTHS))

        raise Fault(Code.INTERNAL, reason="date.unit", errors={ "unit": [unit] })

    def expired ( self, at: DateTime | None ) -> bool:

        return at is not None and self.utc(at) <= self.now()

    def start_of (
        self, unit: str, value: DateTime | None = None, zone: str | None = None, week_start: int = 0,
    ) -> DateTime:

        return self._instant_(self._floor_(unit, value, zone, week_start))

    def end_of (
        self, unit: str, value: DateTime | None = None, zone: str | None = None, week_start: int = 0,
    ) -> DateTime:

        floor = self._floor_(unit, value, zone, week_start)

        try: return self._end_(unit, floor)
        except Fault: return END

    def period (
        self, unit: str, value: DateTime | None = None, zone: str | None = None, week_start: int = 0,
    ) -> Span:

        floor = self._floor_(unit, value, zone, week_start)

        try: return Span(self._instant_(floor), self._end_(unit, floor) + MICRO)
        except OverflowError as error: raise self._beyond_(floor) from error

    def start_of_day ( self, value: DateTime | None = None, zone: str | None = None ) -> DateTime:

        return self.start_of("day", value, zone)

    def start_of_month ( self, value: DateTime | None = None, zone: str | None = None ) -> DateTime:

        return self.start_of("month", value, zone)

    def floor ( self, value: DateTime, seconds: float ) -> DateTime:

        if not 0 < seconds < ENDLESS: raise Fault(Code.INTERNAL, reason="date.floor")

        try:

            step = TimeDelta(seconds=seconds)

            if not step: raise Fault(Code.INTERNAL, reason="date.floor")

            moment = self.utc(value)

            return moment - (moment - EPOCH) % step

        except (OverflowError, ValueError) as error: raise self._beyond_(value) from error

    def same ( self, left: DateTime, right: DateTime, unit: str = "day", zone: str | None = None ) -> bool:

        return self.start_of(unit, left, zone) == self.start_of(unit, right, zone)

    def is_today ( self, value: DateTime, zone: str | None = None ) -> bool:

        return self.same(value, self.now(), "day", zone)

    def is_past ( self, value: DateTime ) -> bool:

        return self.utc(value) < self.now()

    def is_future ( self, value: DateTime ) -> bool:

        return self.utc(value) > self.now()

    def is_weekend ( self, value: DateTime, weekend: tuple[int, ...] = WEEKEND, zone: str | None = None ) -> bool:

        return self.local(value, zone).weekday() in weekend

    def is_leap ( self, value: DateTime | int ) -> bool:

        return calendar.isleap(value if isinstance(value, int) else value.year)

    def age ( self, birth: DateTime | Day, at: DateTime | None = None ) -> int:

        born = birth.date() if isinstance(birth, DateTime) else birth
        when = at.date() if at is not None else self.today()

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

        if delta <= ZERO: raise Fault(Code.INTERNAL, reason="date.step")

        return self._walk_(self.utc(start), self.utc(end), delta)

    def business_days (
        self, start: DateTime, end: DateTime, weekend: tuple[int, ...] = WEEKEND, holidays: Iterable[Day] = (),
    ) -> int:

        first = self.local(start).date()
        last  = self.local(end).date()

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

        closed  = sorted({day.toordinal() for day in holidays if day.weekday() not in weekend})
        current = self.local(value)
        step    = TimeDelta(days=1 if count >= 0 else -1)
        left    = abs(count)
        worked  = WEEK - len(WEEKEND) if weekend == WEEKEND else sum(day not in weekend for day in range(WEEK))

        if not worked: raise Fault(Code.INTERNAL, reason="date.weekend")

        try:

            while left:

                origin = current.toordinal()

                if left > WEEK:

                    weeks = (left - 1) // worked
                    current += step * (weeks * WEEK)
                    left -= weeks * worked

                while left:

                    current += step

                    if current.weekday() not in weekend: left -= 1

                target = current.toordinal()
                left = (
                    bisect_right(closed, target) - bisect_right(closed, origin) if count >= 0
                    else bisect_left(closed, origin) - bisect_left(closed, target)
                ) if closed else 0

        except OverflowError as error: raise self._beyond_(count) from error

        return self.utc(current)

    def span ( self, start: DateTime, end: DateTime ) -> Span:

        return Span(start, end)

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

        try:

            whole = int(seconds)
            total = abs(whole)
            parts: list[str] = []

            for unit, size in DURATION:

                count, total = divmod(total, size)

                if count: parts.append(f"{count}{unit}")

            return ("-" if whole < 0 else "") + " ".join(parts) if parts else "0s"

        except (OverflowError, ValueError) as error: raise self._beyond_(seconds) from error

    def _seconds_ ( self, step: str ) -> float:

        shift = self._relative_(string.digits(step).strip().lower()) if len(step) <= LIMIT else None

        if shift is None or any(unit not in SECONDS for unit in shift):

            raise Fault(Code.INTERNAL, reason="date.step", errors={ "step": [step[:LIMIT]] })

        return sum(count * SECONDS[unit] for unit, count in shift.items())

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

        if len(raw) in COMPACT:

            size = COMPACT[0]
            body = raw if len(raw) == size else f"{raw[:size]}T{raw[size:]}"

            try: return DateTime.fromisoformat(body).replace(tzinfo=UTC)
            except ValueError: pass

        return self.of(int(raw))

    def _phrase_ ( self, raw: str, formats: tuple[str, ...] ) -> DateTime | None:

        words, at = self._clock_(raw.lower())
        found     = self._keyword_(words)
        shift     = self._relative_(words) if found is None else None

        if shift is not None: found = self.add(self.local(self.now()), **shift)
        if found is None: found = self._formatted_(raw, formats)
        if found is None: return None

        if at:

            wall = self.local(found).replace(hour=at[0], minute=at[1], second=0, microsecond=0)

            return self._instant_(wall)

        return self.utc(found)

    def _keyword_ ( self, text: str ) -> DateTime | None:

        if text not in DAYS: return None

        now    = self.now()
        offset = DAYS[text]

        if offset is None: return now

        day = self.local(now).replace(hour=0, minute=0, second=0, microsecond=0)

        return self._instant_(self.add(day, days=offset) if offset else day)

    def _relative_ ( self, text: str ) -> dict[str, int] | None:

        sign: int | None = None
        count: int | None = None
        values: dict[str, int] = {}

        for token in GLUED.sub(" ", text).split():

            bare = token.startswith("ال") and token not in WORDS_UNITS and token not in NEXT and token not in LAST
            word = token[2:] if bare else token

            if token in FORWARD or token in BACKWARD:

                direction = 1 if token in FORWARD else -1

                if sign is not None and sign != direction: return None

                sign = direction

            elif (token.isascii() and token.isdigit()) or token in ONES:

                if count is not None: return None

                count = ONES[token] if token in ONES else int(token)

            elif word in WORDS_UNITS:

                unit, default = WORDS_UNITS[word]

                if unit in values: return None

                values[unit], count = default if count is None else count, None

            elif token not in FILLER: return None

        if not values or count is not None: return None

        return {unit: -value for unit, value in values.items()} if sign == -1 else values

    def _floor_ ( self, unit: str, value: DateTime | None, zone: str | None, week_start: int ) -> DateTime:

        moment = value or self.now()
        local  = self.local(moment, zone)

        if unit == "minute": return local.replace(second=0, microsecond=0, fold=0)
        if unit == "hour": return local.replace(minute=0, second=0, microsecond=0, fold=0)

        day = local.replace(hour=0, minute=0, second=0, microsecond=0, fold=0)

        try:

            if unit == "day": found = day
            elif unit == "week": found = day - TimeDelta(days=(day.weekday() - week_start) % WEEK)
            elif unit == "month": found = day.replace(day=1)
            elif unit == "quarter": found = day.replace(day=1, month=(day.month - 1) // QUARTER * QUARTER + 1)
            elif unit == "year": found = day.replace(day=1, month=1)
            else: raise Fault(Code.INTERNAL, reason="date.unit", errors={ "unit": [unit[:LIMIT]] })

        except OverflowError as error: raise self._beyond_(local) from error

        return found

    def _end_ ( self, unit: str, floor: DateTime ) -> DateTime:

        return self._instant_(self.add(floor, **STEPS[unit]) - MICRO, last=True)

    def _instant_ ( self, wall: DateTime, last: bool = False ) -> DateTime:

        if wall.tzinfo is UTC: return wall

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

        if meridian and not 1 <= hour <= NOON: raise self._refuse_(text)

        if meridian in ("pm", "م") and hour < NOON: hour += NOON
        if meridian in ("am", "ص") and hour == NOON: hour = 0
        if hour >= HOURS or minute >= MINUTES: return text, None

        return text[:found.start()].strip(), (hour, minute)

    def _formatted_ ( self, text: str, formats: tuple[str, ...] = FORMATS ) -> DateTime | None:

        for pattern in formats:

            try:

                parsed = DateTime.strptime(text, pattern)

                return self.utc(parsed)

            except ValueError: continue

        try: return self.utc(parsedate_to_datetime(text))
        except (TypeError, ValueError, IndexError): return None
