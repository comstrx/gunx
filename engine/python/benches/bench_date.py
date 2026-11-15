from engine.date import Day, TimeDelta, date
from engine.test import Bench

bench = Bench()
fixed = date.parse("2026-11-10T12:30:45Z")
later = date.parse("2027-02-01T08:00:00Z")

def now () -> None: date.now()

def iso () -> None: date.iso(fixed)

def parse () -> None: date.parse("2026-11-10T12:30:45Z")

def local () -> None: date.local(fixed, "Africa/Cairo")

def format_ () -> None: date.format(fixed, "%Y-%m-%d %H:%M", "Africa/Cairo")

def relative () -> None: date.parse("in 3 days")

def of () -> None: date.of(1794313845.25)

def from_millis () -> None: date.from_millis(1794313845250)

def to_millis () -> None: date.to_millis(fixed)

def after () -> None: date.after(90.0, fixed)

def start () -> None: date.start_of("month", fixed, "Africa/Cairo")

def end () -> None: date.end_of("day", fixed, "Africa/Cairo")

def at () -> None: date.at(fixed, "09:30", "Africa/Cairo")

def days () -> None: list(date.range(fixed, later, "1w"))

def add () -> None: date.add(fixed, months=1, days=3)

def diff () -> None: date.diff(fixed, later, "days")

def humanize () -> None: date.humanize(fixed, later)

def business () -> None: date.business_days(fixed, later)

bench.measure("date.now", now)
bench.measure("date.iso", iso)
bench.measure("date.parse", parse)
bench.measure("date.parse.relative", relative)
bench.measure("date.of", of)
bench.measure("date.from_millis", from_millis)
bench.measure("date.to_millis", to_millis)
bench.measure("date.after", after)
bench.measure("date.local", local)
bench.measure("date.format", format_)
bench.measure("date.start_of", start)
bench.measure("date.end_of", end)
bench.measure("date.at", at)
bench.measure("date.range", days)
bench.measure("date.add", add)
bench.measure("date.diff", diff)
bench.measure("date.humanize", humanize)
bench.measure("date.business_days", business, rounds=2000)

bench.measure("date.add_business_days.short", lambda: date.add_business_days(fixed, 2))
bench.measure("date.add_business_days.long", lambda: date.add_business_days(fixed, 2500), rounds=5000)

holidays = [Day(2026, 11, 12), Day(2026, 12, 25)]

bench.measure("date.parse.compound", lambda: date.parse("in 2 days 3 hours"))
bench.measure("date.parse.custom", lambda: date.parse("10/11/2026 12:30"))
bench.measure("date.http", lambda: date.http(fixed))
bench.measure("date.span", lambda: date.span(fixed, later))
bench.measure("date.diff.months", lambda: date.diff(fixed, later, "months"))
bench.measure("date.add_business_days.holidays", lambda: date.add_business_days(fixed, 2500, holidays=holidays))
bench.measure("date.add_business_days.large", lambda: date.add_business_days(fixed, 200000, holidays=holidays), rounds=1000)

window = date.period("day", fixed)

bench.measure("date.parse.compact8", lambda: date.parse("20261110"))
bench.measure("date.parse.compact14", lambda: date.parse("20261110123045"))
bench.measure("date.format.utc", lambda: date.format(fixed))
bench.measure("date.start.utc", lambda: date.start_of("day", fixed))
bench.measure("date.end.utc", lambda: date.end_of("day", fixed))
bench.measure("date.floor.exact", lambda: date.floor(fixed, 0.1))
bench.measure("date.period.utc", lambda: date.period("day", fixed))
bench.measure("date.period.zone", lambda: date.period("day", fixed, "America/New_York"))
bench.measure("date.span.split", lambda: list(window.split(TimeDelta(hours=6))), rounds=5000)

clock = date.options(zone="America/New_York", pattern="%d/%m/%Y %H:%M")
clock.freeze(fixed)

bench.measure("date.options", lambda: date.options(zone="America/New_York", pattern="%d/%m/%Y %H:%M"), rounds=5000)
bench.measure("date.format.configured", clock.format)
bench.measure("date.period.configured", lambda: clock.period("day"))
bench.measure("date.start.minute", lambda: date.start_of("minute", fixed))
bench.measure("date.start.hour", lambda: date.start_of("hour", fixed))
bench.measure("date.parse.today", lambda: clock.parse("today"))
