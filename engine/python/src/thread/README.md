# Thread

One execution facade over async tasks, threads, processes, interpreters and a remote provider.
Select the mode, configure its options, then use the same work and lifecycle verbs.

## Selection

~~~python
from engine.thread import thread

jobs = thread.mode("process").options(workers=4)

try:
    task = jobs.submit(pow, 2, exp=10)
    value = await task
    values = await jobs.map([1, 2, 3], transform)
    batch = await jobs.run([1, 2, 3], transform)
    batch.raise_first()
    jobs.stop()
    await jobs.join()
finally:
    await jobs.drop()
~~~

Every mode() creates an independent scope. It neither mutates the module singleton nor shares another
scope's task registry, admission limit or local workers. Retain a scope for repeated work.
options(workers=None, provider=None, host=None, *, namespace=None, runtime_env=None) configures
that scope and returns it. namespace/runtime_env are remote-only.
None leaves an option unchanged. Configure before start or the first execution attempt; later changes
raise thread.started. Create another scope for different options.

| Mode | Work | Provider / host |
| --- | --- | --- |
| async | Async functions or short synchronous functions on the event loop | Neither |
| thread | Synchronous functions in an owned thread pool | Neither |
| process | Synchronous functions in spawn worker processes | Neither |
| interpreter | Synchronous functions in isolated Python interpreters | Neither |
| remote | Synchronous remote functions | provider="ray"; host is the Ray address |

remote defaults to provider="ray", host="auto": attach to an existing cluster.
An explicit address can be host:port for native cluster access or ray://host:port for Ray Client.
These use different cluster endpoints; choose the transport explicitly. The installed provider must support it.
No arbitrary keyword options are forwarded to libraries. Unsupported providers/options fail before I/O.
Mode selection is explicit; there is no GIL-based automatic switching.

## Ray connection

~~~python
jobs = thread.mode("remote").options(
    host="ray://head:10001",
    workers=4,
    namespace="tasks",
    runtime_env={"env_vars": {"MODE": "worker"}, "working_dir": "./worker"},
)

try:
    await jobs.start()
    result = await jobs.submit(calculate, 12)
finally:
    await jobs.drop()
~~~

namespace and runtime_env configure the Ray job/session, not individual tasks.
The engine snapshots runtime_env containers at configuration time; later caller container mutations do not change them.
Module references in py_modules retain their identity; module code/globals are not an immutable snapshot.
Ray owns validation and installation of its environment fields. Required application/engine modules must
be installed on the workers or shipped through the selected runtime_env.

One managed Ray connection is shared per process. An explicit address, namespace or runtime_env differing
from the active connection raises thread.cluster; omitted namespace/runtime_env inherit that connection.
Use separate driver processes for simultaneous different namespaces/environments. Ray namespaces group
jobs and named actors; they are not an authorization or hostile-code isolation boundary.

Options freeze on first operational entry. A rejected options call leaves previous options unchanged.
describe reports namespace and whether runtime_env was supplied, never the environment's contents.
The lower-level thread.cluster/Cluster.connect accept the same keyword-only namespace/runtime_env.
Cluster.close explicitly shuts down the shared connection. A retired handle cannot close or use its
successor. Scope drop only closes that scope. Manage Ray initialization/shutdown through this owner;
an already initialized external session is rejected instead of silently adopting unknown settings.

Builtins, bound methods and callable objects are wrapped as ordinary remote functions where Ray requires it.
Cancellation is sent through Ray.cancel; the provider-owned result future is shielded from local cancellation
and its eventual result/error is consumed. Provider cancellation remains cooperative; a client cancellation
is not proof that remote side effects were undone.

Ray is optional and loaded only for remote work. If it is missing or its native library cannot load,
the shared connection boundary emits a thread.ray warning with the current Python version and compatibility
guidance, then raises the same typed fault. Both connection transports use this boundary; selecting a mode
or configuring options performs no provider import. Other execution modes are unaffected.
This checks actual loading, not a permanent Python-version ban; successful loading alone does not certify
provider compatibility or prevent later provider errors.

The official Ray 2.60.0 Linux wheels support CPython through 3.14, not the workspace's 3.15 runtime.
The live adapter check used an isolated 3.14 client/cluster with only lazy-import syntax adapted in temporary
source copies; native Ray use from the workspace runtime remains unverified.

## Verbs

| Verb | Meaning |
| --- | --- |
| submit(fn, *args, **kwargs) | Schedule one owned job immediately; return its awaitable task. Requires a running event loop. |
| run(items, fn, ...) | Execute a bounded batch; return Run with Outcome values/errors, retry and callback controls. |
| map(items, fn, limit=None) | Return values in input order; a failure raises and cancels/drains siblings. |
| gather(*works, limit=0) | Collect awaitables or execute zero-argument callables in the selected mode; return input order. |
| start() | Open/resume admission and prepare the backend; local workers remain lazy until submission. Returns the scope. |
| stop() | Refuse new work; accepted jobs and batches continue. Synchronous; does not kill workers. |
| join(grace=30) | Wait for owned tasks and actual submitted local work; timeout raises thread.join without cancelling it. |
| drop(grace=5) | Close admission permanently, request cancellation, release owned local resources; return number of tasks targeted. |
| describe() | Report mode, provider, host, worker limit, task count and lifecycle flags. |

Execution starts lazily; an initial start() is optional. start() can resume after stop(), never after drop().
Repeated drop() is harmless. Await submit's returned task to receive its result/error; join is lifecycle
coordination, not result collection. After a join timeout, work remains owned and a later join can finish it.
Call stop before join when other producers might still submit. Completed tasks are removed from tracking.
Each configured scope belongs to one event loop after its first operational call; another loop gets thread.loop.
The lower-level Pool/Lane primitives retain their separate cross-loop behavior.

~~~python
jobs = thread.mode("thread").options(workers=4)

try:
    values = await jobs.gather(
        jobs.submit(load, "first"),
        jobs.submit(load, "second"),
    )
finally:
    await jobs.drop()
~~~

gather coordinates already-created awaitables as supplied; it does not serialize coroutine objects or move
their bodies into another process. For work in the selected mode, pass callables or tasks from jobs.submit.
Its limit controls collection/callable startup, not already-started external tasks.

## Bounds and errors

- workers is a scope budget, not a machine-wide budget. Multiple scopes/server workers have separate limits.
- run/map/gather cannot raise their worker limit above the configured budget.
- Async/remote admission is shared across operations in the scope. Remote workers is a client in-flight limit;
  provider cancellation and cluster scheduling determine when remote execution actually stops.
- Local pools retain capacity until actual synchronous work completes, even if its awaiter is cancelled.
- submit creates a task immediately; workers bounds execution, not an unlimited queue of caller-created tasks.
  Prefer map/run for large iterables.
- run retains final outcomes; map/gather retain all returned values. These are not constant-result-memory streams.
- fail_fast stops new input pulls after terminal failure; already started items finish. Initial lookahead is
  bounded by workers. No synthetic outcomes are created for untouched input.
- Child cancellation propagates; sibling cleanup completes before returning. Callback failure aborts the batch.
- Configured execution translates provider/work failures through Fault; cancellation remains cancellation.
- Invalid modes/workers/host use thread.mode/thread.workers/thread.host. Unsupported verbs or options use
  NOT_IMPLEMENTED + thread.unsupported with mode and verb fields. No silent fallback to another mode/provider.
- Async functions are rejected in synchronous modes before scheduling. A blocking function in async mode still
  blocks the event loop; mode selection does not inspect or guess its cost.
- Options freeze at first operational entry. stop/drop/start and batches have distinct, tested ownership rules.

## Cancellation and retries

Only Faults permitted by Fault.safe are retried; arbitrary exceptions and permanent faults do not retry.
retries counts additional attempts. retry_after is respected.
Unknown-outcome faults require run(..., idempotent=True) to permit retry; this is a caller promise, not rollback.
timeout bounds each attempt, including admission wait, not the entire batch.
An engine timeout becomes thread.timeout with unknown=True; a handler's own TimeoutError remains a handler error.

Cancelling a running thread/interpreter cannot forcibly stop its synchronous function. join still waits for
that local work; drop releases the scope but such work may outlive it. Cancellation-resistant async tasks may
outlive drop's grace and are reported through the existing Tasks mechanism.
Process-lane cancellation kills that job's dedicated worker pool and recreates it lazily if still open.
Remote cancellation is delegated to the provider. Dropping a scope never shuts down the shared Ray connection.
Cancellation cannot undo external side effects already performed.

## Existing utilities

The root singleton retains offload, compute, run, map, gather, race, spawn, tasks, chunks, sleep, stop,
stopping, forever, close, cluster and describe for current consumers. setup has been replaced by mode/options.
Root run defaults to async; root compute defaults to process; root offload uses threads.
Root map remains an awaitable-handler utility; limit=None uses its usual default.
On a configured scope, compute uses the selected mode; a conflicting per-call mode/address is rejected.
offload is available only on thread scopes; spawn only on async scopes.
cluster and forever are root-only low-level/global ownership operations.
Configured close delegates to drop. race coordinates supplied awaitables; chunks materializes its result.

Process mode requires serializable callables/arguments/results and an importable guarded application entry.
Thread jobs inherit a copy of ContextVars; changes do not merge back, and mutable referenced values remain shared.
Interpreter mode requires compatible dependencies. Native threads with a GIL release or free-threading need
their own thread-safety assessment; this facade does not promise automatic acceleration.

## Verification

tests/test_thread.py exercises the same facade across async/thread/process/interpreter and a controlled Ray
protocol fake, plus lifecycle, options isolation, bounded concurrency, cancellation, retries and compatibility.
Task-factory rejection closes unscheduled coroutines and drains already-created children; eager completion
is removed from pending ownership immediately.
fuzz/fuzz_thread.py covers generated results and an independent lifecycle model.
benches/bench_thread.py includes raw primitives, the retained API and configured-scope overhead.

Real local process/interpreter execution is covered on Linux/WSL.
A real Ray 2.60.0 cluster on Linux/WSL passed four independent native-driver sessions: remote execution,
builtin mapping, error conversion, running-task cancellation, scope drop isolation, environment separation,
and same-name actors in different namespaces surviving driver reconnects.
Ray Client also exercised execution/cancellation/isolation, but repeated connection startup reproduced an
upstream gRPC fork failure; its connection reliability is not certified by the native-driver pass.
The cluster was local and single-node; this does not prove multi-host networking or production capacity.
Native Windows/macOS, free-threaded Python and the workspace's 3.15 Ray client require separate evidence.

See [Ray Client startup issue](https://github.com/ray-project/ray/issues/63202),
[environment fields](https://docs.ray.io/en/latest/ray-core/handling-dependencies.html),
[cancellation](https://docs.ray.io/en/latest/ray-core/api/doc/ray.cancel.html),
and [release wheels](https://pypi.org/project/ray/2.60.0/#files).
