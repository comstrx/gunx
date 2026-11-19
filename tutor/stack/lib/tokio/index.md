# Tokio

## Contract

Own Tokio runtime, task and cancellation mechanics. The engine owns its execution DSL and deployment budgets; transport libraries own HTTP controls.

## Structure

Choose the runtime through the owning engine's deployment contract. Every spawned task has an observer and a shutdown owner.

## Rules

- Bound task submission, waiting work and running work separately; selecting a runtime does not establish an application admission limit.
- Audit `select!` branches against their operation's cancellation guarantees. Retain partial progress across iterations when dropping and recreating a future would lose it.
- `spawn_blocking` is for finite blocking work. Its large default thread limit is not a CPU admission policy; impose a suitable limit before submission.
- Once blocking work starts, aborting its handle does not stop it. A runtime shutdown timeout stops waiting, not the underlying execution.
- Keep ownership and admission accounting until the actual blocking work completes. Long-lived synchronous workers need an appropriate dedicated execution lifetime.
- A continuously ready or CPU-heavy task can starve other work; use bounded batches and cooperative scheduling.
- Stop admission, signal shutdown and await owned tasks within the engine's declared drain contract. Record uncertain external outcomes.
- Dropping a JoinHandle detaches its task; it does not cancel or join it. Retain the handle or use an owning task collection until completion is observed.
- abort requests cancellation; await/observe the resulting completion before claiming cleanup finished. This does not stop an already running blocking task.

### Runtime selection and portability

- Select current-thread or multi-thread runtime from the execution contract. Async tasks on a current-thread runtime still interleave; single-threaded does not remove shared-state races across suspension.
- Runtime construction, ownership and shutdown belong at the integration boundary. A library does not silently create nested runtimes or block an active runtime to offer a convenient sync call.
- Enable only needed runtime, I/O, time and synchronization features. Linux, macOS and Windows have different signal/process/socket capabilities; isolate those in adapters instead of assuming every API is portable.
- Choose channels, semaphores and locks by the invariant. Capacity limits active resources only when acquisition/release covers their actual lifetime; cancellation must not return capacity early.
- broadcast bounds retained messages by dropping old values and reports Lagged to slow receivers; it does not backpressure producers into lossless delivery. A required event history needs a suitable transport/recovery contract; resuming after lag is an explicit consumer decision.

### Channel completion

- An accepted mpsc send does not prove receipt or processing. Required completion uses an explicit response/acknowledgement under the owning capability’s contract.
- Canceling `send` in `select!` can drop its owned value. If the caller must retain that value, reserve capacity first and transfer ownership only when sending; canceling a reservation loses its queue position.
- Preserve bounded admission during shutdown. Account for outstanding permits and buffered messages before declaring a channel drained; closing admission and consuming existing work are separate steps.

### Testing and measurement

- Match the test runtime flavor to the behavior under study. Include multi-thread interleavings when claiming thread-safe integration; a current-thread test is insufficient.
- Paused Tokio time requires the appropriate time/test-util support and current-thread runtime. It advances runtime timers, not wall-clock time, external services or real I/O.
- Use controlled readiness and explicit synchronization to examine cancellation, select branches and shutdown. Timer advancement alone does not establish every spawned task has finished.
- Compare runtime flavors, worker counts and blocking admission on the actual workload. Keep runtime construction and idle startup outside an operation benchmark unless startup is the question.

### Task collection choice

- JoinSet retains completed task results until collected. Drain completions while accepting work; limiting running tasks alone does not bound uncollected results. abort_all requests cancellation but leaves entries to be joined.
- TaskTracker can release finished task storage without retaining results, but it does not replace result/error observation. wait completes when the tracker is closed and empty; close does not prevent new submissions, and dropping the tracker does not abort tasks.
- Choose by whether the owner needs results, completion tracking or both. Keep admission closure, failure reporting and joining under one lifecycle; a task collection is not itself a concurrency limit.

## Proof

Cover task failure observation, cancellation safety, saturated submission, blocking completion and bounded shutdown with actual runtime behavior.

## Sources

[Blocking work](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html) · [Cancellation safety](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety) · [Shutdown](https://tokio.rs/tokio/topics/shutdown).

[Runtime features and platforms](https://docs.rs/tokio/latest/tokio/) · [Testing](https://tokio.rs/tokio/topics/testing) · [Paused time](https://docs.rs/tokio/latest/tokio/time/fn.pause.html).

[mpsc send and reservation](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html) · [mpsc close and drain](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Receiver.html).

[JoinHandle lifetime](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html) · [Broadcast lag](https://docs.rs/tokio/latest/tokio/sync/broadcast/index.html).

[JoinSet completion](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html).

[TaskTracker lifetime](https://docs.rs/tokio-util/latest/tokio_util/task/struct.TaskTracker.html).

## Routing

Read [languages](../../lang/index.md) with Rust selected, then return to the caller.
