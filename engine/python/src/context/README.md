# Context

Context binds request metadata to the current execution context. Deferral owns a bounded FIFO of in-memory work.
Trace validates supported version-00 traceparent values. Runtime dependency: engine-error and the standard library.

## Scope

Reuse the exported context instance, or a long-lived Context owner. Instances use fixed slots. Open a scope per request or job, not a new owner.
scope restores its previous bindings even when its body fails. open/close provide the explicit token-based form.
Neither form runs deferred work automatically; the lifecycle owner decides when to flush.

facts returns a stable read-only view of the current top-level bindings.
put with fields, load and effective forget publish a new view. Empty put/open and missing forget retain the view;
tokens and new deferral scopes still follow their ordinary lifecycle.
get/need/actor return borrowed values; snapshot is a shallow dictionary copy.
Arbitrary local objects, including sessions and handles, are not deep-copied or made immutable.
Replace bindings with put rather than mutating a shared nested object when child tasks need independent values.

Child tasks inherit the current bindings. Updates made through put/reset in one child do not alter its parent or siblings.
Tokens must be restored once, in their originating context. clear resets the active bindings and detaches its deferral.

## Transfer

dump and load share one bounded wire policy: approved metadata names, bounded strings and flat string-keyed maps,
integers/booleans and finite floats. Unsupported, nested, oversized and nonfinite values are omitted.
Flat maps are copied on both boundaries and the actual transferred copy is validated.
General mapping snapshots read at most 17 entries to enforce the 16-field budget before materializing the full map;
a misleading length cannot bypass it. Custom mapping methods still own their execution cost.
dump is not a deep copy of arbitrary local state. Use dump for propagation; facts also contains local-only values.
Propagated actor/tenant metadata is not authorization; the consumer still validates authority.

headers emits validated request-id and traceparent fields only. It does not forward actor or tenant values.
Trace supports version 00 with nonzero trace/span ids, lowercase hexadecimal and exact wire length.

## Deferred work

defer adds a callable to the current scope and returns false when no scope owns a deferral.
A callable may return a normal value or an awaitable. flush executes eligible work in FIFO order.
Work appended while flushing follows the already queued work. pending counts work that has not started.
clear discards pending work, including during a flush; it does not interrupt the current callable.

A Deferral has one active flush at a time within its owning event loop.
An overlapping or recursive flush raises context.busy without consuming pending work.
There is no cross-thread synchronization and no durable delivery guarantee.

Cancellation and other BaseException control flow propagate. The interrupted callable is not automatically retried;
unstarted work remains queued, and the flush ownership flag is released so the caller can resume or discard it.
Flush in the active scope, or in a task created while that scope is active, when callbacks need its metadata.

failed=True skips work unless it was added with always=True. This describes failure of the owning request/job,
not an automatic switch triggered by an individual deferred failure.
Ordinary work failures do not stop later work. With no reporter they are raised together as ExceptionGroup.
A supplied reporter may be synchronous or asynchronous. If it fails, both the original and reporter errors
are retained in the final group while later work continues.

At most 1,024 items may be pending and at most 1,024 eligible callables execute in one flush.
Queue overflow raises context.full. Execution-budget exhaustion reports context.loop and discards the remaining work.
The queue storage is allocated on first add and released when drained.

## Compatibility

Public names and parameters are unchanged. Top-level facts are now read-only.
Wire export now applies the same bounded filtering as import and copies flat maps.
Concurrent flush is explicitly refused; reporter failures no longer lose pending work; the execution budget is exact.
Application-owned mutable values remain borrowed locally.
