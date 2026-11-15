# Func

Callable metadata and execution policies: retries, deadlines, coalescing, batching,
local memoization, circuit breaking, rate limits and function composition.

## Ownership

Function policies live here. Thread owns execution backends; rand supplies retry jitter;
error defines retry safety; log records failures. There are no direct third-party dependencies.
Async coordination objects belong to their event loop. Share them between concurrent tasks on that loop,
not between independent server processes. Memo rejects joining an active load owned by another loop;
Batch rejects crossing its bound loop.

## Examples

~~~python
from engine.func import func

answer = await func.retry(fetch, tries=3, backoff=0.1, ceiling=2, idempotent=True)
answer = await func.timeout(2, fetch)
memo = func.memo(ttl=30, size=1024)
answer = await memo.remember(key, fetch)
breaker = func.breaker("upstream", threshold=5, cooldown=30)
answer = await breaker.call(fetch)
batch = func.batch(fetch_many, size=64, delay=0.001, workers=2)
answer = await batch.put(key)
await batch.flush()
~~~

Keys must include every input that changes the answer, including authorization/tenant scope where relevant.
Memo and single do not infer business isolation from ambient context.

## Policies

- retry counts total attempts. Only Fault.safe permits retry. Unknown outcomes require explicit idempotence;
  arbitrary exceptions are not retried. Jitter stays inside the exponential cap; retry_after is a floor,
  and a provider delay exceeding the ceiling refuses another attempt. Backoff cannot overflow.
- timeout translates only its own expired deadline. A handler's TimeoutError remains the handler's error.
  Cancellation propagates. Negative durations follow asyncio's immediate-deadline behavior.
- poll bounds asynchronous checks and the sleep against one total deadline. Its synchronous callback must
  be short and nonblocking; cooperative cancellation cannot preempt a blocking or cancellation-resistant function.
- hedge starts delayed duplicate attempts and takes the first success; every losing attempt is cancelled
  and awaited. Use only work whose duplication is safe. Cancellation cannot undo external side effects.
- single shares an in-flight result by key without keeping completed results. One cancelled waiter cannot
  cancel the shared task. Eager task completion cannot turn it into a cache.
- once keeps the first successful result; failures leave it retryable. Its lock serializes initialization.
- cached combines argument keying with Memo; explicit key functions and a supplied Memo remain supported.
- settle collects Faults in order, sequentially. fallback tries alternatives until one succeeds.
  Neither silently swallows arbitrary exceptions or cancellation.
- call/lift accept short synchronous functions or awaitable results. They do not move blocking work to
  a worker; use the thread facade for that.
- hook preserves before/after/failure callback semantics. pipe/compose/tap/when/unless compose ordinary values.

## Memo

Memo stores at most size entries with monotonic TTL, using insertion/write order for eviction, not LRU.
Reads return the stored value by reference. Copy at the owning application boundary when mutation isolation is needed.

remember serializes loads per key. Invalidating a key, clearing the memo or explicitly setting a new value
prevents an older in-flight load from overwriting the current cache. That original caller may still receive
its original result; invalidation is not cancellation. A retired load cannot remove a successor's lock.
Zero TTL disables value reuse while keeping concurrent loads serialized.

get/has treat expired entries as absent. prune removes expired entries and releases their values explicitly;
len reports stored entries until eviction/pruning. Infinite TTL is supported explicitly.
A rejected TTL update leaves the previous entry and active load unchanged.

## Batch

size limits values per provider call. workers limits simultaneous provider calls; the admission budget is
size × workers values. Further puts await capacity rather than creating unbounded flush tasks.
The caller still owns any tasks it creates while waiting for admission.

delay coalesces a partial batch; a full batch may start immediately. flush submits buffered values and
awaits the currently owned runs. Stop producers before using it as a shutdown barrier.
Results must match inputs in count and order; mismatches fail the affected batch.
Cancellation before dispatch excludes that value. Cancellation after dispatch does not undo provider work.
Batch cancellation removes queued values immediately; already-running flushes retain their capacity until completion.
The provider must return a materialized Sequence, not a lazy generator.

## Lifecycle

debounce retains the newest pending call. pending/drain include unfired debounce timers and started
single/debounce work on the current loop. drain waits; it does not force delayed calls to execute early.
Stop producers first: continuously scheduling more work can keep a drain open.
Keep the loop alive to finish owned work before shutdown.

A breaker allows one half-open probe after cooldown. Late work from a superseded breaker state cannot
reset the new state; reset deliberately starts a new state generation. Only mapped server/retryable Faults
count as downstream failures; map provider errors at their owner.
Limiter is a local token bucket, not a distributed quota. Cancellation while waiting does not consume a token.

## Metadata and native selection

signature/bind/params/defaults/required/arity describe Python callables; Info assembles their metadata.
Weak-key metadata caches avoid ordinary callable retention; annotation/default objects retain normal Python references.
resolve accepts public module:attribute paths and optional allowed roots. Imports and type-hint evaluation
execute trusted Python code; neither operation is a sandbox for untrusted configuration.
pick chooses a registered native/pure implementation by configured mode and module availability.
Importability is not a performance proof; compare both implementations on the domain's real workload.

## Verification

The package owns tests/test_func.py, benches/bench_func.py and fuzz/fuzz_func.py.
Regressions include invalidation during active loads, stale breaker completions, child cancellation,
strict deadlines, deferred drain, eager completion, bounded batches and cross-package context/error isolation.
Measurement reports distinguish semantic protection costs from speed gains.
