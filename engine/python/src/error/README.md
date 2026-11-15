# Error

`Code` classifies outcomes. `Fault` carries one failure. `Bag` collects field errors.
Runtime dependencies: Python standard library only. No I/O, logging or retry execution.

```python
from engine.error import Bag, Code, Fault

failure = Fault(Code.UNAVAILABLE, reason="dependency.down", retry_after=2, unknown=True)
```

## Code

- `Code.of(status)` maps known integer HTTP statuses to their exact code, then falls back by class.
- Invalid status values become `Code.INTERNAL`, including booleans, non-integers and values outside 100..599.
- The outcome vocabulary treats 1xx/2xx/3xx as non-errors; `Code.OK` does not mean an HTTP response was exactly 200.
- `Code.parse(text, default=None)` accepts names case-insensitively with spaces or hyphens; unknown names return the fallback.
- HTTP status translation belongs here. Public rendering, logging and retry execution stay with their owners.

## Fault

- Construction accepts typed internal values and copies mutable errors/headers.
- Construction, copy and load enforce the same retry-delay rule: None or a finite, nonnegative number,
  excluding booleans. Accepted numbers normalize to float; invalid values raise error.payload.
- `retryable()` classifies a transient failure. `safe(idempotent=False)` also checks
  whether the operation may already have succeeded. Neither method retries anything.
- `copy()` preserves unspecified values. Explicit `None` clears optional values;
  `message=None` and `status=None` select the code defaults. Empty errors/headers clear them.
- Changing `code` selects its default status unless `status` is supplied, and updates
  an automatic message while preserving a custom message.
- `copy()` preserves the exception cause, context and independent diagnostic notes;
  it does not copy the fault's own traceback. Standard copy and trusted process transfer
  preserve operational fields and notes. Causes/tracebacks are not portable payload fields.

```python
clean = failure.copy(reason=None, errors=None, retry_after=None, headers=None)
changed = failure.copy(Code.TIMEOUT, unknown=True)
```

## Transfer

`dump()` returns an independent snapshot with `code`, `message`, `reason`, `errors`,
`status`, `retry_after`, `unknown` and `headers`. It is an internal transfer format,
not a sanitized client response. The HTTP layer owns public error rendering.

`load(payload)` accepts decoded mappings, validates recognized fields and ignores
unknown fields. Invalid shapes raise `Fault(Code.VALIDATION, reason="error.payload")`.
Errors require string keys and lists of strings; headers require string keys/values.
Status must be a known integer HTTP status.
Unknown textual codes become `Code.INTERNAL`. Missing `unknown` means `True`:
a legacy payload cannot establish that an operation had no side effects.
Input byte/count budgets belong to the decoder or transport before this method.

## Bag

- Empty message lists do not create errors; an explicitly added empty message still counts.
- `len(bag)` counts fields; `count()` counts messages; `has()` checks whether errors exist.
- `dump()`, iteration and produced faults are independent snapshots.
- `fault()` creates a failure; `raise_if_any()` raises only when messages exist.

## Compatibility

Compared with the previous implementation: malformed fields are rejected instead of
coerced; transfer preserves retry metadata/custom status; explicit `None` in `copy`
clears optional values; empty bag fields are ignored. Invalid status classification now returns
`Code.INTERNAL` instead of success or an incidental Python exception. Public export names are unchanged.
