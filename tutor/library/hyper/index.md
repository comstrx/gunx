# hyper

Status: not in `engine/rust` yet; this file governs the day `engine-http` lands.

The HTTP library of `engine/rust`: hyper 1 over tokio, owned by one crate, `engine-http`, and seen by nobody else. Every Rust `api` and every binary that serves or calls HTTP goes through the engine's `http` DSL; `hyper`, `http`, `http-body`, `tower` and `hyper-util` types never cross the facade.

## Owner

| Concern                             | Engine home                        | Library underneath                                         |
| ----------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| server, listener, graceful shutdown | `http::Server`                     | hyper 1 server with `hyper-util` builders, h1 and h2       |
| request, response, body, headers    | `http::{Request, Response, Body}`  | `http` and `http-body` behind engine types                 |
| routing, params, groups, guards     | `http::Router`                     | the engine's own radix router, never a framework           |
| client, pools, timeouts, retries    | `http::Client` (in `net`)          | hyper client through `hyper-util` legacy connector, rustls |
| TLS                                 | `http::Tls` (when a product needs) | rustls with ring, no openssl                               |
| websockets                          | `socket`                           | `tokio-tungstenite` behind the engine's frames             |

One library enters through one file; a second HTTP stack (axum, actix, reqwest) is refused by cargo-deny bans.

## Laws

- **Final wrapper:** a handler receives `http::Request` and returns `Result<http::Response, Fault>`; the envelope of `global/work` is built once in `http::Response`; a `Fault` renders itself through its code's status; a status or a body is never written by hand above the engine.
- **Runtime:** thread-per-core, one listener per core with `SO_REUSEPORT`, a bounded accept loop, per-connection and per-request timeouts (`header`, `body`, `idle`), a body size ceiling per route class, backpressure by a semaphore on in-flight requests; `429` carries `Retry-After`.
- **Shutdown:** `SIGTERM` stops accepting, drains in-flight within a window, then closes; a deploy relies on this.
- **Body:** streaming by default; `Body::bytes(limit)` collects with a ceiling; multipart parsed by the engine's parser with per-part size and count limits; JSON through the engine's `json` with a depth and size ceiling.
- **Headers:** `X-Request-Id` read or minted first and carried into every log line and every outbound call; `X-Forwarded-For` honored only through configured proxies; security headers from one table; no header name written as a string outside `http::Header`.
- **Client:** every outbound call names a timeout, a retry policy (idempotent methods only) and a breaker; egress is SSRF-safe (public addresses only, the vetted address pinned, redirects re-checked); credentials never cross hosts; the request id and locale propagate.
- **Observability:** one `trace` per request (route, status, duration, bytes), metrics by route class, never by raw path.

## Traps

- hyper 1 has no router, no middleware and no extractors: the engine owns all three, which is the point; do not pull tower layers to fill the gap.
- `Incoming` bodies must be polled to completion or dropped: a handler that returns early leaks the connection's flow window; the engine's `Body` drop handles it, hand-rolled bodies do not.
- h2 needs the `http2` builder with explicit window and stream limits; defaults invite a slowloris.
- A `spawn_blocking` inside a handler without a limit exhausts the blocking pool under load; CPU work goes through the engine's bounded offload.

## Direction

The server and client of RustX: the fastest measured latency of any Rust HTTP stack on a stated machine, the route DSL of `stack/engine/rust`.
