# Exception

Map raised exceptions to the shared fault vocabulary, select reporting policy, and dispatch synchronously.
Fault metadata belongs to `error`; rendering, redaction, correlation and sinks belong to `log`.

## Use

```python
from engine.error import Code
from engine.exception import Exceptions

errors = Exceptions()
errors.map(LookupError, Code.NOT_FOUND, reason="missing")
errors.context(lambda: {"region": "local"})
errors.report(lambda fault, original: observe(fault.code, type(original).__name__))
errors.throttle(5, 60)

fault = errors.handle(LookupError())
```

The application supplies `observe`. Callbacks must finish synchronously; use an application-owned bounded
queue for external delivery when needed. This package creates no tasks, workers or delivery retries.

## Public verbs

| Verb | Contract |
| --- | --- |
| `map(kind, code_or_factory, reason=None, unknown=False)` | Nearest exception class in the MRO wins; a factory returns a `Fault`. |
| `ignore(*kinds)` | Skip reporting for these classes and their subclasses; retain conversion and statistics. |
| `level(code, level)` | Override one fault code's report level. |
| `report(callback)` | Register a synchronous `(fault, original)` observer. |
| `context(provider)` | Register a synchronous mapping provider for log-only fields. |
| `throttle(burst, window)` | Bound dispatch attempts per key and fixed monotonic window; reset existing windows. |
| `fault(error)` | Convert without normal reporting; existing faults retain identity and metadata. |
| `handle(error)` | Convert, count, apply policy and dispatch; return the fault. |
| `safe(fallback, work)` | Execute synchronous work; handle ordinary exceptions and return the fallback. |
| `stats()` | Detached counters: `seen`, `reported`, `muted` and `codes`. |
| `clear()` | Restore defaults and clear registration, counters and throttle state. |
| `describe()` | Inspect configuration plus detached statistics. |

## Reporting and failure

- Default mappings cover timeout, connection and unimplemented errors. Other exceptions become internal
  faults. Original causes and existing fault metadata are retained.
- Client faults default to debug; retryable server faults to warning; other server faults to error.
  Error/critical server logs include the traceback. A registered reporter still runs when the log level is disabled.
- Disabled levels, ignored errors and throttled attempts do not mark an object reported. The same object can
  become eligible later. Log context and log dispatch are skipped when its log level is disabled;
  registered reporters still execute and retain duplicate suppression.
- Eligible dispatch marks both the original exception and returned fault. Reusing either suppresses normal
  reporting across handlers. `clear()` does not erase marks on objects already handed out.
- `reported` counts dispatch attempts, not confirmed external delivery. Ordinary reporter failures are diagnosed
  and remaining reporters continue; already attempted callbacks are not replayed automatically.
- Conversion still runs before duplicate detection; a faulty custom factory may produce its own diagnostic again.
- Coroutine, async-generator and generator callbacks, including callable instances and partial wrappers, are rejected
  at registration. Unexpected coroutine/generator results from synchronous wrappers are closed and diagnosed.
  Other awaitables and async-generator objects are diagnosed, not run; caller-owned tasks are not cancelled.
- Reentry through a callback cannot recursively invoke that handler's factory or dispatch another report. Nested
  `handle` calls still return a fault and update `seen`/`codes`. Separate handler instances remain independent.
- Callback guards are scoped to the synchronous call on its current thread, and released in `finally`. They do not
  leak into later asynchronous tasks or mute callbacks on another thread.
- `CancelledError`, `KeyboardInterrupt` and `SystemExit` raised by work or callbacks propagate. Explicit `fault(error)`
  conversion is a different operation and may convert such objects when deliberately requested.
- Configure a handler before serving traffic. Use one per worker/event loop; shared configuration mutations,
  exact cross-thread statistics and atomic cross-thread throttling are not provided.
- Reporting marks are best effort for exception classes that disallow attribute assignment.

## Bounds and ownership

- Context providers are sampled in registration order: at most 64 entries from each mapping, at most 64 final
  fields including four reserved report fields. Later sampled keys may replace earlier user fields, never report fields.
- Provider snapshots are shallow and bounded before copying. A failing mapping snapshot contributes no partial fields.
  Providers own their execution cost and nested values; field limits cannot bound arbitrary callback work.
- Throttle keys are `(code, reason, exception class name)`. At most 1024 keys are retained, with least-recently-used
  eviction of one key. Touching a key preserves its window; counters saturate at the configured burst.
- Evicted keys start a new window when seen again. This is bounded diagnostic suppression, not a security rate limiter.
  Use stable short reasons; the key-count cap does not cap bytes in caller-supplied reason strings.
- Zero burst or zero window disables suppression. Changing throttle policy clears retained keys.
- No message/traceback is included in throttle keys. No cache of original exceptions or tracebacks is kept by the handler.

## Evidence

Tests exercise deferred eligibility, repeat faults, MRO selection, callback failures/reentry/cancellation,
bounded mappings, LRU churn, independent threads, child tasks and transferred metadata.
Property checks model configuration, conversion, fields, quiet transitions, windows and eviction.
Benchmarks cover ordinary/error paths, oversized contexts, churn and reentry; compare paired runs on the same host.
