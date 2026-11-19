# Sanic

## Contract

Own Sanic server, routing, listener and streaming mechanics. The engine owns its wrapper classes, public DSL, middleware policy and compatibility edges.

## Structure

A Sanic application registers routes, middleware, listeners and optional Blueprints. Register its plan before serving.
Framework request and response objects belong inside the engine's integration boundary; that engine owns any approved exposure.

## Rules

### Worker lifecycle

- The upstream worker manager defaults to spawn; inspect the selected integration's actual start method and server mode.
- Python knowledge owns process and resource semantics. Worker-local listeners acquire resources after worker startup, never as import-time side effects.
- Distinguish manager acknowledgements from application readiness and supervisor startup deadlines. Diagnose slow import, dependency readiness and startup failure separately.
- Inspect effective USE_UVLOOP and TOUCHUP settings after the selected startup path applies its configuration. An initial config value or embedded fixture does not establish the production worker-manager setting; use the pinned release's supported behavior.
- Sanic listeners integrate startup and shutdown with the owning application's lifecycle. Verify startup failure and bounded drain in each supported serving mode.
- For dependency updates, check Sanic release/migration notes, target Python compatibility, wheels and event-loop integration. General dependency policy remains in root architecture.

### Request and connection controls

- Use the pinned Sanic configuration for request/header bytes, request/response time, keep-alive, shutdown and WebSocket message limits.
- Map effective proxy, framework and decoder ceilings; check chunked, absent-length, incremental and disconnected inputs on the wire.
- Handler admission does not limit every accepted connection, streaming response or WebSocket. The integration must account for those separately.
- Explicit streaming input needs decoded-byte, part and duration bounds. A normal buffered handler is not a streaming-input contract.
- Await response writes; close producers after disconnect and observe slow-reader retention. SSE and sockets need finite ownership and shutdown behavior.
- Stop readiness and new work before drain, within the deployment budget. Check the close behavior of held connections.
- Route outbound client work through its owning network capability; this server library does not own client pools.

### Routing and middleware dispatch

- Register paths, methods, converters and stable route metadata before serving. Preserve matching and URL-generation semantics when changing converters or wrappers; request-time introspection is not a substitute for a registered plan.
- Route context stores route configuration shared by its requests. Keep request-specific identity and mutable processing state in request context.
- At equal default priority, request middleware follows registration order and response middleware runs in reverse. Explicit priorities change ordering; inspect the resulting chain when composing application and Blueprint middleware.
- Returning a response can short-circuit the handler or remaining middleware. Exercise normal results, early responses and exceptions separately; do not assume every cleanup or response hook runs on every path.

### Request representation

- request.args.get selects the first value; getlist preserves repeated values. A wrapper must deliberately preserve or reject multiplicity and distinguish an absent key from an empty value before coercion.
- request.body exposes bytes; request.json exposes parsed JSON, while form/files have their own parsed representations. Select the representation the owning decoder needs rather than parsing and re-encoding through several forms. Media policy and typed validation belong to the integration contract.

### Response encoding

- raw accepts already-encoded bytes; JSON helpers serialize values. Preserve the selected media type and body semantics when avoiding a second encoding; encoded JSON passed as a string is a different value.
- Keep HTTPResponse headers, cookies and transport attachment request-owned. Reuse an immutable prepared body where valid, not a mutable response instance across concurrent requests.

### Context ownership

- `request.ctx` is request-scoped; `app.ctx` belongs to the application instance. Never store current-user or current-tenant state in application context.
- `request.conn_info.ctx` spans requests on a connection. Proxies can reuse that connection for different users; connection context is not an authenticated-user store.
- `app.shared_ctx` carries explicitly shareable process primitives among workers of one manager; assigning an ordinary dict/list does not make it shared, and it does not coordinate separate machines. Register such primitives in the supported main-process listener.

### Framework boundary

- Verify routing, middleware short-circuits and error-handler behavior against the owning engine's policy; preserve status and headers on early exits.
- Configure proxy trust, CORS and request-ID validation deliberately. Check singleton headers and required 401/405/429 semantics.
- Convert framework exceptions at the integration boundary without exposing framework diagnostics to clients.
- Derive telemetry route identity from the matched route and an explicit unmatched-route category, applying root architecture’s observability contract.
- Sanic accepts synchronous handlers but does not automatically make their blocking work nonblocking. Route unavoidable blocking operations through the engine execution owner; declaring a handler async does not offload its synchronous calls.

### Run modes and platforms

- Development reloading/debugging, single-process serving, worker-manager serving and ASGI deployment have different lifecycle and transport owners. State the mode being configured or measured.
- Support Linux, macOS and Windows through the selected Python, event loop and dependencies. uvloop is unavailable on Windows; use a supported loop without pretending identical platform internals.
- In ASGI mode the ASGI server owns WebSocket transport and its limits; Sanic's native WebSocket configuration does not establish those guarantees. Verify the reduced lifespan mapping and cleanup.
- Never benchmark debug/reloader behavior as production performance. Compare worker counts and loop choices with equal middleware, limits, payloads and downstream behavior.

### Test-client selection

- SanicTestClient drives the real server but may restart it per request. ReusableClient keeps that server alive under an explicit lifecycle for reuse, retained-state and steady-state questions.
- SanicASGITestClient reaches handlers through ASGI; it does not establish native socket limits, parser behavior, worker startup or deployment drain.
- Keep request/response fixtures isolated and close app resources. Worker-manager changes need that serving mode's evidence; an embedded or persistent client does not establish its process topology.

### Streaming completion

- A request-stream read yields chunks, not application records. Decode incremental text/framing safely across chunk boundaries, with bounded accumulation.
- Decide pre-commit errors before headers; a post-commit failure cannot become a second ordinary JSON response. End completed streams through the supported termination operation: native serving may close on handler return, while ASGI requires explicit termination. Release the producer even when sending fails.

## Proof

Cover affected startup modes, listener cleanup, readiness, drain and port release.
Exercise malformed/oversized requests, duplicate headers, media handling, preflight, throttling and error/middleware order.
Include keep-alive, streamed data, slow peers, disconnect and upgrade closure under the same configured semantics.
Measure the actual server topology; an embedded fixture and worker-manager deployment establish different evidence. Compare dispatch, binding, middleware and encoding costs with equal response bytes and policies, then include the real downstream workload; a fast empty route establishes only its own path.

## Sources

[Worker manager](https://sanic.dev/en/guide/running/manager.html) · [Listeners](https://sanic.dev/en/guide/basics/listeners.html) · [Configuration](https://sanic.dev/en/guide/running/configuration.html) · [Streaming](https://sanic.dev/en/guide/advanced/streaming.html) · [Releases](https://github.com/sanic-org/sanic/releases).

[Request and connection context](https://sanic.dev/en/guide/basics/request.html).

[Test clients](https://sanic.dev/en/plugins/sanic-testing/clients.html) · [Serving modes](https://sanic.dev/en/guide/running/running.html).

[Stream lifecycle](https://sanic.dev/en/guide/advanced/streaming.html#response-streaming).

[Handler execution](https://sanic.dev/en/guide/basics/handlers.html).

[Route registration and context](https://sanic.dev/en/guide/basics/routing.html) · [Middleware ordering and early returns](https://sanic.dev/en/guide/basics/middleware.html).

[Response encoders](https://sanic.dev/en/guide/basics/response.html) · [Response object lifecycle](https://sanic.dev/api/sanic.response.html).

## Routing

Read [languages](../../lang/index.md) with Python selected, then return to the caller.
