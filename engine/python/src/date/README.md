# Date

UTC instants, calendar operations, zones, durations, working days and half-open spans.
Date owns time semantics; string normalizes digits and error owns typed failures.
Operations are synchronous, with no network or background scheduling.

## DSL

~~~python
from engine.date import Date, DateTime, Span, TimeDelta, UTC, date

moment = date.parse("2026-01-05T12:30:45Z")
shifted = date.parse("in 2 days 3 hours")
display = date.local(moment, "Africa/Cairo")
delivery = date.add_business_days(moment, 10, holidays=[])
elapsed = date.span(moment, delivery).hours()
window = date.period("day", moment, "Africa/Cairo")
batches = window.split(TimeDelta(hours=6))
bucket = date.floor(moment, 0.1)
~~~

## Settings

~~~python
from engine.date import date

clock = date.options(zone="Africa/Cairo", pattern="%d/%m/%Y %H:%M")
label = clock.format()
window = clock.period("day")
offset = clock.offset()
other = clock.options(zone="Asia/Tokyo")
~~~

- The default zone is UTC, a fixed zero offset without daylight-saving changes. The default display pattern
  is %Y-%m-%d %H:%M. Geographic zones use IANA names and their actual historical/DST rules.
- options returns an independent Date. Unspecified settings and the current frozen instant are copied;
  later freeze calls affect only their own instance. It never reconfigures the shared date facade.
- Zone validity and formatting are checked while creating the scope. Patterns use Python strftime directives;
  supported platform-specific directives remain platform-specific. Empty patterns are valid.
- format uses the scope's clock when value is omitted. Explicit pattern/zone arguments override the scope
  for that call. offset can use the configured zone without an argument.
- The scope's zone controls local, format, day(datetime), today, calendar boundaries/comparisons, at,
  relative/calendar phrases, and working-day calculations. Working-day addition preserves local time across DST
  and returns UTC. age without an explicit at uses the configured today; explicit calendar-field getters
  and an explicit age at retain the supplied value's calendar fields.
- now, parse results, iso, http, Span, elapsed arithmetic and floor retain UTC instant semantics.
  A naive explicit timestamp still means UTC; the display zone never silently relabels stored timestamps.
  add/sub retain the explicitly supplied datetime zone. Relative phrases apply their calendar additions
  in the configured zone. A display pattern does not become an implicit input grammar: parse(formats=...) is separate.

## Time

- Naive datetime inputs mean UTC, including a tzinfo whose utcoffset is None. utc returns the same object when already UTC;
  local explicitly returns a zoned datetime. parse and Span normalize to UTC.
- after/before take elapsed seconds and return UTC, including across DST transitions.
  add/sub retain the input zone and apply calendar fields, clamping month ends.
  Calendar days across DST are not necessarily 24 elapsed hours.
- diff seconds through weeks measures elapsed time. months/years counts complete
  calendar units after UTC conversion, truncates toward zero and reverses sign when
  endpoints reverse. It is not the inverse of month-end-clamping add.
- start_of/end_of use local calendar labels and return UTC boundaries.
  Repeated local labels include both occurrences. Missing labels resolve to the
  transition boundary. at uses the earliest occurrence of a repeated local time.
- period uses those same calendar boundaries as a Span with an exclusive end, suitable for >= start / < end.
  A repeated subday label covers its first through last occurrence; partial-hour clock changes can make
  adjacent label periods overlap. Use fixed Span.split steps when disjoint elapsed windows are required.
  A period whose exclusive end exceeds datetime's representable range raises date.range.
- floor uses elapsed steps anchored at the Unix epoch, with exact integer microsecond arithmetic.
  Seconds are rounded to microsecond precision by timedelta; nonpositive, nonfinite or rounded-zero steps
  are refused. A result before datetime.min raises date.range. It is not a local calendar boundary operation.
- Unix numbers in of/parse use the existing seconds/milliseconds magnitude heuristic.
  Use from_millis for an explicit millisecond value, especially before 2001.
  Numeric compact dates are tried before timestamps; use of for numeric timestamps
  that could also look like compact calendar dates.
- iso emits UTC milliseconds; to_millis floors exactly, including before the epoch.
  http emits English GMT dates independently of process locale.
- now/stamp/millis follow the instance's frozen clock. monotonic remains a real
  monotonic clock. Shared date.freeze is process-wide; use a separate Date instance
  for an isolated test clock and restore a shared freeze in finally.

## Parsing

- parse accepts ISO, numeric timestamps, selected legacy formats, HTTP dates and
  English/Arabic relative phrases. Use explicit formats for ambiguous legacy dates.
  Existing default slash dates prefer day/month before month/day.
- Compound relative phrases preserve every distinct unit: 2d3h, in 2 days 3 hours,
  2 days and 3 hours ago. A direction applies to the entire phrase.
  Conflicting directions, repeated units and unfinished quantities raise date.parse.
- day accepts calendar dates unchanged and converts datetime inputs to the configured zone before selecting the date.
- Custom %z formats preserve their offset before UTC conversion. Twelve-hour clocks
  require hours 1 through 12. Oversized input is refused before digit normalization.
- strptime with dynamic patterns is followed by the package's utc normalization.
  Ruff DTZ007 cannot follow that helper; its date.py-only exception preserves this
  explicit policy. Offset, naive and boundary regressions verify it.
- Calendar keywords at the representable date limits raise date.range instead of leaking OverflowError.
- at rejects oversized clock text before splitting it. Numeric rendering failures use the same typed range fault.
- Relative text is a bounded convenience grammar, not a general natural-language parser.
  Humanized months/years are approximate display units, not accounting durations.

## Spans and calendars

- Span normalizes both endpoints, is immutable and slotted, and uses [start, end).
  Empty spans contain nothing and overlap nothing. Reversed instants raise date.span.
  contains follows the same UTC policy as construction.
- Span.split lazily partitions a span into consecutive elapsed intervals, clips the last interval and
  yields nothing for an empty span. A nonpositive timedelta is refused when iteration begins.
  It does not split by local calendar days; a DST day may have 23 or 25 elapsed hours.
- range is lazy and excludes end. Fixed compound steps such as 1h30m are supported;
  calendar months/years are refused because their elapsed length varies.
- business_days counts working dates after start through end; reversing endpoints
  negates the result. add_business_days excludes the starting date in either direction.
  Weekends use weekday numbers 0 through 6; holidays are dates, deduplicated.
- Working-day addition jumps whole weeks and adjusts only for crossed working-date
  holidays. Irrelevant, duplicate and weekend holidays do not add delays.
  Results preserve the configured local time of day and return UTC. An all-weekend calendar is refused.

## Portability and proof

- zoneinfo uses the host IANA database, then the declared tzdata fallback. The dependency
  also supplies zones on Windows and minimal installations without a system database.
  Installed timezone data must match the deployment's policy and be maintained.
- Tests cover exact results, refusal paths, DST folds/gaps, custom offsets, empty spans
  and holiday boundaries. Properties compare working days with a daily reference,
  spans with interval algebra and custom offsets with independently constructed instants.
- Benchmarks cover parsing, clock access, boundaries, spans and short/large calendars.
  CPU time and Python allocation peaks are distinct from application throughput and RSS.
