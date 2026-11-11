from engine.date import date
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
