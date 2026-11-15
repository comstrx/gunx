from collections.abc import Callable
from itertools import pairwise
from datetime import date as Day, tzinfo

from engine.date import UTC, Date, DateTime, Span, TimeDelta, date
from engine.error import Fault
from engine.string import string
from typing import Self, SupportsIndex, override
from zoneinfo import ZoneInfo
import sys, zoneinfo
import pytest

FROZEN = DateTime(2026, 1, 2, 3, 4, 5, 678000, tzinfo=UTC)
EDGE   = DateTime(9999, 12, 20, tzinfo=UTC)
FIRST  = DateTime(1, 1, 1, tzinfo=UTC)
WALLS: tuple[tuple[str, str, str, str, str], ...] = (
    ("Africa/Cairo", "2024-04-26T10:00:00", "day", "2024-04-25T22:00:00", "2024-04-26T20:59:59.999999"),
    ("Africa/Cairo", "2024-04-25T12:00:00", "day", "2024-04-24T22:00:00", "2024-04-25T21:59:59.999999"),
    ("Africa/Cairo", "2024-10-31T21:30:00", "day", "2024-10-30T21:00:00", "2024-10-31T21:59:59.999999"),
    ("Africa/Cairo", "2024-10-31T21:30:00", "hour", "2024-10-31T20:00:00", "2024-10-31T21:59:59.999999"),
    ("Africa/Cairo", "2024-04-26T10:00:00", "week", "2024-04-21T22:00:00", "2024-04-28T20:59:59.999999"),
    ("Africa/Cairo", "2024-04-26T10:00:00", "month", "2024-03-31T22:00:00", "2024-04-30T20:59:59.999999"),
    ("Pacific/Chatham", "2024-09-28T14:05:00", "hour", "2024-09-28T14:00:00", "2024-09-28T14:14:59.999999"),
    ("Pacific/Chatham", "2024-09-28T13:50:00", "hour", "2024-09-28T13:15:00", "2024-09-28T13:59:59.999999"),
    ("Pacific/Chatham", "2024-04-06T14:05:00", "hour", "2024-04-06T12:15:00", "2024-04-06T14:14:59.999999"),
    ("Pacific/Apia", "2011-12-30T11:00:00", "day", "2011-12-30T10:00:00", "2011-12-31T09:59:59.999999"),
    ("Pacific/Apia", "2011-12-30T09:00:00", "day", "2011-12-29T10:00:00", "2011-12-30T09:59:59.999999"),
    ("Australia/Lord_Howe", "2024-10-05T15:45:00", "hour", "2024-10-05T15:30:00", "2024-10-05T15:59:59.999999"),
    ("America/New_York", "2024-03-10T07:30:00", "hour", "2024-03-10T07:00:00", "2024-03-10T07:59:59.999999"),
    ("America/New_York", "2024-11-03T06:30:00", "hour", "2024-11-03T05:00:00", "2024-11-03T06:59:59.999999"),
    ("America/Havana", "2024-11-03T05:30:00", "day", "2024-11-03T04:00:00", "2024-11-04T04:59:59.999999"),
    ("America/Havana", "2024-11-02T12:00:00", "day", "2024-11-02T04:00:00", "2024-11-03T03:59:59.999999"),
)
HOSTILE: tuple[tuple[str, Callable[[], object]], ...] = (
    ("date.parse", lambda: date.parse("¹")),
    ("date.parse", lambda: date.parse("in ¹ days")),
    ("date.parse", lambda: date.parse(10 ** 400)),
    ("date.parse", lambda: date.parse(10 ** 5000)),
    ("date.parse", lambda: date.parse(float("nan"))),
    ("date.parse", lambda: date.parse(float("inf"))),
    ("date.parse", lambda: date.parse("today at 99")),
    ("date.parse", lambda: date.parse("today at 10:75")),
    ("date.parse", lambda: date.of(10 ** 400)),
    ("date.parse", lambda: date.from_millis(10 ** 15)),
    ("date.parse", lambda: date.from_millis(float("nan"))),
    ("date.parse", lambda: date.at(FROZEN, "0\x1f")),
    ("date.parse", lambda: date.at(FROZEN, "¹:00")),
    ("date.parse", lambda: date.at(FROZEN, "1:2:3:4")),
    ("date.parse", lambda: date.at(FROZEN, "24:00")),
    ("date.range", lambda: date.parse("0001-01-01T00:00:00+05:00")),
    ("date.range", lambda: date.parse("9999-12-31T23:59:59-05:00")),
    ("date.range", lambda: date.parse("in 99999999999 days")),
    ("date.range", lambda: date.parse("99999 years ago")),
    ("date.range", lambda: date.after(float("inf"))),
    ("date.range", lambda: date.after(float("nan"))),
    ("date.range", lambda: date.before(1e300)),
    ("date.range", lambda: date.add(years=10 ** 6)),
    ("date.range", lambda: date.add(days=10 ** 12)),
    ("date.range", lambda: date.sub(years=3000)),
    ("date.range", lambda: date.duration(float("nan"))),
    ("date.range", lambda: date.duration(float("inf"))),
    ("date.range", lambda: date.local(EDGE.replace(day=31, hour=23), "Pacific/Chatham")),
    ("date.range", lambda: date.start_of("day", FIRST, "Pacific/Chatham")),
    ("date.range", lambda: date.start_of("week", FIRST, week_start=6)),
    ("date.range", lambda: date.add_business_days(EDGE, 30)),
    ("date.weekend", lambda: date.add_business_days(FROZEN, 1, weekend=tuple(range(7)))),
    ("date.floor", lambda: date.floor(FROZEN, float("inf"))),
    ("date.floor", lambda: date.floor(FROZEN, float("nan"))),
    ("date.step", lambda: date.range(FROZEN, FROZEN, "¹d")),
    ("date.step", lambda: date.range(FROZEN, FROZEN, "0d")),
    ("date.step", lambda: date.range(FROZEN, FROZEN, "9" * 60 + "d")),
    ("date.step", lambda: date.range(FROZEN, FROZEN, "9" * 5000 + "d")),
    ("date.zone", lambda: date.zone("../../../etc/passwd")),
    ("date.zone", lambda: date.zone("a\x00b")),
    ("date.zone", lambda: date.zone("a" * 5000)),
    ("date.zone", lambda: date.format(FROZEN, zone="No/Zone")),
)

def test_now_can_freeze_and_everything_is_utc () -> None:

    date.freeze(FROZEN)

    try:

        assert date.now() == FROZEN and date.today() == Day(2026, 1, 2) and date.stamp() == FROZEN.timestamp()
        assert date.millis() == int(FROZEN.timestamp() * 1000) and date.to_millis(FROZEN) == date.millis()
        assert date.iso() == "2026-01-02T03:04:05.678Z" and date.http() == "Fri, 02 Jan 2026 03:04:05 GMT"
        assert date.after(60) == FROZEN + TimeDelta(seconds=60) and date.before(60) == FROZEN - TimeDelta(seconds=60)
        assert date.expired(FROZEN) and not date.expired(date.after(1)) and not date.expired(None)
        assert date.start_of_day(zone="Africa/Cairo").isoformat() == "2026-01-01T22:00:00+00:00"
        assert date.start_of_month().isoformat() == "2026-01-01T00:00:00+00:00"
        assert date.humanize(date.before(90)) == "1 minute ago" and date.humanize(date.after(7200)) == "in 2 hours"
        assert date.humanize(date.before(3)) == "just now" and date.humanize(date.before(2 * 86400), locale="ar") == "منذ يومين"
        assert date.humanize(date.before(5 * 86400), locale="ar") == "منذ 5 أيام" and date.humanize(date.before(3), short=True) == "now"
        assert date.humanize(date.before(90), short=True) == "1m" and date.humanize(date.after(7200), short=True) == "+2h"
        assert date.is_past(date.before(1)) and date.is_future(date.after(1)) and date.is_today(FROZEN) and not date.is_today(date.after(86400))

    finally: date.freeze(None)

    assert date.now().tzinfo is UTC and date.monotonic() > 0

def test_parses_and_converts () -> None:

    parsed = date.parse("2026-01-02T03:04:05Z")

    assert parsed == DateTime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    assert date.parse("2026-01-02T05:04:05+02:00") == parsed
    assert date.parse(DateTime(2026, 1, 2, 3, 4, 5)) == parsed
    assert date.parse(parsed.timestamp()) == parsed and date.parse(parsed.timestamp() * 1000) == parsed
    assert date.parse(str(int(parsed.timestamp()))) == parsed and date.from_millis(date.to_millis(parsed)) == parsed
    assert date.parse("02/01/2026 03:04") == parsed.replace(second=0) and date.parse("2026/01/02") == parsed.replace(hour=0, minute=0, second=0)
    assert date.parse("20260102") == date.parse("02.01.2026") == date.parse("2 Jan 2026") == date.parse("January 02, 2026")
    assert date.parse("Fri, 02 Jan 2026 03:04:05 GMT") == parsed and date.parse(string.eastern("2026-01-02")) == parsed.replace(hour=0, minute=0, second=0)
    assert date.day("2026-01-02") == Day(2026, 1, 2) and date.day(Day(2026, 1, 2)) == Day(2026, 1, 2)
    assert date.local(parsed, "Africa/Cairo").hour == 5 and date.offset("Africa/Cairo", parsed) == 7200 and "Africa/Cairo" in date.zones()
    assert date.between(parsed, parsed + TimeDelta(hours=1)) == 3600.0
    assert date.duration(90061) == "1d 1h 1m 1s" and date.duration(0) == "0s"
    assert date.format(parsed, "%d %B %Y %A", "Africa/Cairo", "ar") == "02 يناير 2026 الجمعة" and date.format(parsed, "%H:%M") == "03:04"
    assert date.format(parsed, "%I %p", locale="ar") == "03 ص" and date.format(parsed.replace(hour=15), "%I %p", locale="ar") == "03 م"
    assert date.at(parsed, "13:30", "Africa/Cairo") == DateTime(2026, 1, 2, 11, 30, tzinfo=UTC) and date.at(parsed, "7").hour == 7

    for bad in ("", "x", "2026-13-01", "2026-01-02T" + "9" * 70, "in 3 lightyears", "next", "3 at"):

        with pytest.raises(Fault) as caught: date.parse(bad)

        assert caught.value.reason == "date.parse"

    with pytest.raises(Fault): date.day("nope")
    with pytest.raises(Fault): date.zone("Mars/Olympus")
    with pytest.raises(Fault): date.of(1e20)
    with pytest.raises(Fault): date.at(parsed, "25:00")
    with pytest.raises(Fault): date.at(parsed, "x")

def test_wall_clock_units_follow_zone_shifts () -> None:

    tick = TimeDelta(microseconds=1)

    for zone, moment, unit, start, end in WALLS:

        opened, closed = date.start_of(unit, date.parse(moment), zone), date.end_of(unit, date.parse(moment), zone)

        assert (opened, closed) == (date.parse(start), date.parse(end)), (zone, moment, unit)
        assert date.start_of(unit, opened, zone) == opened and date.end_of(unit, closed, zone) == closed
        assert date.same(opened, closed, unit, zone) and not date.same(opened, opened - tick, unit, zone)
        assert not date.same(closed, closed + tick, unit, zone)

    spring = DateTime(2024, 4, 26, 10, tzinfo=UTC)

    assert date.at(spring, "00:30", "Africa/Cairo") == DateTime(2024, 4, 25, 22, tzinfo=UTC)
    assert date.at(spring, "01:30", "Africa/Cairo") == DateTime(2024, 4, 25, 22, 30, tzinfo=UTC)
    assert date.at(DateTime(2024, 10, 31, 10, tzinfo=UTC), "23:30", "Africa/Cairo") == DateTime(2024, 10, 31, 20, 30, tzinfo=UTC)

def test_relative_phrases_in_two_languages () -> None:

    date.freeze(FROZEN)

    try:

        midnight = FROZEN.replace(hour=0, minute=0, second=0, microsecond=0)

        assert date.parse("now") == FROZEN and date.parse("today") == midnight and date.parse("tomorrow") == midnight + TimeDelta(days=1)
        assert date.parse("yesterday") == midnight - TimeDelta(days=1) and date.parse("بكرة") == midnight + TimeDelta(days=1)
        assert date.parse("امبارح") == date.parse("أمس") == midnight - TimeDelta(days=1) and date.parse("الآن") == FROZEN
        assert date.parse("in 3 days") == FROZEN + TimeDelta(days=3) and date.parse("3 days ago") == FROZEN - TimeDelta(days=3)
        assert date.parse("2 hours from now") == FROZEN + TimeDelta(hours=2) and date.parse("an hour ago") == FROZEN - TimeDelta(hours=1)
        assert date.parse("next week") == FROZEN + TimeDelta(weeks=1) and date.parse("last month") == date.sub(FROZEN, months=1)
        assert date.parse("next year") == FROZEN.replace(year=2027) and date.parse("in 90 minutes") == FROZEN + TimeDelta(minutes=90)
        assert date.parse("بعد 3 أيام") == FROZEN + TimeDelta(days=3) and date.parse("منذ ساعتين") == FROZEN - TimeDelta(hours=2)
        assert date.parse("قبل يومين") == FROZEN - TimeDelta(days=2) and date.parse("الأسبوع القادم") == FROZEN + TimeDelta(weeks=1)
        assert date.parse("الشهر الماضي") == date.sub(FROZEN, months=1) and date.parse("بعد شهرين") == date.add(FROZEN, months=2)
        assert date.parse("من 5 دقائق") == FROZEN - TimeDelta(minutes=5) and date.parse("السنة الجاية") == FROZEN.replace(year=2027)
        assert date.parse("tomorrow at 10:30") == midnight + TimeDelta(days=1, hours=10, minutes=30)
        assert date.parse("today at 5 pm") == midnight + TimeDelta(hours=17) and date.parse("بكرة الساعة 9 ص") == midnight + TimeDelta(days=1, hours=9)
        assert date.parse("in 2 days at 12 am") == (FROZEN + TimeDelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)

    finally: date.freeze(None)

def test_calendar_arithmetic () -> None:

    base = DateTime(2026, 1, 31, 10, 0, tzinfo=UTC)

    assert date.add(base, months=1) == DateTime(2026, 2, 28, 10, 0, tzinfo=UTC) and date.add(base, years=1, days=1) == DateTime(2027, 2, 1, 10, 0, tzinfo=UTC)
    assert date.sub(base, months=13) == DateTime(2024, 12, 31, 10, 0, tzinfo=UTC) and date.add(base, weeks=1, hours=2, minutes=3, seconds=4).minute == 3
    assert date.add(DateTime(2024, 2, 29, tzinfo=UTC), years=1) == DateTime(2025, 2, 28, tzinfo=UTC)
    assert date.diff(base, base + TimeDelta(days=2), "days") == 2.0 and date.diff(base, base + TimeDelta(hours=3), "minutes") == 180.0
    assert date.diff(base, DateTime(2026, 3, 30, tzinfo=UTC), "months") == 1.0 and date.diff(base, DateTime(2026, 3, 31, 10, 0, tzinfo=UTC), "months") == 2.0
    assert date.diff(base, DateTime(2028, 1, 31, 10, 0, tzinfo=UTC), "years") == 2.0 and date.diff(base, base, "weeks") == 0.0

    with pytest.raises(Fault): date.diff(base, base, "decades")

    wednesday = DateTime(2026, 1, 7, 15, 30, 45, 123, tzinfo=UTC)

    assert date.start_of("minute", wednesday) == wednesday.replace(second=0, microsecond=0)
    assert date.start_of("hour", wednesday) == wednesday.replace(minute=0, second=0, microsecond=0)
    assert date.start_of("week", wednesday) == DateTime(2026, 1, 5, tzinfo=UTC) and date.start_of("week", wednesday, week_start=6) == DateTime(2026, 1, 4, tzinfo=UTC)
    assert date.start_of("quarter", DateTime(2026, 5, 9, tzinfo=UTC)) == DateTime(2026, 4, 1, tzinfo=UTC) and date.start_of("year", wednesday) == DateTime(2026, 1, 1, tzinfo=UTC)
    assert date.end_of("day", wednesday) == DateTime(2026, 1, 7, 23, 59, 59, 999999, tzinfo=UTC)
    assert date.end_of("month", wednesday) == DateTime(2026, 1, 31, 23, 59, 59, 999999, tzinfo=UTC)
    assert date.end_of("quarter", wednesday) == DateTime(2026, 3, 31, 23, 59, 59, 999999, tzinfo=UTC) and date.end_of("week", wednesday).day == 11
    assert date.end_of("year", wednesday).month == 12 and date.end_of("hour", wednesday).minute == 59 and date.end_of("minute", wednesday).second == 59
    assert date.start_of("day", wednesday, "Africa/Cairo") == DateTime(2026, 1, 6, 22, tzinfo=UTC)

    with pytest.raises(Fault): date.start_of("decade", wednesday)

    assert date.floor(wednesday, 900) == DateTime(2026, 1, 7, 15, 30, tzinfo=UTC) and date.floor(wednesday, 3600).minute == 0
    assert date.same(wednesday, wednesday + TimeDelta(hours=5), "day") and not date.same(wednesday, wednesday + TimeDelta(days=1))
    assert date.same(wednesday, wednesday + TimeDelta(days=20), "month") and date.is_weekend(DateTime(2026, 1, 10, tzinfo=UTC))
    assert not date.is_weekend(DateTime(2026, 1, 9, tzinfo=UTC)) and date.is_weekend(DateTime(2026, 1, 9, tzinfo=UTC), weekend=(4, 5))
    assert date.is_leap(2024) and not date.is_leap(wednesday) and date.quarter(wednesday) == 1 and date.week(wednesday) == 2
    assert date.weekday(wednesday) == 2 and date.day_of_year(wednesday) == 7 and date.days_in_month(DateTime(2026, 2, 1, tzinfo=UTC)) == 28
    assert date.age(Day(2002, 9, 28), DateTime(2026, 9, 27, tzinfo=UTC)) == 23 and date.age(DateTime(2002, 9, 28, tzinfo=UTC), DateTime(2026, 9, 28, tzinfo=UTC)) == 24
    assert list(date.range(wednesday, wednesday + TimeDelta(days=3))) == [wednesday + TimeDelta(days=n) for n in range(3)]
    assert len(list(date.range(wednesday, wednesday + TimeDelta(hours=1), "15m"))) == 4 and list(date.range(wednesday, wednesday)) == []
    assert len(list(date.range(wednesday, wednesday + TimeDelta(days=1), TimeDelta(hours=6)))) == 4

    with pytest.raises(Fault): list(date.range(wednesday, wednesday, "0d"))
    with pytest.raises(Fault): list(date.range(wednesday, wednesday, "1 month"))
    with pytest.raises(Fault): date.floor(wednesday, 0)

    monday = DateTime(2026, 1, 5, tzinfo=UTC)

    assert date.business_days(monday, monday + TimeDelta(days=7)) == 5 and date.business_days(monday + TimeDelta(days=7), monday) == -5
    assert date.business_days(monday, monday + TimeDelta(days=7), weekend=(4, 5)) == 5 and date.business_days(monday, monday) == 0
    assert date.business_days(monday, monday + TimeDelta(days=7), holidays=[Day(2026, 1, 7)]) == 4
    assert date.add_business_days(monday, 5) == DateTime(2026, 1, 12, tzinfo=UTC) and date.add_business_days(monday, -1) == DateTime(2026, 1, 2, tzinfo=UTC)
    assert date.add_business_days(monday, 1, holidays=[Day(2026, 1, 6)]) == DateTime(2026, 1, 7, tzinfo=UTC) and date.add_business_days(monday, 0) == monday

    span = date.span(monday, monday + TimeDelta(days=2))

    assert span == Span(monday, monday + TimeDelta(days=2)) and span.days() == 2 and span.hours() == 48 and span.minutes() == 2880
    assert span.seconds() == 172800 and span.contains(monday) and not span.contains(span.end)
    assert span.overlaps(Span(monday + TimeDelta(days=1), monday + TimeDelta(days=5))) and not span.overlaps(Span(span.end, span.end + TimeDelta(1)))
    assert span.intersect(Span(monday + TimeDelta(days=1), monday + TimeDelta(days=5))) == Span(monday + TimeDelta(days=1), span.end)
    assert span.intersect(Span(span.end, span.end + TimeDelta(1))) is None and span.dump()["start"] == monday.isoformat()

    with pytest.raises(Fault): Span(span.end, span.start)

def test_hostile_dates_are_refused () -> None:

    for reason, call in HOSTILE:

        with pytest.raises(Fault) as caught: call()

        assert caught.value.reason == reason

    second = DateTime(1970, 1, 1, 0, 0, 1, 1000, tzinfo=UTC)

    assert date.to_millis(second) == 1001 and date.from_millis(1001) == second and date.from_millis(-1) == second - TimeDelta(seconds=1, milliseconds=2)
    assert date.to_millis(FROZEN) == int(FROZEN.timestamp()) * 1000 + 678 and date.to_millis(FIRST) == -62135596800000
    assert date.parse("Mon, 20 Nov 1995 19:12:08 -0000") == DateTime(1995, 11, 20, 19, 12, 8, tzinfo=UTC)
    assert date.parse("1701010151230") == date.from_millis(1701010151230) and date.parse("76819999") == date.of(76819999)
    assert date.parse("20260102030405") == FROZEN.replace(microsecond=0) and date.parse("20269902030405").year == 2612
    assert date.duration(-5) == "-5s" and date.duration(-90061) == "-1d 1h 1m 1s" and date.duration(-0.5) == "0s"
    assert date.end_of("year", EDGE) == DateTime.max.replace(tzinfo=UTC) and date.start_of("year", FIRST) == FIRST
    assert date.format(FROZEN, "%%B %B %%p %p", locale="ar") == "%B يناير %p ص" and date.format(FROZEN, "%%B") == "%B"
    assert list(date.range(EDGE.replace(day=30), DateTime.max.replace(tzinfo=UTC))) == [EDGE.replace(day=30), EDGE.replace(day=31)]

    friday = DateTime(2026, 1, 9, tzinfo=UTC)

    assert date.business_days(friday, friday + TimeDelta(days=1)) == 0 == date.business_days(friday + TimeDelta(days=1), friday)
    assert date.business_days(FIRST, EDGE) == -date.business_days(EDGE, FIRST) == 2608605
    assert date.business_days(friday, friday + TimeDelta(days=10), holidays=[Day(2026, 1, 12), Day(2026, 1, 17), Day(2027, 1, 1)]) == 5

    date.freeze(second)

    try: assert date.millis() == 1001
    finally: date.freeze(None)

def test_business_day_jumps_preserve_weekend_start_direction_and_holidays () -> None:

    start = DateTime(2024, 2, 24, 12, tzinfo=UTC)

    for mask in range(127):

        weekend = tuple(day for day in range(7) if mask & (1 << day))

        for count in (-80, -9, -7, -1, 0, 1, 7, 9, 80):

            expected = start
            left = abs(count)
            step = TimeDelta(days=1 if count >= 0 else -1)

            while left:

                expected += step

                if expected.weekday() not in weekend: left -= 1

            assert date.add_business_days(start, count, weekend) == expected

    holidays = [Day(2024, 2, 26), Day(2024, 2, 27)]

    assert date.add_business_days(start, 10, holidays=holidays) == DateTime(2024, 3, 12, 12, tzinfo=UTC)

@pytest.mark.parametrize("text", ["02/01/2026 05:04 +0200", "02/01/2026 00:04 -0300"])
def test_custom_formats_convert_offsets_without_relabeling ( text: str ) -> None:

    assert date.parse(text, ("%d/%m/%Y %H:%M %z",)) == DateTime(2026, 1, 2, 3, 4, tzinfo=UTC)

@pytest.mark.parametrize(("text", "delta"), [
    ("in 2 days 3 hours", TimeDelta(days=2, hours=3)),
    ("2d3h", TimeDelta(days=2, hours=3)),
    ("2 days and 3 hours ago", -TimeDelta(days=2, hours=3)),
    ("بعد يومين و ٣ ساعات", TimeDelta(days=2, hours=3)),
    ("1h30m", TimeDelta(hours=1, minutes=30)),
    ("0 days 2 hours", TimeDelta(hours=2)),
])
def test_relative_phrases_preserve_every_quantity ( text: str, delta: TimeDelta ) -> None:

    clock = Date()
    clock.freeze(FROZEN)

    assert clock.parse(text) == FROZEN + delta

    if text in ("2d3h", "1h30m"):

        assert list(clock.range(FROZEN, FROZEN + delta * 2, text)) == [FROZEN, FROZEN + delta]

@pytest.mark.parametrize("text", [
    "in 2 days ago", "2 3 days", "2 days 3", "2 days 3 days", "today at 13 pm", "today at 0 am",
    "today at 00 pm", chr(0x661) * 10000, "1h-30m",
])
def test_ambiguous_phrases_are_refused_instead_of_partially_parsed ( text: str ) -> None:

    with pytest.raises(Fault) as caught: date.parse(text)

    assert caught.value.reason == "date.parse"

def test_direct_spans_normalize_instants_and_empty_spans_never_overlap () -> None:

    zone = ZoneInfo("America/New_York")
    first = DateTime(2024, 11, 3, 1, 30, tzinfo=zone, fold=0)
    last = first.replace(fold=1)
    span = Span(first, last)
    empty = Span(first, first)

    assert span.seconds() == 3600
    assert span.start.tzinfo is UTC and span.end.tzinfo is UTC
    assert span.contains(first) and not span.contains(last)
    assert not span.overlaps(empty) and not empty.overlaps(span)
    assert span.intersect(empty) is None
    assert Span(FROZEN.replace(tzinfo=None), FROZEN).seconds() == 0

    middle = span.start + TimeDelta(minutes=30)

    assert not Span(middle, middle).overlaps(span)
    assert not span.overlaps(Span(middle, middle))
    assert span.contains(middle.replace(tzinfo=None))

    with pytest.raises(Fault) as caught: Span(last, first)

    assert caught.value.reason == "date.span"

def test_elapsed_seconds_cross_dst_by_instant () -> None:

    zone = ZoneInfo("America/New_York")
    spring = DateTime(2024, 3, 10, 1, 30, tzinfo=zone)
    fall = DateTime(2024, 11, 3, 1, 30, tzinfo=zone, fold=0)

    for moment in (spring, fall):

        shifted = date.after(3600, moment)

        assert shifted.tzinfo is UTC and date.between(moment, shifted) == 3600
        assert date.before(3600, shifted) == date.utc(moment)

    assert date.after(0, FROZEN.replace(tzinfo=None)) == FROZEN

@pytest.mark.parametrize("unit", ["months", "years"])
def test_calendar_difference_is_signed_complete_units ( unit: str ) -> None:

    pairs = (
        (DateTime(2026, 1, 31, tzinfo=UTC), DateTime(2026, 3, 30, tzinfo=UTC)),
        (DateTime(2024, 2, 29, tzinfo=UTC), DateTime(2025, 2, 28, tzinfo=UTC)),
        (FROZEN, FROZEN + TimeDelta(days=1)),
    )

    for first, last in pairs:

        assert date.diff(first, last, unit) == -date.diff(last, first, unit)

    assert date.diff(pairs[0][0], pairs[0][1], "months") == 1

def test_business_day_holidays_count_once_in_both_directions () -> None:

    start = DateTime(2026, 1, 10, 12, tzinfo=UTC)
    holidays = [Day(2026, 1, 12), Day(2026, 1, 12), Day(2026, 1, 9), Day(2026, 1, 11)]

    assert date.add_business_days(start, 1, holidays=iter(holidays)).day == 13
    assert date.add_business_days(start, -1, holidays=iter(holidays)).day == 8

    dense = {start.date() + TimeDelta(days=n) for n in range(1, 366)}
    result = date.add_business_days(start, 1, holidays=dense)

    assert result == DateTime(2027, 1, 11, 12, tzinfo=UTC)
    assert date.business_days(start, result, holidays=dense) == 1
    assert date.add_business_days(start, 0, holidays=dense) == start

@pytest.mark.parametrize(("moment", "expected"), [
    (FROZEN, "Fri, 02 Jan 2026 03:04:05 GMT"),
    (DateTime(2026, 7, 1, 9, tzinfo=ZoneInfo("Africa/Cairo")), "Wed, 01 Jul 2026 06:00:00 GMT"),
])
def test_http_date_converts_to_gmt ( moment: DateTime, expected: str ) -> None:

    assert date.http(moment) == expected

def test_independent_clocks_do_not_change_the_shared_clock () -> None:

    first, second = Date(), Date()
    first.freeze(FROZEN)
    second.freeze(FROZEN + TimeDelta(days=1))

    assert first.now() == FROZEN and second.now() == FROZEN + TimeDelta(days=1)

    first.freeze(None)

    assert second.now() == FROZEN + TimeDelta(days=1)

def test_zones_work_without_the_system_database () -> None:

    previous = zoneinfo.TZPATH

    try:

        zoneinfo.reset_tzpath(())
        ZoneInfo.clear_cache()

        assert not zoneinfo.TZPATH
        assert date.local(DateTime(2026, 1, 2, tzinfo=UTC), "Africa/Cairo").hour == 2
        assert "America/New_York" in date.zones()

    finally:

        zoneinfo.reset_tzpath(previous)
        ZoneInfo.clear_cache()

@pytest.mark.parametrize(("zone", "moment", "unit", "opened", "closed"), WALLS)
def test_period_is_a_half_open_calendar_interval (
    zone: str, moment: str, unit: str, opened: str, closed: str,
) -> None:

    value = date.parse(moment)
    period = date.period(unit, value, zone)

    assert period.start == date.parse(opened)
    assert period.end == date.parse(closed) + TimeDelta(microseconds=1)
    assert period.contains(value) and not period.contains(period.end)

def test_period_boundaries_and_fixed_splits () -> None:

    span = date.period("day", DateTime(2024, 3, 10, 12, tzinfo=UTC), "America/New_York")
    parts = list(span.split(TimeDelta(hours=6)))

    assert span.hours() == 23
    assert [part.hours() for part in parts] == [6, 6, 6, 5]
    assert parts[0].start == span.start and parts[-1].end == span.end
    assert all(left.end == right.start for left, right in pairwise(parts))
    assert all(not left.overlaps(right) for left, right in pairwise(parts))
    assert list(Span(FROZEN, FROZEN).split(TimeDelta(seconds=1))) == []

    with pytest.raises(Fault): list(span.split(TimeDelta(0)))
    with pytest.raises(Fault): list(span.split(TimeDelta(seconds=-1)))
    with pytest.raises(Fault): date.period("year", EDGE)

@pytest.mark.parametrize(("moment", "step", "expected"), [
    ("1970-01-01T00:00:01", 0.1, "1970-01-01T00:00:01"),
    ("1969-12-31T23:59:59.999999", 0.1, "1969-12-31T23:59:59.900000"),
    ("2026-01-02T03:04:05.678901", 0.001, "2026-01-02T03:04:05.678000"),
    ("2026-01-02T03:04:05.678901", 0.000001, "2026-01-02T03:04:05.678901"),
])
def test_floor_uses_exact_microsecond_buckets ( moment: str, step: float, expected: str ) -> None:

    assert date.floor(date.parse(moment), step) == date.parse(expected)

def test_unrepresentable_floor_steps_fail_without_underflow () -> None:

    with pytest.raises(Fault) as caught: date.floor(FROZEN, 0.0000001)

    assert caught.value.reason == "date.floor"

    with pytest.raises(Fault): date.floor(FIRST, 604801)

@pytest.mark.parametrize(("raw", "expected"), [
    ("00010101", "0001-01-01"), ("99991231235959", "9999-12-31T23:59:59"),
    ("20240229030405", "2024-02-29T03:04:05"),
])
def test_compact_dates_preserve_calendar_fields ( raw: str, expected: str ) -> None:

    assert date.parse(raw) == date.parse(expected)

def test_day_accepts_datetime_using_the_shared_utc_policy () -> None:

    assert date.day(FROZEN) == FROZEN.date()
    assert date.day(DateTime(2026, 1, 2, 1, tzinfo=ZoneInfo("Africa/Cairo"))) == Day(2026, 1, 1)

@pytest.mark.parametrize(("moment", "phrase"), [
    (DateTime.max.replace(tzinfo=UTC), "tomorrow"),
    (DateTime.min.replace(tzinfo=UTC), "yesterday"),
    (DateTime.max.replace(tzinfo=UTC), "بكرة at 10:30"),
    (DateTime.min.replace(tzinfo=UTC), "أمس"),
])
def test_keywords_refuse_calendar_overflow ( moment: DateTime, phrase: str ) -> None:

    clock = Date()
    clock.freeze(moment)

    with pytest.raises(Fault) as caught: clock.parse(phrase)

    assert caught.value.reason == "date.range"
    assert clock.now() == moment

def test_clock_text_is_bounded_before_splitting () -> None:

    class LongClock(str):

        __slots__ = ()

        @override
        def split ( self, sep: str | None = None, maxsplit: SupportsIndex = -1 ) -> list[str]:

            raise AssertionError("oversized clock must be refused before splitting")

    with pytest.raises(Fault) as caught: date.at(FROZEN, LongClock("10:" * 10000))

    assert caught.value.reason == "date.parse"
    assert caught.value.errors is not None and len(caught.value.errors["value"][0]) <= 64

def test_options_are_isolated_inherited_and_utc_by_default () -> None:

    root = Date()
    root.freeze(DateTime(2026, 1, 2, 1, tzinfo=UTC))
    east = root.options(zone="Asia/Tokyo", pattern="%d/%m/%Y %H:%M")
    west = root.options(zone="America/New_York", pattern="%Y-%m-%d %H:%M %z")
    child = east.options(pattern="%H:%M")
    moment = root.now()

    assert root.format(moment) == root.format() == "2026-01-02 01:00"
    assert east.format(moment) == "02/01/2026 10:00"
    assert west.format(moment) == west.format() == "2026-01-01 20:00 -0500"
    assert west.offset(at=moment) == -18000 and root.offset(at=moment) == 0
    assert child.format(moment) == "10:00"
    assert child.options(zone="UTC").format(moment) == "01:00"
    assert east.format(moment, "%H", "UTC") == "01"
    assert east.options(pattern="").format(moment) == ""
    assert root.today() == Day(2026, 1, 2) and west.today() == Day(2026, 1, 1)
    assert west.day(moment) == west.today() and root.day(moment) == root.today()
    assert east.local(moment).hour == 10 and east.local(moment, "UTC") is moment
    assert root.now() is east.now() is west.now() is child.now()
    assert root.iso(moment) == east.iso(moment) == west.iso(moment)
    assert root.http(moment) == east.http(moment) == west.http(moment)
    assert east.parse("2026-01-02T01:00:00") == moment

    child.freeze(FROZEN)

    assert root.now() == moment and east.now() == moment and child.now() == FROZEN

def test_configured_calendar_boundaries_and_relative_dates () -> None:

    clock = Date().options(zone="America/New_York", pattern="%d %B %Y %H:%M")
    now = DateTime(2026, 3, 8, 5, 30, tzinfo=UTC)
    clock.freeze(now)

    assert clock.parse("now") == now
    assert clock.parse("today") == DateTime(2026, 3, 8, 5, tzinfo=UTC)
    assert clock.parse("tomorrow") == DateTime(2026, 3, 9, 4, tzinfo=UTC)
    assert clock.parse("tomorrow at 10:30") == DateTime(2026, 3, 9, 14, 30, tzinfo=UTC)
    assert clock.parse("in 1 day") == DateTime(2026, 3, 9, 4, 30, tzinfo=UTC)
    assert clock.period("day", now).hours() == 23
    assert clock.start_of("day", now) == date.start_of("day", now, "America/New_York")
    assert clock.end_of("day", now) == date.end_of("day", now, "America/New_York")
    assert clock.period("day", now, "UTC").hours() == 24
    assert clock.at(now, "02:30") == DateTime(2026, 3, 8, 7, tzinfo=UTC)
    assert clock.is_today(now) and clock.same(now, DateTime(2026, 3, 9, 3, tzinfo=UTC))
    assert not clock.same(now, DateTime(2026, 3, 9, 4, tzinfo=UTC))
    assert clock.format(now, locale="ar") == "08 مارس 2026 00:30"

def test_configured_business_days_keep_local_time_across_dst () -> None:

    clock = Date().options(zone="America/New_York")
    friday = DateTime(2026, 3, 6, 17, tzinfo=UTC)
    monday = DateTime(2026, 3, 9, 16, tzinfo=UTC)

    assert clock.add_business_days(friday, 1) == monday
    assert clock.add_business_days(monday, -1) == friday
    assert clock.business_days(friday, monday) == 1
    assert clock.add_business_days(friday, 1, holidays=[Day(2026, 3, 9)]) == monday + TimeDelta(days=1)
    assert date.add_business_days(friday, 1) == monday + TimeDelta(hours=1)

def test_bad_options_leave_existing_clock_unchanged () -> None:

    clock = Date()
    clock.freeze(FROZEN)

    for zone in ("", "../UTC", "Not/AZone", "x" * 100):

        with pytest.raises(Fault) as caught: clock.options(zone=zone)

        assert caught.value.reason == "date.zone"
        assert clock.format(FROZEN) == "2026-01-02 03:04"

    assert clock.options().format(FROZEN) == clock.format(FROZEN)

def test_naive_timezone_objects_ignore_the_host_zone () -> None:

    class Unzoned(tzinfo):

        __slots__ = ()

        @override
        def utcoffset ( self, dt: DateTime | None ) -> None:

            return None

        @override
        def dst ( self, dt: DateTime | None ) -> None:

            return None

        @override
        def tzname ( self, dt: DateTime | None ) -> None:

            return None

    class NaiveDateTime(DateTime):

        __slots__ = ()

        @override
        def astimezone ( self, tz: tzinfo | None = None ) -> Self:

            if self.utcoffset() is None: raise AssertionError("naive time must not acquire the host zone")

            return super().astimezone(tz)

    value = NaiveDateTime(2026, 1, 2, 3, 4, tzinfo=Unzoned())
    expected = DateTime(2026, 1, 2, 3, 4, tzinfo=UTC)

    assert value.utcoffset() is None
    assert date.utc(value) == expected
    assert date.parse(value) == expected
    assert Span(value, value + TimeDelta(hours=1)).start == expected
    assert date.options(zone="Asia/Tokyo").format(value, "%H:%M") == "12:04"

def test_duration_translates_integer_format_limits () -> None:

    digits = sys.get_int_max_str_digits()

    if not digits: pytest.skip("The interpreter integer-format limit is disabled")

    with pytest.raises(Fault) as caught: date.duration(10 ** (digits + 20))

    assert caught.value.reason == "date.range"

def test_clock_methods_remain_replaceable_per_instance ( monkeypatch: pytest.MonkeyPatch ) -> None:

    first, second = Date(), Date()
    second.freeze(FROZEN)
    monkeypatch.setattr(first, "stamp", lambda: 1000.0)

    assert first.stamp() == 1000.0
    assert second.stamp() == FROZEN.timestamp()

