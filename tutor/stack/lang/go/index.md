# Go

## Contract

Use Go’s direct composition, explicit errors and ownership of concurrent work. Keep resource budgets explicit and prove idiomatic changes with the workload that needs them.

## Structure

- Read the workspace and module `go` directives. Keep the repository’s `GOTOOLCHAIN=local` policy when reproducing a pin. Verify latest stable and current patches from Go releases before an authorized change.
- A go directive establishes the minimum required version; toolchain selection also depends on the active workspace, preferred toolchain and environment. Record the executable version actually used. A local-only policy prevents automatic switching/downloads; it does not turn a minimum directive into an exact compiler pin.
- Use the existing hand style and linter configuration. Keep tabs, braces on opening lines, body padding and the surrounding compact guard style. Keep format-on-save off for this tree.
- Use `internal/` for import-restricted packages. The owning engine or part chooses declaration and implementation files.
- Keep consumer-defined interfaces small. Prefer the smallest useful concrete type and add generics when a real type set earns the abstraction.
- Names read with their package. Use unified verb meanings and existing public constructor spelling; changing New/Create is a compatibility decision.
- Avoid `init`, global mutable clients and loggers, and helper grab bags. Pass long-lived resources explicitly. Leave cgo off by default and prove native requirements, platforms and fallback separately.
- Document every exported name. Give command binaries a testable `run` function; the owning engine defines its public command contract.

```go
// Package reader loads one object through the caller's source.
package reader

import "context"

// Source provides object bytes by key.
type Source interface {
	Read(context.Context, string) ([]byte, error)
}

// Load reads one object within the caller's deadline.
func Load ( ctx context.Context, source Source, key string ) ( []byte, error ) {

	return source.Read(ctx, key)

}
```

## Rules

### Context, errors and ownership

- Put `context.Context` first on work that waits or performs I/O. Derive a deadline from the caller’s budget and always release a derived cancellation function.
- Pass context down the call chain; use context values only for request-scoped data. Separate request lifetime from explicitly owned durable work.
- Wrap errors with `%w` where crossing a layer adds context. Use `errors.Is` and `errors.As` for semantic matching. Keep stable codes separate from diagnostics.
- Give every goroutine a stop condition and a join owner. Make channel buffer size, send cancellation and who closes the channel explicit.
- Bound producers and queues as well as goroutines. Third-party task-group mechanics belong to the selected library skill.
- Cancellation signals downstream work. It leaves already committed writes intact, so govern retry and replay at the write boundary.
- Use race-detector proof for shared memory, and synchronization rather than sleeps for ordering assertions.

### Byte I/O contracts

- Process a Reader's returned bytes before its error; data and EOF may arrive together. A zero-byte nil-error read does not establish EOF.
- A Writer may return a partial count with an error; preserve both. A short nil-error write violates its contract and must not become reported completion. Writers neither retain nor modify the input buffer.
- io.WriteString uses StringWriter when implemented, otherwise one Write call. That dispatch does not guarantee zero allocation for every sink or compiler.
- io.Copy prefers source WriterTo, then destination ReaderFrom. CopyBuffer can bypass its supplied buffer through those paths; choose measurements that exercise the actual destination and ownership.

### HTTP baseline

- Prefer the owned `net/http` baseline when evaluating a new transport or router. Separate routing convenience from protocol configuration and application policy.
- Own an explicit `http.Server`. Set header, request, response and idle budgets appropriate to normal requests and streams. Apply body limits before binding or buffering.
- Reuse an explicitly configured `Transport` and client. Close response bodies, bound reads and redirects, and set per-request deadlines with protocol-specific behavior verified.
- Verify negotiated HTTP/2 with the actual listener, TLS/ALPN and proxy. Enable cleartext HTTP/2 only where the topology calls for it. Exercise stream concurrency, header/window budgets and slow readers under load.
- Direct ServeHTTP with a request/recorder exercises handler behavior, not protocol negotiation. A TLS test server must enable HTTP/2 before startup and assert the negotiated response protocol; deployment evidence still follows the real proxy/listener topology.
- Stop admission and call bounded `Server.Shutdown`. Own hijacked/upgraded connection shutdown and background workers separately.

### Allocation and production memory

- Compare allocation rate, live heap, RSS and CPU before tuning GC. Profile heap in-use and allocation sites separately, and use mutex/block/trace samples only when they answer a question.
- Use bounded preallocation and reuse where the profile shows real allocation cost. Pooled objects can vanish at collection and may retain backing buffers; never use a pool for correctness storage. Clear references, zero reusable secret buffers and exclude oversized objects.
- `GOMEMLIMIT` is a soft runtime budget, not a cap on every native allocation or process byte. Leave deployment headroom and observe GC CPU and tail latency near the limit. `GOGC` trades memory for GC work.
- Use escape analysis to explain an observed hot allocation. Maintain clear code when eliminating the allocation has no service impact.
- A subslice retains its backing allocation. slices.Clip restricts capacity without detaching it; copy the required range when its longer lifetime otherwise retains excessive memory. slices.Clone copies elements shallowly, not their referenced data.
- An append-style API returns a new slice header. The caller must retain it: the original header length does not change, while reused backing storage is visible to aliases. State prefix preservation, spare-capacity mutation and growth ownership explicitly; sufficient capacity can avoid growth but does not by itself establish every caller allocation.
- Slice deletion/reuse must release obsolete references as well as shorten logical length. Preserve intentional aliasing and mutation behavior when replacing a slice operation.
- Use representative CPU profiles for PGO and validate on held-out work. Keep benchmarks, build profile and environment reproducible.

### Platform and build boundaries

- Build for explicit GOOS/GOARCH and CPU baselines across Linux, macOS and Windows. Keep platform files/build constraints narrow and preserve equivalent public behavior.
- Cross-compilation establishes build compatibility; runtime behavior still needs the intended target. Native/cgo dependencies need the target compiler, ABI and libraries.
- Separate pure-Go production policy from instrumentation requirements: the race detector requires cgo and a supported platform/toolchain. This does not justify adding a production native dependency.
- Use filepath for host filesystem paths, path for slash-separated logical paths, and explicit argv for processes. Handle platform-specific signals, sockets, file permissions and replacement behavior through adapters.
- Keep compiler CPU requirements compatible with deployment machines; do not publish a locally tuned binary as a universal target.

### Fuzz and benchmark semantics

- Go fuzz targets are deterministic for the same input and isolated from mutable shared state. Seed replay during ordinary tests is not a fuzz exploration campaign.
- Bound input-driven allocations and work; use a simple invariant or independent oracle. Retain the minimized regression input without embedding secrets.
- With b.Loop, place setup outside the measured loop when setup is not the subject. Preserve observable work and compare repeated samples; RunParallel measures a chosen contention topology, not automatic service capacity.
- AllocsPerRun performs a warm-up and temporarily sets GOMAXPROCS to one. Keep measured work observable and input preparation outside the measured closure when preparation is not the subject. Its allocation count is neither retained bytes, RSS nor concurrent throughput; report compiler and escape conditions for a zero-allocation observation.
- Separate race/instrumentation runs from clean timing. A clean race result covers exercised interleavings, not every possible schedule.

### Deterministic asynchronous tests

- For supported toolchains, testing/synctest isolates related goroutines in a bubble with simulated time. Use it for in-process timing, cancellation and coordination rather than increasing sleeps until a test passes.
- Distinguish timer advancement from work completion; use the package's synchronization boundary before asserting completed effects.
- Real files, pipes and network I/O are not durably blocked bubble operations. Keep simulated-time contracts separate from actual I/O integration.
- A deterministic test checks the chosen schedule and invariant. It does not replace supported-target race testing, real transport behavior or overload measurements.

### Runtime upgrades and diagnostic choices

- Go 1.27 provides a goroutineleak profile for some permanently blocked goroutines. Reachability limits its detection; an empty profile cannot prove complete cleanup. Keep diagnostic endpoints private and join owned tasks explicitly.
- JSON v2 has stricter default UTF-8 and duplicate-name handling than v1. A compiler upgrade and a public codec migration are different changes; preserve the wire contract and compare malformed inputs, custom marshalers and error classification before choosing v2.
- WaitGroup.Go tracks completion without error propagation or a concurrency limit; its function must not panic. Use the selected error-group library when related work needs shared failure/cancellation semantics.

### HTTP and timer upgrade effects

- Go 1.27 HTTP/1 response-body Close attempts a bounded drain to improve connection reuse. It does not promise full consumption or business processing. Recheck obsolete manual unbounded drains and pool settings during an authorized upgrade; retain explicit body-size and request budgets.
- Header bytes and header-value count are distinct limits. Use the selected release's Server.MaxHeaderValueCount alongside the applicable byte/protocol controls; keep the consumer's accepted contract explicit.
- Go 1.27 removes the asynchronous timer-channel compatibility switch: timer channels are synchronous. Review legacy stop/drain workarounds against the selected runtime's Timer contract; a blocking drain based on an outdated assumption can hang.

## Proof

- Use table-driven cases and t.Context() where supported; the owning workspace defines test modules. Parallel tests require resource isolation and owner-authorized concurrency.
- Behavioral, static, concurrency, memory and fuzz coverage address different defects; select appropriate methods and supported targets.
- Use `b.ReportAllocs()` with the benchmark lifecycle above to expose counts and bytes alongside timing; retained heap is a separate measurement.
- The engine owns service workload and independent-consumer proof; preserve its contract when applying language-level diagnostics.

## Sources

- [Go release history](https://go.dev/doc/devel/release) · [Effective Go](https://go.dev/doc/effective_go) · [Go modules](https://go.dev/ref/mod)
- [Context](https://pkg.go.dev/context) · [net/http](https://pkg.go.dev/net/http) · [HTTP/2 controls](https://pkg.go.dev/golang.org/x/net/http2)
- [GC guide](https://go.dev/doc/gc-guide) · [Diagnostics](https://go.dev/doc/diagnostics) · [PGO](https://go.dev/blog/pgo) · [Testing](https://pkg.go.dev/testing)

[Slice capacity and copying](https://pkg.go.dev/slices).

[Target requirements](https://go.dev/wiki/MinimumRequirements) · [Race detector](https://go.dev/doc/articles/race_detector) · [Fuzz contracts](https://go.dev/doc/security/fuzz/).

[Go asynchronous testing](https://go.dev/blog/testing-time) · [synctest contract](https://pkg.go.dev/testing/synctest).

[Toolchain selection](https://go.dev/doc/toolchain) · [Append ownership](https://pkg.go.dev/builtin#append) · [Allocation observations](https://pkg.go.dev/testing#AllocsPerRun).

[Handler versus transport testing](https://pkg.go.dev/net/http/httptest).

[Go 1.27 changes](https://go.dev/doc/go1.27) · [WaitGroup.Go](https://pkg.go.dev/sync#WaitGroup.Go).

[Byte I/O and fast paths](https://pkg.go.dev/io).

[Timer lifecycle](https://pkg.go.dev/time#Timer).

## Routing

This is a terminal language skill. Return to the calling route after reading it and inspect the active workspace and package proof.
