# Adapter

One family, named providers, declared capabilities and an explicit resource lifetime.

## Interface

- `Adapter` declares `family`, `name` and a frozen set of `capabilities`. `can` inspects a capability; `ensure` refuses unsupported work; `need` validates required settings.
- `Manager[Provider]` registers and selects instances for one family. `use` returns its input; `get()` selects the default; `get(name)` selects an explicit provider.
- `Receipt` carries a provider identifier, normalized status and owned diagnostic snapshot. `accepted()` recognizes the existing accepted/sent/queued/delivered/ok statuses.

`error` owns faults and retry-safety policy, `rand` generates fallback identifiers, and `log` owns logging. This package adds no transport, scheduler, retry loop or external dependency.

## Resource ownership

Registering a provider transfers responsibility for calling its `close` to this manager. The provider closes only resources it owns; borrowed transports remain their owner's responsibility.

| Operation | Effect |
|---|---|
| `use(provider)` | Registers the provider; a different instance with the same name becomes pending disposal. |
| `forget(name)` | Removes selection and queues that instance for disposal. |
| `clear()` | Removes all selection and queues the registered instances. |
| `await drain()` | Closes only pending instances, retaining current providers. |
| `await close()` | Clears selection and drains all owned instances. |
| `pending()` | Number of distinct instances still awaiting successful closure. |
| `ready()` | Whether any provider is registered; it does not perform a network health probe. |

```python
from engine.adapter import Manager

providers = Manager("mail")
providers.use(first, default=True)
providers.use(replacement)
await providers.drain()

chosen = providers.get()
chosen.ensure("send")

await providers.close()
remaining = providers.pending()
```

The example assumes supplied providers belonging to the same family and a replacement using the first provider's name.

Retirement is synchronous bookkeeping, with storage allocated only when needed. It never schedules background work or closes a provider behind an active caller. Coordinate in-flight operations before `drain` or shutdown. Long-lived applications replacing providers must drain retired resources instead of accumulating them until shutdown.

Instances are deduplicated by identity. Re-registering a retired instance makes it active again and removes it from pending disposal.

During drain/close, another drain/close or registry mutation raises a `<family>.closing` conflict. The manager is intended for one event loop; it is not a cross-thread synchronization primitive. Keep provider declarations stable while registered.

## Failure and cancellation

- Successful closures leave ownership and are not repeated.
- Ordinary closure failures are logged; draining continues, returns the successful count and retains failures. Check `pending()` to distinguish completion from a pass where everything failed.
- Cancellation propagates immediately. The interrupted instance and unvisited instances remain pending for a later explicit drain/close.
- Provider `close` implementations must tolerate retry after partial cleanup. The manager cannot undo a provider's side effects.
- Closed instances are no longer selectable. A new explicit registration can start another lifecycle.

## Provider faults

`upstream(awaitable)` preserves successful results and cancellation.

A provider client fault is translated into a server fault without changing its retry eligibility: transient faults become `UNAVAILABLE`, permanent rejections become `INTERNAL`. `retry_after`, `unknown` and the causal exception are retained. The provider reason remains diagnostic; the provider's message and arbitrary response headers are not forwarded.

A `json.decode` failure means a malformed reply with an unknown operation outcome. Local JSON encoding failures are not relabeled as malformed replies. Other non-client faults pass through unchanged.

This layer preserves metadata supplied by the transport. Parsing HTTP headers and classifying remote statuses belong to that transport; adapter does not infer missing retry delays.

## Receipts

The wire helper rejects non-dictionary bodies, empty normalized statuses, embedded control characters, oversized/nonprintable identifiers and whitespace-only identifiers. It keeps the existing missing-ID fallback and status vocabulary.

Construction detaches `raw` through the standard deep-copy protocol, including nested built-in containers and cycles. Diagnostic values must support that protocol. The owned snapshot remains mutable; the dataclass does not claim recursive immutability. Raw payloads are excluded from its representation.

The extra copy has a measured cost. It prevents later mutation of the source response from rewriting an already returned receipt.

Retirement snapshots hold provider references without allocating a key/value pair for each entry.
Failed or cancelled disposal remains pending; successful disposal removes only that exact provider identity.

## Verification

`tests/test_adapter.py` covers declarations, selection, retry metadata, snapshots, retirement, repeated shutdown, real task cancellation, conflicting closes and release of retired references. Provider-consumer tests cover the updated shutdown contract.

`fuzz/fuzz_adapter.py` checks a separate registry/ownership model, malformed declarations and receipts, failure/cancellation sequences, and retry-safety invariants. `benches/bench_adapter.py` measures selection, registration, receipt handling, upstream success/failure and complete lifecycle operations.

## References

- [Python task cancellation](https://docs.python.org/3/library/asyncio-task.html#task-cancellation)
- [Python copy semantics and protocol](https://docs.python.org/3/library/copy.html)
- [HTTP Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)
