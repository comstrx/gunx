# Metric

In-process counters, gauges and histograms with Prometheus text exposition.
The package owns instruments, bounded label storage and formatting; applications own metric selection,
scraping access and aggregation across processes. Fault vocabulary belongs to `error` and diagnostics to `log`.

## Use

```python
from engine.metric import Metrics

metrics = Metrics("service", series=1000)
calls = metrics.counter("requests", "Completed requests")
active = metrics.gauge("active", "Work in flight")
elapsed = metrics.histogram("duration_seconds", buckets=(0.01, 0.1, 1, 10))

with active.track(route="/items"), elapsed.time(route="/items"):
    calls.inc(route="/items", status="200")

text = metrics.render()
```

Use bounded route templates and status classes as labels. Raw URLs, user identifiers and request IDs
usually create unbounded cardinality and should not be used as metric labels.
Keep instrument handles on hot paths rather than repeatedly looking them up in the registry.

## Public verbs

| Owner | Verbs |
| --- | --- |
| `Metrics` | `setup`, `counter`, `gauge`, `histogram`, `has`, `forget`, `names`, `render`, `clear`, `describe` |
| `Counter` | `inc`, `value` |
| `Gauge` | `set`, `add`, `value`, `track` |
| `Histogram` | `observe`, `count`, `sum`, `buckets`, `time` |
| `Meter`, inherited by instruments | `series`, `dropped`, `forget`, `clear`, `lines` |

The shared `metrics` instance is optional; create a `Metrics` registry when isolation is needed.
`MEDIA` identifies the supported Prometheus text format. No third-party runtime exporter is required.

## Registration and values

- Register and configure before serving traffic. Repeated registration returns the existing instrument;
  incompatible kinds or histogram buckets fail. Existing help text is retained.
- Counter names normalize the `_total` suffix. Registry claims prevent collisions with histogram
  `_bucket`, `_sum` and `_count` names. `setup` changes the exposition prefix, not the stored instruments.
- Counters accept non-negative increments; gauges support set and signed addition; histograms accept
  finite observations and strictly increasing finite bucket bounds. Boolean and arbitrary numeric objects
  are rejected rather than coerced.
- Values use ordinary floating-point arithmetic. Accumulation can overflow to infinity or lose precision;
  these are telemetry instruments, not exact financial totals. Non-finite input values are rejected.
- A histogram records one bucket per observation; exposition computes cumulative buckets plus `+Inf`,
  count and sum. Configure bucket boundaries in the same unit as observations.
- Reads return zero for missing series without creating them. Direct instrument `forget(**labels)`
  removes one series; `clear()` removes all its series and resets its drop diagnostic.
- Registry `forget(name)` and `clear()` remove registrations. Existing instrument references remain usable
  but are no longer exported by that registry.

## Lifetimes and concurrency

- Updates and instrument snapshots use the instrument's lock. `Gauge.set` shares that lock with `add`
  and `track`. These synchronous operations contain no await, scheduling or background delivery.
- `track` increments an admitted cell once and decrements that same cell in `finally`, including cancellation
  and exceptions. Rejected entry never decrements. A later clear/forget and replacement does not transfer
  an old context's decrement to the replacement.
- `track` is additive. Mixing explicit `set` with active contexts changes the base value; use a dedicated
  gauge for work in flight when that is the intended measurement.
- `time` measures elapsed monotonic seconds and observes on exit, including exceptions/cancellation.
  Its series is admitted when it records the observation; it does not reserve cardinality at entry.
- Clearing or forgetting a series can detach an update already holding its old cell. No promise of replay
  into a newly created series is made.
- A rendered instrument snapshot is detached and internally consistent. The registry gathers instruments
  separately: a scrape is not a single atomic snapshot across all instruments.
- Metadata and prefix configuration belong to startup. Concurrent configuration mutation is not a
  supported way to rename live instruments. Built-in instruments and registries use fixed attributes.
- Locks coordinate threads within one process. Worker processes own independent registries; aggregation
  across workers needs a separate application/deployment design.

## Bounds and exposition

- The per-instrument series default is 2000; supported configuration is 1 through 1,000,000.
  The label lookup cache has a separate cap equal to that series limit, including aliases with empty values.
  Reordered keyword aliases share the same canonical series; ordering is normalized on cache misses,
  not on every cached update. All aliases consume the same bounded lookup budget.
  The registry itself does not impose a cap on the number of distinct instrument names.
- At most 32 labels are accepted, checked before sorting/hashing their values. Names use the package's
  ASCII naming rules, at most 100 characters, without the reserved `__` prefix. Histogram label `le` is reserved.
- Label values must be strings. Empty values denote absence. Invalid UTF-8 or values over 256 characters
  drop the update; malformed names/types or excessive label count raise a fault.
- At capacity, updates for existing series still work. New series are dropped, counted by `dropped()` and
  diagnosed once until clear. A rejected `track` counts one failed entry, not a second failure at exit.
- Help text is limited to 512 characters. Histograms allow up to 64 explicit finite bucket boundaries.
- `lines(prefix)` validates a direct export prefix. Help/label escaping and `TYPE` declarations follow
  Prometheus text format 0.0.4; the base `Meter` declares `untyped`.
- `render` assembles one text block per instrument and returns the whole payload with a trailing newline
  when nonempty. It is not streaming or constant-memory; scrape cost grows with series and buckets.
- `names`, `describe` and `lines` return detached collection results. Avoid performing large scrapes on a
  latency-sensitive request path without budgeting their synchronous cost.
