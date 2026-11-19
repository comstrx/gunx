# Gin

## Contract

Gin supplies Go HTTP routing, middleware and binding over net/http. Build a complete, efficient and safe HTTP boundary; the engine owns its public contracts and application semantics.

## Structure

- The integration boundary keeps `*gin.Engine`, `*gin.Context` and Gin binding/rendering types private to one HTTP owner. Consumers use owned request, response and fault contracts.
- Use the router as an `http.Handler` under an owned `http.Server` for explicit timeouts, listener and shutdown. Choose `gin.New` where logging and recovery are already owned.
- Mount groups, middleware, guards and per-route handlers through the engine contract. Keep route registration deterministic before serving and treat the built router as read-only.
- A framework decision names what the library improves, ownership of configuration, supported protocols, alternatives examined, production proof, dependency review and rollback.
- Check latest stable Gin release and Go minimum from official release/manifest sources on the day of an authorized evaluation. Check the actual resolved dependencies, feature choices and targets when developing or changing the integration.

## Rules

### Routing and binding

- Verify method/path matching, slash and case redirects, path decoding, wildcard precedence, and 404/405 semantics against the engine contract. Compare equivalent behavior with `net/http`.
- Use grouped middleware for genuine shared policy. Document which stages can short-circuit and which one finalizes the response.
- `Abort` stops later handlers. Return from the current handler as well when no more work or writes should occur.
- Apply the engine-owned status, headers and response representation. Commit a response once; prefer explicit binding errors so framework helpers cannot auto-write an incompatible 400.
- Read and validate size and media before binding. Distinguish header/body/query input and test duplicate keys, unknown fields, malformed input and streaming requests.
- Treat request and response objects as scoped. Capture immutable values for later work, use the request context for request-scoped I/O and never write through an escaped response writer.
- Gin pools its contexts. A copied context can read the required Gin values in a goroutine, but a detached job still needs an independent owner and deadline.

### Network and operations

- Configure `SetTrustedProxies(nil)` or exact CIDRs, and verify forwarding against the actual ingress. Default trust is broad and must not set the service security policy.
- Keep connection/header/body and application admission budgets in the server boundary. A router benchmark says nothing about those limits.
- Set explicit shutdown and drain behavior. Stop readiness and admission, wait for active requests within budget, and track upgraded connections separately.
- Verify TLS and HTTP/2 in the Go server and deployment. A Gin router does not decide ALPN, stream limits or intermediary behavior.
- Gin’s `RunQUIC` is a quic-go HTTP/3 shortcut with its own transport. Treat QUIC as a separate adoption decision with UDP/TLS topology, replay policy, limits and shutdown evidence.
- Map matched route templates and unmatched-route outcomes into the owning telemetry contract; confirm identical trace, auth and fault behavior between alternatives.

### Performance and integration

- Optimize the complete HTTP boundary using equivalent validation, guards, typed errors, response encoding and transport settings. Compare alternatives only with the same required behavior.
- Include static and parameter routes, overlapping methods, rejected payloads, large/streamed bodies, slow peers and a realistic downstream call.
- Record allocation rate, retained heap/RSS, p95/p99, CPU, throughput, shed/fault counts, cold boot and resource recovery. Include the exact Go build, limits, protocol and dependency versions.
- Evaluate framework lock-in, transitive vulnerabilities, build/runtime costs, incident visibility and compatibility. A meaningful product improvement can be ergonomics or correctness as well as measured capacity.

### Build, run and portability

- Gin is an http.Handler inside the selected Go server. A release-mode router and a built service are distinct from debug diagnostics; keep router mode and middleware consistent in comparisons.
- Build and run through the owning Go module on Linux, macOS and Windows. Gin does not remove platform constraints introduced by native dependencies, listeners, signals or deployment adapters.
- httptest with ServeHTTP isolates routing, binding, middleware and response behavior. Use an actual configured listener for TLS/ALPN, HTTP/2, timeouts, connection reuse and shutdown.
- A handler benchmark excludes network and worker/dependency costs. Keep it as an attribution measurement alongside the actual service workload; do not label it total server capacity.

### Binding and retained data

- Ordinary body binding consumes the stream. ShouldBindBodyWith caches the body for repeated binding; use it only when that repeated interpretation is required and include retained bytes in the request budget.
- Keep one approved decoder/validator at the integration boundary. Router convenience must not create two inconsistent validation or response-writing paths.
- Gin binding switches and its default validator are process-global configuration. Initialize them before concurrent serving; do not toggle them per request or tenant. Distinct decoding policies need explicit owned boundaries, not races over global settings.
- Context copying is not a deep clone of referenced application values. Background work receives deliberately owned immutable/copy-safe inputs, not request-scoped buffers or mutable objects by accident.
- Benchmark the configured codec, binding and middleware combination. Removing their required checks from one candidate makes the comparison invalid.

### Decoder acceptance

- Gin 1.12's JSON binder performs one Decode followed by validation. DisallowUnknownFields rejects unmatched struct fields; it does not enforce end-of-body after the first value. If the wire contract accepts exactly one JSON value, enforce trailing-whitespace-only completion at the owning decoder boundary under its byte/deadline limits.
- Do not confuse MaxMultipartMemory with a total upload limit: it governs multipart buffering and spill behavior. Enforce the actual request limit before parsing, account for temporary files and release them with the request owner.
- Include a valid value followed by a second value, trailing garbage, oversized multipart content and cleanup failures when examining the corresponding boundary. Avoid a second parser with different acceptance rules merely to add a check.

## Proof

- Exercise unit tests on routing and binding plus real-wire tests for deadlines, forward headers, malformed/oversized input, method handling, HTTP/2 and graceful drain.
- Race-test goroutine lifetimes and repeated requests after context reuse. Prove downstream cancellation and owned job shutdown.
- Audit dependency graph, license, release health and reachable vulnerabilities. Test consumer wiring without Gin imports.
- Retain comparable benchmark inputs and samples. Keep no-op routing microbenchmarks separate from whole-backend behavior.

## Sources

- [Gin stable release](https://github.com/gin-gonic/gin/releases/latest) · [Gin upstream source](https://github.com/gin-gonic/gin) · [Gin API](https://pkg.go.dev/github.com/gin-gonic/gin)
- [Gin context lifetime](https://pkg.go.dev/github.com/gin-gonic/gin#Context.Copy) · [Proxy trust](https://pkg.go.dev/github.com/gin-gonic/gin#Engine.SetTrustedProxies) · [RunQUIC](https://pkg.go.dev/github.com/gin-gonic/gin#Engine.RunQUIC)
- [Go net/http](https://pkg.go.dev/net/http) · [quic-go](https://github.com/quic-go/quic-go)

[Gin HTTP tests](https://gin-gonic.com/en/docs/testing/) · [Deployment modes](https://gin-gonic.com/en/docs/deployment/).

[Repeated body binding](https://gin-gonic.com/en/docs/binding/bind-body-into-different-structs/) · [Global configuration ownership](https://github.com/gin-gonic/gin/blob/master/mode.go).

[Gin 1.12 JSON binder](https://github.com/gin-gonic/gin/blob/v1.12.0/binding/json.go).

[Upload limits](https://gin-gonic.com/en/docs/routing/upload-file/limit-bytes/).

[Multipart buffering](https://gin-gonic.com/en/docs/routing/upload-file/).

## Routing

Read the [language dispatcher](../../lang/index.md) with Go selected. Return to the owning engine or part after language study. Library knowledge guides correct use without importing product policy.
