# Log

Structured events, redaction, request correlation, scoped capture and measured spans.

## Use

```python
from pathlib import Path
from engine.log import log

log.setup("info", "json", Path("var/app.log"))
worker = log.get("worker").bind(job="import")
worker.info("started", rows=12)

with worker.span("import", rows=0) as fields:
    fields["rows"] = 12

with log.capture() as events:
    log.info("checked", password="hidden")

log.close()
```

## Ownership

- `Log` owns one configuration and output. Instances do not change each other or the application's global structlog configuration.
- `Logger` owns bound fields and level calls. Reuse a bound logger in repeated work; its fields do not mutate its parent.
- `Render` owns correlation and safe representations. Request context belongs to `engine.context`; faults belong to `engine.error`.
- `Sink` serializes writes, flushes each event, and counts write failures. No queue, background worker or unbounded transport buffer is introduced.
- `arch.py` holds definitions and bounded classification-cache settings. No business or transport contract is required.

## Configuration and lifecycle

Configure at application startup, before obtaining long-lived bound loggers. Successful reconfiguration replaces the instance's current logger and closes its old owned file. Obtain new bound loggers afterward; previously bound loggers retain their original configuration. Concurrent live reconfiguration is not a supported operation.

Opening a replacement output must succeed before the current output is closed. An open failure raises `Fault` with reason `log.open` and retains its original cause; the old configuration remains usable.

`close()` is repeatable and closes only the owned file, never the caller's stderr. Writes to a failed or closed owned sink increase `describe()["dropped"]`. Opening a new sink starts its own counter.

The default renderer is human-readable console output. JSON uses compact single-line output, escaped Unicode and the existing Python JSON numeric semantics. Unknown level names continue to fall back to info. `get(name)` now preserves the supplied name in the `logger` field.

## Span and capture

A span yields a mutable field dictionary. Its final fields override initial user fields. The span owns its event name, level and measured `ms`; on failure it also owns `error`. A reporting exception never replaces the original exception or cancellation.

Capture is scoped to its calling context and this `Log` instance. Nested captures each receive matching events. Sibling tasks and independent threads cannot capture each other's events. Child tasks inherit an active parent capture; once that capture exits, later child events are ignored by it. Cancellation restores the previous capture.

Captures retain events until the caller releases their lists. Use short scopes for diagnostics and tests. Captured events are shallow copies of the already-redacted event; they are not proof that the output write succeeded.

## Redaction boundary

- Full field names are classified; long names are never truncated before classification. Only bounded-length names enter the bounded LRU.
- Password-like values are hidden fully. Existing long-token masking retains its two-character prefix/suffix. Redaction remains a safeguard, not permission to log credentials.
- Nested containers are copied and depth-bounded, including cycles. Caller-owned data is not rewritten.
- Opaque objects become scrubbed `repr` strings. They cannot reveal different data later through `__str__` or `__structlog__`. Failed representations become `***`; secret-valued objects are masked without inspecting them.
- `Render.clean` consequently returns a string for opaque objects, including paths, instead of preserving object identity.
- JSON rendering follows normalization/redaction. Disabling its redundant cycle tracking is safe for that processor sequence; use the configured logger rather than feeding arbitrary cyclic values directly to its renderer.

Free-text Bearer credentials are recognized across ASCII capitalization variants, including mixed case;
this follows the case-insensitive authentication-scheme contract. Other structured and free-text redaction
rules continue to apply. Redaction is not permission to log credentials intentionally.

## Verification and performance

`tests/test_log.py` covers isolated configuration, rollback, nested and concurrent capture, cancellation, reserved span fields, original-exception identity, failed output, long secret names, opaque objects and extreme JSON values.

`fuzz/fuzz_log.py` checks redaction invariants, differential classification, adversarial text, long field names, nested capture and span merging. `benches/bench_log.py` measures enabled/disabled logging, new/reused bindings, redaction, spans and capture.

The sink performs synchronous writes and flushes. A slow file, pipe or collector can block the caller. Performance measurements against the null device isolate processing costs and do not establish storage throughput or application RPS.

The native JSON encoder was evaluated but not substituted: its integer-range, surrogate and non-finite-number behavior differs from the established logging serializer. A faster successful path alone does not justify changing those contracts.

## References

- [structlog configuration and local wrapping](https://www.structlog.org/en/stable/api.html)
- [structlog performance](https://www.structlog.org/en/stable/performance.html)
- [Python context variables](https://docs.python.org/3/library/contextvars.html)
