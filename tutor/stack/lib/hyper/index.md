# Hyper

## Contract

Hyper supplies Rust HTTP/1 and HTTP/2 transport. Develop the complete transport boundary with explicit resource and lifecycle contracts; the engine owns routing, API envelopes, typed faults and application policy.

## Structure

- Design one HTTP server boundary over Hyper. Keep Hyper, `http`, body and runtime integration types private; expose the smallest engine-owned request, response and stream contracts.
- Separate request routing/decoding, handler invocation, response rendering and transport concerns. Introduce each piece when the first supported contract needs it.
- Use an explicitly configured listener, runtime and connection manager. Tokio and `hyper-util` adapters can provide I/O, auto protocol serving and graceful connection tracking.
- Keep outbound pooling, connect/deadline policy and trusted egress with their owning network boundary.
- Evaluate crate versions and exact features from upstream releases, Cargo metadata and the lock. Audit h2/TLS/QUIC transitive dependencies, features and platform support before admitting them.
- Prefer a portable Tokio baseline. Thread-per-core, per-core listeners and `SO_REUSEPORT` require measured benefit and portability proof for the deployment.

## Rules

### Admission, deadlines and buffers

- Bound accepted connections, pending work, in-flight requests, body bytes and stream buffers separately. Budget them across workers and downstream pools.
- Set header read, request/body, write or idle, keep-alive and shutdown deadlines by route class. Hyper builder controls and application deadline scopes solve different parts of the budget.
- Consume body frames incrementally. Wrap accumulation in `http_body_util::Limited` or an equivalent cumulative ceiling before collecting. Validate declared size early and enforce the running byte count regardless.
- Keep decompression, multipart limits, field counts, JSON depth and stream semantics explicit where enabled. A network-frame limit alone leaves decoded sizes unbounded.
- Respect downstream backpressure while sending. Release retained buffers and close producers on cancellation; test early return and connection reuse for each supported protocol.
- Put CPU-bound work on the engine’s bounded lane. Admission and body limits precede expensive decoding and worker submission.

### HTTP/2 and TLS

- Configure explicit concurrent stream, header-list, frame, local/pending reset, send-buffer and keep-alive budgets. Builder defaults can change across releases.
- Interpret each builder option separately: `None` can preserve a window setting, remove a stream/reset ceiling, or disable keep-alive. It is not a uniform safe default. Keep-alive timeout is ineffective without its interval; provide the required runtime timer.
- The HTTP/2 send-buffer ceiling is per stream. Include concurrent streams and connections when deriving the deployment memory budget; it is not a total connection cap.
- Set stream and connection flow-control windows from observed memory and throughput needs. Adaptive windows supersede fixed initial windows.
- Enforce application-level concurrency across connections as well as protocol stream counts. Test stream reset, slow readers and multiplexing with a shared connection.
- Flow-control windows govern DATA, not all control/header work. Keep parsing and reset-abuse budgets explicit in the pinned transport; never advertise a flow window as a total memory cap.
- Verify negotiated ALPN and actual intermediary behavior. Distinguish h2 over TLS and any intentionally permitted prior-knowledge cleartext path.
- Keep credentials, TLS policy and certificate lifecycle in the owning configuration. Use the vetted TLS stack for the chosen deployment and respect existing dependency bans.
- Turn down readiness and new admission before draining connection futures. A graceful watcher needs a caller deadline; sockets, upgrades and background tasks need their own join or close path.

### HTTP/3 and outbound

- Hyper’s upstream supports h1/h2. Its sibling `h3` project implements HTTP/3 over a separate QUIC transport and explicitly identifies its maturity as experimental.
- Require a product need before evaluating native QUIC or edge termination. Record UDP/network topology, fallback, TLS, connection/stream limits, drain semantics and observability.
- Govern replay for early data before permitting unsafe methods. Preserve the application’s idempotency and write semantics through the edge.
- Pool outbound connections with explicit limits and deadline policy. Revalidate every redirect and actual destination, redact secrets, and withhold credentials across origins.
- Own responses, errors and route labels above the transport. A protocol change should preserve the caller’s application contract.

### Runtime and platform integration

- Select the needed client/server and protocol features explicitly. HTTP transport, runtime adaptation, TLS and application routing are separate integrations; enabling one does not configure the others.
- Support Linux, macOS and Windows through the runtime, socket and TLS adapters. Keep platform-specific socket optimizations optional with equivalent portable semantics.
- Build the actual selected feature set and inspect its dependency closure. A successful build does not prove ALPN, protocol selection or resource controls.
- A service-function test excludes the connection driver. Transport proof must drive real connection futures, including resets, dropped bodies, unread responses and graceful shutdown.
- Benchmark parser/service work separately from complete TLS and multiplexed connections. Count all active connections, streams and retained body buffers when interpreting memory.

### Body ownership

- Polling body frames drives progress and backpressure. Bound a bridge queue when a producer and transport run independently; merely exposing a stream type does not bound it.
- Preserve declared trailer behavior and enforce cumulative payload limits while consuming frames. A size hint is not a substitute for the actual byte ceiling.
- Collect only a deliberately bounded body. Early rejection and dropped/unfinished bodies need protocol-specific connection-reuse/reset behavior, not an unconditional unbounded drain.
- Once response headers are committed, later errors follow the streaming/transport contract. Keep the engine's pre-commit fault renderer separate from that path.

### Connection progress

- A low-level client handshake returns a request sender and a Connection future. The connection must keep being polled to drive protocol progress; retaining only the sender does not run it.
- Assign the connection future an owner that observes failures and shutdown. Receiving response headers does not establish body completion; release or consume the body according to the owned pool and cancellation contract.
- Attribute a stalled request to connection driving, body consumption, flow control or downstream work before changing buffer/window sizes. A larger window cannot repair an undriven connection.

## Proof

- Assert the transport and facade dependency boundary with existing workspace graph and surface checks. Review features and provenance before adding the dependency.
- Test real socket behavior over every claimed protocol: ALPN, framing, body ceilings, disconnects, reuse, stalled bodies, overload, bounded drain and upgrade closure.
- Fuzz any custom parsing or routing and preserve the smallest reproduction as a contract test. Check bounded memory and time on adverse input.
- Compare protocol and runtime choices on the same handlers, limits and traffic. Report p50/p95/p99, throughput, errors, shed counts, retained bytes and CPU in a reproducible profile.
- Treat HTTP/3 availability as deployment proof. Measure loss/fallback and verify the wire, resource and lifecycle contract before exposing it to callers.

## Sources

- [Hyper releases](https://github.com/hyperium/hyper/releases) · [Supported protocols](https://hyper.rs/) · [HTTP/1 builder](https://docs.rs/hyper/latest/hyper/server/conn/http1/struct.Builder.html)
- [HTTP/2 builder](https://docs.rs/hyper/latest/hyper/server/conn/http2/struct.Builder.html) · [Limited body](https://docs.rs/http-body-util/latest/http_body_util/struct.Limited.html) · [Graceful connections](https://docs.rs/hyper-util/latest/hyper_util/server/graceful/struct.GracefulShutdown.html)
- [Hyperium h3](https://github.com/hyperium/h3) · [HTTP/3 specification](https://datatracker.ietf.org/doc/html/rfc9114)

[Hyper features](https://docs.rs/hyper/latest/hyper/#optional-features) · [Runtime adaptation](https://docs.rs/hyper-util/latest/hyper_util/rt/index.html).

[Hyper body frames](https://docs.rs/hyper/latest/hyper/body/) · [Limited body implementation](https://docs.rs/crate/http-body-util/latest/source/src/limited.rs).

[Low-level client connection ownership](https://hyper.rs/guides/1/client/basic/).

## Routing

Read the [language dispatcher](../../lang/index.md) with Rust selected. Return to the owning engine or part after the language skill and inspect the pinned manifests and proofs.
