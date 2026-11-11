from engine.date import date, DateTime, TimeDelta, UTC
from engine.error import Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress
from zoneinfo import ZoneInfo
import calendar

EXAMPLES = 1500
WORDS    = (
    "in", "ago", "next", "last", "after", "before", "from", "now", "today", "tomorrow", "at", "pm", "am", "a", "an",
    "day", "days", "week", "month", "years", "hour", "mins", "s", "0", "1", "7", "12", "99", "10:30", "25:61", "¹", "٣",
    "99999999999", "بعد", "منذ", "قبل", "يومين", "أيام", "الأسبوع", "القادم", "الماضي", "الساعة", "ص", "م", "بكرة",
)
PHRASES  = st.lists(st.sampled_from(WORDS), max_size=6).map(" ".join)
TEXTS    = st.one_of(st.text(max_size=40), PHRASES, st.text("0123456789-:/.TZ+ ", max_size=30))
NUMBERS  = st.one_of(st.integers(), st.floats(), st.integers(min_value=-10 ** 13, max_value=10 ** 13))
MOMENTS  = st.datetimes(DateTime.fromisoformat("1974-01-01"), DateTime.fromisoformat("2200-01-01"), timezones=st.just(UTC))
EXTREMES = st.datetimes(timezones=st.timezones())
ZONES    = st.sampled_from(["UTC", "Africa/Cairo", "Asia/Riyadh", "America/New_York", "Pacific/Chatham", "Nowhere/Zone"])
UNITS    = st.sampled_from(["second", "minute", "hour", "day", "week", "month", "quarter", "year", "eon"])
ZERO     = TimeDelta(0)
TICK     = TimeDelta(microseconds=1)
SHIFTY   = (
    "Africa/Cairo", "Pacific/Chatham", "Pacific/Apia", "Australia/Lord_Howe", "America/Havana", "America/New_York",
    "Europe/Dublin", "Asia/Kathmandu", "Africa/Monrovia", "Asia/Tehran",
)

def shifts () -> list[tuple[str, DateTime]]:

    found: list[tuple[str, DateTime]] = []
    first = DateTime(1970, 1, 1, tzinfo=UTC)

    for name in SHIFTY:

        zone, last = ZoneInfo(name), None

        for step in range(26000):

            moment = first + TimeDelta(days=step)
            offset = moment.astimezone(zone).utcoffset()

            if last is not None and offset != last: found.append((name, moment))

            last = offset

    return found

def label ( moment: DateTime, zone: str, unit: str ) -> DateTime:

    wall = moment.astimezone(ZoneInfo(zone)).replace(tzinfo=None, second=0, microsecond=0)

    if unit == "minute": return wall
    if unit == "hour": return wall.replace(minute=0)

    return wall.replace(day=1, hour=0, minute=0) if unit == "month" else wall.replace(hour=0, minute=0)

SHIFTS = shifts()

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(TEXTS)
def text_is_read_or_refused ( text: str ) -> None:

    now = date.now()

    with suppress(Fault): assert date.parse(text).utcoffset() == ZERO
    with suppress(Fault): date.day(text)
    with suppress(Fault): date.zone(text)
    with suppress(Fault): assert date.at(now, text).utcoffset() == ZERO
    with suppress(Fault): date.range(now, now, text)
    with suppress(Fault): date.format(now, "%Y", text)

    assert isinstance(date.format(now, text.replace("\x00", ""), locale="ar"), str)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(NUMBERS, MOMENTS)
def numbers_are_placed_or_refused ( value: float, moment: DateTime ) -> None:

    with suppress(Fault): assert date.parse(value).utcoffset() == ZERO
    with suppress(Fault): date.of(value)
    with suppress(Fault): date.from_millis(value)
    with suppress(Fault): date.after(value, moment)
    with suppress(Fault): date.before(value, moment)
    with suppress(Fault): date.duration(value)
    with suppress(Fault): date.floor(moment, value)

    if not isinstance(value, int): return

    with suppress(Fault): date.add(moment, days=value)
    with suppress(Fault): date.add(moment, years=value, months=value)
    with suppress(Fault): date.sub(moment, weeks=value, hours=value)

@settings(max_examples=EXAMPLES // 3, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(EXTREMES, ZONES, UNITS, st.integers(min_value=-40, max_value=40))
def edges_never_crash ( moment: DateTime, zone: str, unit: str, count: int ) -> None:

    with suppress(Fault): assert date.utc(moment).utcoffset() == ZERO
    with suppress(Fault): date.local(moment, zone)
    with suppress(Fault): assert date.start_of(unit, moment, zone) <= date.end_of(unit, moment, zone)
    with suppress(Fault): date.format(moment, "%Y-%m-%d %A %B %p", zone, "ar")
    with suppress(Fault): date.iso(moment)
    with suppress(Fault): date.to_millis(moment)
    with suppress(Fault): date.humanize(moment, locale="ar")
    with suppress(Fault): date.add_business_days(moment, count)
    with suppress(Fault): date.add(moment, months=count, days=count)
    with suppress(Fault): date.at(moment, "23:59:59", zone)
    with suppress(Fault): date.floor(moment, 900)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(MOMENTS, ZONES, UNITS)
def moments_round_trip ( moment: DateTime, zone: str, unit: str ) -> None:

    cut    = moment.replace(microsecond=moment.microsecond // 1000 * 1000)
    millis = calendar.timegm(moment.utctimetuple()) * 1000 + moment.microsecond // 1000

    assert date.parse(date.iso(moment)) == cut
    assert date.to_millis(moment) == millis
    assert date.from_millis(millis) == cut
    assert date.parse(millis // 1000) == date.parse(str(millis // 1000)) == moment.replace(microsecond=0)
    assert millis < 10 ** 12 or date.parse(millis) == date.parse(str(millis)) == cut
    assert date.parse(date.http(moment)) == moment.replace(microsecond=0)

    with suppress(Fault):

        start = date.start_of(unit, moment, zone)
        end   = date.end_of(unit, moment, zone)

        assert start <= moment <= end
        assert date.start_of(unit, start, zone) == start
        assert date.end_of(unit, end, zone) == end

    with suppress(Fault): assert date.utc(date.local(moment, zone)) == moment

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(MOMENTS, MOMENTS, st.floats(min_value=-1e7, max_value=1e7, allow_nan=False), st.integers(min_value=0, max_value=60))
def spans_agree ( left: DateTime, right: DateTime, seconds: float, count: int ) -> None:

    assert date.between(left, right) == -date.between(right, left)
    assert date.before(seconds, date.after(seconds, left)) == left
    assert date.duration(seconds).startswith("-") == (seconds <= -1)
    assert isinstance(date.humanize(left, right), str)
    assert date.business_days(left, right) == -date.business_days(right, left)
    assert date.business_days(left, date.add_business_days(left, count)) == count
    assert date.sub(date.add(left, weeks=count, hours=count), weeks=count, hours=count) == left
    assert len(list(date.range(left, left + TimeDelta(hours=count), "1h"))) == count

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(MOMENTS, st.integers(min_value=0, max_value=400), st.lists(st.integers(min_value=0, max_value=400), max_size=6))
def business_days_match_a_walk ( start: DateTime, days: int, off: list[int] ) -> None:

    holidays = [(start + TimeDelta(days=step)).date() for step in off]
    walked   = 0

    for step in range(1, days + 1):

        day = (start + TimeDelta(days=step)).date()

        if day.weekday() not in (4, 5) and day not in holidays: walked += 1

    assert date.business_days(start, start + TimeDelta(days=days), (4, 5), holidays) == walked

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(
    st.sampled_from(SHIFTS), st.timedeltas(TimeDelta(hours=-50), TimeDelta(hours=2)),
    st.sampled_from(["minute", "hour", "day", "month"]),
)
def units_follow_the_wall_clock ( shift: tuple[str, DateTime], drift: TimeDelta, unit: str ) -> None:

    zone, moment = shift[0], shift[1] + drift
    start, end   = date.start_of(unit, moment, zone), date.end_of(unit, moment, zone)
    named        = label(moment, zone, unit)

    assert start <= moment <= end
    assert label(start, zone, unit) == label(end, zone, unit) == named
    assert label(start - TICK, zone, unit) != named
    assert label(end + TICK, zone, unit) != named
    assert date.start_of(unit, start, zone) == start
    assert date.end_of(unit, end, zone) == end
    assert date.at(moment, "00:00", zone) == date.start_of("day", moment, zone)

text_is_read_or_refused()
numbers_are_placed_or_refused()
edges_never_crash()
moments_round_trip()
spans_agree()
business_days_match_a_walk()
units_follow_the_wall_clock()

print(f"fuzz date  examples={EXAMPLES * 6 + EXAMPLES // 3}  ok")
