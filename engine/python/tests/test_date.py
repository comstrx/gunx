from collections.abc import Callable
from datetime import date as Day

from engine.date import UTC, DateTime, Span, TimeDelta, date
from engine.error import Fault
from engine.string import string
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
