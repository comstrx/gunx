# Sanic

Status: Sanic 25.12 under the Python engine's `http` domain; every Python api service is an `http.App`.

The HTTP framework of the Python engine, owned by one domain, `http`, and seen by nobody else: `Sanic`, `HTTPResponse`, `Blueprint` and `Config` never cross the facade, and a service's lint refuses `sanic` outright.

## Owner

| Concern                         | Engine home                                    | Sanic underneath                                                       |
| ------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| application, workers, lifecycle | `app.py`: `App`, `seal`, `serve`               | `Sanic(name)`, `before_server_start`, `after_server_stop`, `run`       |
| routes, groups, params, guards  | `route.py` `group.py` `router.py`              | `add_route` with one wrapper per route at `seal`; blueprints never     |
| request, binder, validation     | `Request` (a `sanic.Request`), `Binder`        | `request_class=Request`; the binder reads the signature once           |
| one answer, the envelope        | `Response` builds, `Answer` annotates          | `HTTPResponse` and `ResponseStream`, bodies encoded by the engine      |
| trace, throttle, CORS, headers  | `edge.py`: `Edge`; `throttle.py`: `Throttle`   | `on_request`, `on_response`; the onion runs inside the route wrapper   |
| websockets                      | `channel.py`: `Channel` over the socket domain | `add_websocket_route`, guards run in `trace` before the upgrade        |
| errors                          | `App.render`, the exception domain             | one `exception(Exception)`; a `SanicException` becomes a `Fault` first |
| documentation                   | `/openapi.json` from the routes (`Docs`)       | one plain route, hidden routes left out                                |

## Laws

- **One answer:** a handler receives `http.Request` and returns an `http.Answer` built by `http.Response` (`ok created accepted empty page fail problem json text html raw redirect file stream sse`), plain data (wrapped by `Response.ok`) or `None` (204), or raises `Fault`; a status, a header or a body is never written by hand above the engine.
- **Workers:** `serve(host, port, workers)`: one worker runs `single_process`, more run Sanic's worker manager; `uvloop` and `TOUCHUP` only in `serve`; access logs, motd and auto-extend off; the service's settings choose the count.
- **Binder:** each parameter is bound by name and annotation: `request`, a path parameter coerced through `parse` (`int float bool`), a `validate.Shape` decoded once from the body (msgspec, unknown fields refused), any other required name from the query; a missing or bad one is `VALIDATION` with `http.param`; a shape on a non-JSON body is `UNSUPPORTED_MEDIA` with `http.media`; one body ceiling per application (`Limits.body_bytes`), header, timeout, keep-alive, shutdown and frame limits beside it.
- **Lifecycle:** `App.lifecycle(*factories)` enters async context managers in `before_server_start` through one `AsyncExitStack` and closes them in reverse in `after_server_stop`; nothing opens a connection at import time; `ready` flips only after every factory entered; `seal()` adds every route once before `listen` or `serve`, and a later `mount` is `http.sealed`; `down(retry)` answers 503 with `Retry-After` beside the probes and `/ready` fails while draining or down.
- **Phases:** `trace → down → preflight → actor → throttle → guards → middleware → handler → render → stamp`, recorded in `App.describe()["phases"]`. `trace` takes or mints the request id (64 alphanumeric characters at most), refuses duplicated `Authorization`, `Content-Length` and `Host`, answers 503 while `down`, answers a CORS preflight, reads the bearer into the actor and runs socket guards; `stamp` writes `X-Request-Id`, the security headers, the rate-limit limit and remainder and the CORS headers for an allowed origin, then flushes deferred context work; a 401 carries `WWW-Authenticate: Bearer`, a 405 `Allow`, a 429 `Retry-After` and `X-RateLimit-Limit`.
- **CORS:** origins are an allowlist given to `App(origins=…)`; a preflight from an allowed origin gets 204 with fixed methods, headers and a 600-second age; any other origin gets `FORBIDDEN` with `http.origin`; `*` echoes the origin and no answer allows credentials (bearer tokens, never cookies).
- **Errors:** one handler maps and reports once (a `SanicException` becomes a `Fault` first), then the nearest renderer by class answers, or `Response.fail`; a 5xx shows only the code's message.
- **Streaming:** server-sent events and byte streams through `Response.stream` (chunked) and `Response.sse` (a `retry` frame, `no-cache`, `X-Accel-Buffering: no`); a websocket is a channel of the engine's socket domain, guarded before the upgrade.
- **Client:** outbound HTTP is the engine's `net`, never Sanic or aiohttp directly.

## Traps

- One Sanic name per process: a second `Sanic("x")` raises; the engine names each app `<name>_<n>` from a counter.
- A router finalizes once: `seal()` adds every route once, and `listen()` resets `router` and `signal_router` after stop, so a test can serve the same app twice.
- Keep-alive clients hold `after_server_stop` until their timeout: `listen()` closes idle clients before `close()`, which took a test suite from 32 s to 1 s.
- `app.config` is global and mutable: the engine writes it once in `_configure_` and in `serve`, and settings live in the engine's `config`.
- A sync handler blocks the loop; every handler is `async`; CPU work goes through the thread offload.
- Sanic's own `json()` uses its default dumps; the engine never calls it: every body is encoded by the engine's `json` inside `Response`.

## Direction

Per-route body ceilings and multipart through the upload policy are the next laws to land.
