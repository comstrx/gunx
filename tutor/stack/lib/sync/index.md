# Go sync extensions

## Contract

Own the selected golang.org/x/sync concurrency helpers. These are library facilities, distinct from the language's standard sync package.

## Structure

Use an errgroup for related operations whose failures and completion belong to one task. It is not a replacement for the engine's admission and lifecycle contract.

## Rules

- A zero Group has no active-task limit and does not cancel on an error.
- WithContext derives cancellation for the group's work; propagate it to cooperating operations. It is canceled on the first non-nil task error or when Wait returns, even after success; subsequent unrelated work needs its own valid context.
- Go may block submission at the active limit. SetLimit must not change while group goroutines are active; a nested submission that needs the same exhausted limit can deadlock.
- TryGo reports whether the function could start without waiting for that limit.
- A task group limit does not bound already retained input or every waiting producer. Use an owned bounded queue when submission itself needs cancellation and backpressure.
- Wait joins all group functions and returns the first non-nil error; it does not collect every item result or undo completed effects. An all-results or partial-success contract needs explicit owned result collection. Do not reuse a Group for unrelated tasks.

### Weighted admission

- Weighted semaphores account for resource cost, not merely task count. Validate capacity and requested weight before admitting work; a request above capacity cannot make progress without cancellation.
- Acquire is context-aware; failed acquisition leaves the semaphore unchanged. Release exactly the successfully acquired weight after the actual operation ends.
- TryAcquire makes immediate refusal possible. Decide refusal/queue semantics in the engine rather than hiding an unbounded waiting population.
- Weighted admission avoids starving a large queued waiter by not letting smaller later requests bypass it. This can cause head-of-line blocking; evaluate mixed weights and queue latency rather than assuming every free unit admits new work.

### Duplicate work

- singleflight shares the result of one in-flight function for equal keys. It is neither a durable cache nor a distributed lock.
- A key must represent the complete result identity supplied by the caller, including any isolation-relevant inputs; unrelated callers must not share privileged results.
- Shared results need an ownership policy for mutable objects. Define the shared operation's lifetime independently from an arbitrary waiter's cancellation.
- DoChan returns a result channel that is not closed; do not range it waiting for closure. Forget allows later calls to begin independently; it does not cancel earlier work.

### Portability and evidence

- These helpers run within the owning Go program on Linux, macOS and Windows; they do not synchronize independent processes or machines.
- Test cancellation before/after admission, first failure, delayed completion, duplicate keys, shared errors and cleanup. Use deterministic barriers rather than sleeps.
- Benchmark actual contention, key skew, work duration and retained waiters. A low-contention microbenchmark does not establish saturated service behavior.

## Proof

Cover error propagation, cancellation, saturation, submission behavior and task completion without timing guesses.

## Sources

[errgroup](https://pkg.go.dev/golang.org/x/sync/errgroup).

[Weighted semaphore](https://pkg.go.dev/golang.org/x/sync/semaphore) · [Queue implementation](https://github.com/golang/sync/blob/master/semaphore/semaphore.go) · [Duplicate suppression](https://pkg.go.dev/golang.org/x/sync/singleflight).

## Routing

Read [languages](../../lang/index.md) with Go selected, then return to the caller.
