# Python

## Contract

Write typed, explicit Python for long-lived services and separately importable domains. Keep the event loop available for I/O and make ownership, queuing and deadlines visible at every async boundary. Use representative evidence to choose the CPython execution mode or a native core.

## Structure

- Packaging layout and build-backend selection belong to the owning engine or part. This guide owns Python semantics and hand style.
- Read manifests before using a new language feature. For an authorized upgrade, check the latest stable CPython and tool releases, resolve wheels on every target and exercise the actual pinned build before updating the lock.
- Declare public exports explicitly; package topology and declaration-file placement belong to the owning engine or part.
- Use Ruff `ALL` with the existing scoped exceptions and strict mypy. The hand style is the format. Keep format-on-save off in this tree.
- Keep ordinary sources comment/docstring-free under the prescribed hand style; clarify names, types and operation boundaries when intent is obscure. Missing comments or formatter output alone are not defects.
- Use 120 columns, a blank line inside multi-line class/function definitions, spaced definition sites and tight calls. Keep a short early branch on one line where the surrounding code does.
- Use double quotes, PEP 695 generic declarations and aliases, typed dataclasses with `frozen=True, slots=True` when values are immutable, protocols for real ports and `StrEnum` for closed values.
- Follow the existing combined standard-library import line and explicit `__all__`. Keep constructors free of I/O. Use an async context manager where a resource requires setup and teardown.

```python
from collections.abc import Awaitable, Callable
import asyncio

class Loader:

    async def read [T] ( self, load: Callable[[], Awaitable[T]], seconds: float ) -> T:

        async with asyncio.timeout(seconds): return await load()

```

## Rules

### Types and boundaries

- Parse input once into the type that can carry the invariant. Decode wire values at the boundary and validate size and shape before expensive conversion.
- Treat `Any` as an explicit library or dynamic-input boundary. Cast only after checking or normalizing; keep it out of ordinary public signatures.
- Carry cause chains through typed faults. Report faults once and keep untrusted details in the private cause or redacted diagnostics.
- Reuse established date, numeric, JSON and identity types and their owner domains. Preserve caller-visible errors and cancellation when changing internals.
- Keep context variables for request-scoped context with deterministic reset. Pass explicit task inputs when the work outlives the request.
- Distinguish an omitted argument from a valid None value. On Python 3.15, a named sentinel can express that distinction; preserve identity, typing and serialization behavior across the actual boundary instead of using truthiness.
- Frozen dataclasses and frozendict do not recursively freeze referenced values. Define ownership of nested mutable data; hashability still depends on contents, and constructing a frozen mapping may copy its entries.

### Async lifetimes

- Use a `TaskGroup` for scoped concurrent work and join on exit. Handle exception groups where recovery can actually distinguish failed operations.
- Keep owned background tasks strongly referenced, observe failures and drain them during shutdown. A coroutine object must be awaited, scheduled by an owner, or closed when rejected.
- Use a monotonic deadline across admission, attempts and cleanup. Distinguish an I/O timeout, an admission failure and a caller cancellation.
- Let `CancelledError` propagate after cleanup. Use `try/finally` and `AsyncExitStack` to close partial acquisitions in reverse order.
- A semaphore limits active work. A bounded queue or incremental producer also limits waiting work and retained inputs. Choose an overload outcome before adding concurrency.
- Keep event loops, pools, locks and tasks local to the owner that created them. Cross threads using thread-safe submission and lifecycle rules.
- Keep blocking logs, filesystem calls and sync drivers off the event loop. Observe queue wait, scheduling delay and execution separately.

### Scheduling cost

- Keep small pure transformations synchronous. Declaring async does not move work off the loop, and awaiting an already-completed operation may not yield to another task.
- Observe scheduling delay during sustained in-memory processing. A deliberate yield or bounded chunk can improve fairness; adding a task or yield per trivial operation adds scheduling work and changes cancellation points.

### Queue shutdown

- A close flag alone cannot wake blocked producers or consumers. On supported interpreters, asyncio.Queue.shutdown rejects new and waiting puts; normal shutdown drains accepted items before reads finish.
- Translate queue shutdown at the owning capability boundary. Preserve cancellation and count only admitted work; draining an item and completing its business effect are separate events.
- Immediate shutdown can unblock join without processing queued work. Never treat that outcome as successful completion; prove full-queue shutdown, multiple waiters and repeated close with controlled scheduling.

### CPU, memory and native code

- Start with the existing execution owner. Offload blocking I/O; Python CPU work in another thread can still contend for the GIL. CPU parallelism needs verified GIL release, a free-threaded build, or isolated interpreters/processes; include event-loop delay in the comparison.
- Put CPU-intensive work on a bounded execution lane. Charge admitted work until the worker actually completes or is reaped. Cancelling the await may leave work running.
- Spawn imports definitions in the child; fork inherits memory and descriptors. Keep live loops, pools, sockets, threads and clients outside import-time composition and the fork parent.
- For isolated interpreters or processes, verify serializable inputs, extension support, startup, restart and failure semantics. Include copying and boundary costs when choosing the executor.
- An optional free-threaded build can run Python threads concurrently. Confirm the GIL state after importing the full workload, since an incompatible extension can enable it.
- Guard multi-operation shared invariants with explicit synchronization. Audit C extensions, shared iterators, retained memory, fork behavior, native wheels and event-loop support before adopting the build.
- Evaluate built-ins and standard iterators before a new native dependency; preserve ordering, duplicate handling, numeric semantics and failure behavior. Fewer Python source lines do not establish less work.
- Put a native core behind its owning boundary. Prefer a useful batch/kernel over repeated Python-to-native calls per item when conversion dominates. Keep a correct reference and include marshaling, callbacks, result construction and packaging in the comparison.
- Bound per-request buffers and retained shared caches. Compare allocator snapshots with process memory and available deployment-quota metrics to account for native and retained allocations.

### Cancellation and executor accounting

- Shield only a specifically owned cleanup/commit observation; retain and join the task. Shielding is not a detached-background-work primitive.
- Eager task execution changes scheduling and exception timing. Adopt only with ordering proof, not because a microbenchmark improves.
- Async timeouts are cooperative, not CPU preemption. wait_for can exceed its timeout while cancellation finishes; distinguish deadline expiry, caller return and actual cleanup completion.
- Explicitly close owned async generators on early break, cancellation or error. aclosing keeps asynchronous finalization in the iteration context; do not defer resource release until unrelated garbage collection.

### Platform and interpreter boundaries

- Support Linux, macOS and Windows without assuming fork. Python 3.14+ no longer defaults to fork anywhere; macOS/Windows use spawn, and supported POSIX environments may use forkserver. Inspect the selected interpreter's actual context.
- Libraries accept the caller's multiprocessing context when needed; they do not globally replace it. Keep child entry/imports safe and avoid mixing synchronization objects from incompatible contexts.
- Windows event loops differ in pipe, subprocess and reader/writer support; Unix signal handlers are not a portable cancellation interface. Select compatible mechanisms at the host adapter.
- Use path/process APIs with argument vectors and explicit text encodings. Verify replacement, permissions, reserved names and open-handle behavior on the target filesystem.
- Native wheels must match Python ABI, free-threaded status, OS and architecture. A wheel present for one platform or interpreter mode establishes no guarantee for another.
- Assess free-threading with the complete workload: synchronization, extension compatibility and memory overhead can outweigh parallel speedup. Keep resource cleanup explicit rather than depending on collection timing.

### Measurement interpretation

- Distinguish Python allocation tracing from native buffers, subprocesses and total resident memory. Track per-worker and aggregate costs, including startup and serialization.
- Calibration must keep the measured operation observable and the interpreter mode explicit. Warm adaptive/runtime behavior and cold execution are different questions; preserve both when startup matters.
- Stateful properties compare operation sequences against a simpler model; preserve shrunk failures. An invariant should express the contract rather than repeat the optimized implementation.

### Bounded processing and environment identity

- Distinguish whitespace-word splitting from lexical words, graphemes and encoded bytes. Preserve the public unit and no-op behavior when optimizing a text operation; normalization is a separate transformation.
- Materializing every match/token costs memory even when only a prefix is required. Prefer bounded iteration when the contract permits early stopping; account for one lookahead needed to distinguish fitting input from truncation.
- Bounded item count is not necessarily bounded bytes: a retained token, match object or unsplit remainder can keep large input alive. Judge retained data and peak allocation as well as list length.
- A virtual environment records interpreter and installation paths and is not a portable source artifact. Recreate it from the selected manifests at its assigned location; copied activation scripts, editable installs or namespace paths can execute another checkout’s code.
- For allocation comparisons, construct shared input before the measured interval and reset peak accounting per operation. tracemalloc records traced Python allocations, not all native or process memory; resetting peak does not clear live traces.

### Import and profiling choices

- Python 3.15 explicit lazy imports defer module execution until first use. Assess cold startup and first-use latency together; deferred exceptions, side effects and imports under another thread or context can change behavior.
- Keep registration and mandatory startup checks explicit. A blanket lazy-import switch can hide a missing dependency until a request reaches it; apply laziness only where the lifecycle contract permits it.
- On compatible interpreters, statistical sampling attributes CPU, waiting and interpreter activity; deterministic tracing provides call detail with different overhead. Neither produces clean benchmark evidence.
- The 3.15 profiling namespace offers sampling/tracing facilities. Select by the question and supported host privileges; attaching to another process has platform-specific access requirements and needs ownership of that process.
- Compiler/runtime changes such as UTF-8 defaults do not define an external file format. Keep protocol and persisted text encodings explicit across Linux, macOS and Windows.

### Structured early completion

- On Python 3.15, TaskGroup.cancel() supports an owned early exit after a result is sufficient. It requests cancellation and the group still joins cleanup; it does not preempt blocking work. Distinguish that group exit from external caller cancellation and ordinary child failures before choosing recovery.

### Buffers and representation

- Avoid repeatedly concatenating growing immutable text or bytes. Use bounded chunk assembly, a mutable builder or incremental output according to the result contract; joining a complete result still materializes it.
- A memoryview borrows storage. Preserve exporter lifetime, mutability and the callee's format/contiguity requirements; a read-only view does not freeze another writable reference. Copy at the boundary when required instead of silently narrowing accepted buffers.
- CPython 3.15 bytearray.take_bytes() transfers the complete buffer without another copy and empties it; taking only a prefix copies. Use it only when consuming that buffer is allowed and no outstanding export prevents resizing. This says nothing about later network or decoder copies.
- Prefer compact homogeneous storage when the data warrants it. Account for native element width, signedness, overflow, byte order and conversion back to Python objects; do not substitute packed storage for a heterogeneous contract.
- Slots can reduce per-instance overhead when many objects share a stable shape. Preserve required inheritance, weak-reference, serialization and dynamic-attribute behavior; frozen values and slots solve different problems.

### Runtime tuning

- Record whether JIT is available and enabled in the actual build. Compare warmed and cold execution separately from free-threading; avoid polling JIT-active state inside the measured hot loop.
- Diagnose allocation and collection pressure before changing GC thresholds. Disabling cyclic collection can retain unreachable cycles; gc.freeze excludes the tracked population from future collection and is not a general leak remedy. Tune within the actual process model and compare retained memory and latency over sustained work.

### Memoization semantics

- functools.cache is unbounded; lru_cache bounds entries, not their byte size. Arguments and results remain referenced until eviction/clear, including self for cached methods. Choose the lifetime before memoizing a large or request-owned object.
- These caches keep their internal structure coherent across threads but can compute a concurrent miss more than once. They do not provide single-flight, transaction or exactly-once semantics.
- Do not decorate an async function or generator with an ordinary result cache: it retains the returned coroutine/iterator object rather than creating an independently reusable completed value. Use the owning capability's async cache contract, including cancellation and mutable-result ownership.
- Metadata caches must distinguish concrete types and relevant configuration; inherited cache attributes must not accidentally reuse another class's plan. A global map can retain dynamic classes indefinitely. If using weak keys, ensure cached values do not strongly retain those keys.

## Proof

- Use explicit expected values and typed failure reasons. The owning workspace defines its test framework, ordering, warning and time-limit configuration.
- Exercise cancellation at admission, I/O and teardown; prove partial startup cleanup and close order. Test thread and process outcomes with synchronization, not timer guesses.
- Give a parser or decoder meaningful property-based coverage for structured and binary input. Preserve examples that expose a defect and compare any native candidate against the reference.
- Treat static checks, API compatibility and runtime behavior as distinct coverage. Select the relevant methods and breadth for the task.
- Measure cold import and worker startup separately from warmed operations. Keep machine, interpreter build, wheel set, limits, concurrency and payload distribution comparable.
- Apply the owning engine's service evidence contract; language profiling attributes Python/native cost but does not replace whole-service measurements.

## Sources

- [CPython releases](https://www.python.org/downloads/)
- [Asyncio tasks and deadlines](https://docs.python.org/3/library/asyncio-task.html) · [Asyncio development diagnostics](https://docs.python.org/3/library/asyncio-dev.html) · [Executors](https://docs.python.org/3/library/concurrent.futures.html)
- [Free-threaded CPython](https://docs.python.org/3/howto/free-threading-python.html) · [PEP 779](https://peps.python.org/pep-0779/)
- [tracemalloc](https://docs.python.org/3/library/tracemalloc.html) · [pyperf](https://pyperf.readthedocs.io/en/latest/run_benchmark.html)

[String splitting](https://docs.python.org/3.15/library/stdtypes.html#str.split) · [Match iteration](https://docs.python.org/3.15/library/re.html#re.finditer) · [Environment identity](https://docs.python.org/3.15/library/venv.html#how-venvs-work).

[Async generator closure](https://docs.python.org/3.15/library/contextlib.html#contextlib.aclosing).

[Process contexts](https://docs.python.org/3/library/multiprocessing.html) · [Async platform support](https://docs.python.org/3/library/asyncio-platforms.html) · [Stateful properties](https://hypothesis.readthedocs.io/en/latest/stateful.html).

[Sentinel values](https://peps.python.org/pep-0661/) · [Frozen mappings](https://peps.python.org/pep-0814/) · [Dataclass semantics](https://docs.python.org/3/library/dataclasses.html).

[Explicit lazy imports](https://peps.python.org/pep-0810/) · [Python 3.15 changes](https://docs.python.org/3.15/whatsnew/3.15.html) · [Profiling choices](https://docs.python.org/3.15/library/profiling.html) · [Sampling platform requirements](https://docs.python.org/3.15/library/profiling.sampling.html).

[Queue shutdown semantics](https://docs.python.org/3.15/library/asyncio-queue.html).

[TaskGroup lifetime and early completion](https://docs.python.org/3.15/library/asyncio-task.html#task-groups).

[Memoization lifetime and concurrency](https://docs.python.org/3.15/library/functools.html) · [Weak-reference ownership](https://docs.python.org/3.15/library/weakref.html).

[Buffer ownership and concatenation](https://docs.python.org/3.15/builtins/stdtypes.html) · [Iterator composition](https://docs.python.org/3.15/library/itertools.html) · [Compact arrays](https://docs.python.org/3.15/library/array.html).

[JIT state](https://docs.python.org/3.15/library/sys.html#sys._jit) · [Cyclic collection and freezing](https://docs.python.org/3.15/library/gc.html).

## Routing

This is a terminal language skill. Return to the calling route after reading it and inspect the area’s pinned toolchain, surrounding code and proofs.
