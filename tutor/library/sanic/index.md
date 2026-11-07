# Sanic

Status: not in `engine/python` yet; this file governs the day `engine.http` lands.

The HTTP framework of `engine/python`, owned by one domain, `engine.http`, and seen by nobody else. Every Python `api` is a Sanic application built by the engine; Sanic's `Sanic`, `Request`, `HTTPResponse`, `Blueprint` and `Config` types never cross the facade.

## Owner

| Concern                         | Engine home                   | Sanic underneath                                               |
| ------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| application, workers, lifecycle | `http.create`, `http.serve`   | `Sanic(name)`, the worker manager, `before_server_start`       |
| routes, groups, params, guards  | `http.Router` (the route DSL) | `app.add_route`, blueprints only inside the engine             |
| request, binder, validation     | `http.Request`, `http.bind`   | `sanic.Request` read once into engine values                   |
| one response, the envelope      | `http.Response`               | `HTTPResponse` with the envelope of `global/work`              |
| throttle, trace, idempotency    | `http` middlewares            | request and response middleware registered by the engine       |
| websockets                      | `socket`                      | Sanic's websocket route behind the engine's frames             |
| errors                          | `http` exception handler      | one handler rendering `Fault`; no Sanic error reaches a client |

## Laws

- **Final wrapper:** a handler receives `http.Request` and returns `http.Response` or raises `Fault`; a status, a header or a body is never written by hand above the engine; `http.Response` is the only constructor of an answer (`ok created accepted empty page fail stream file`).
- **Workers:** Sanic's own worker manager, one process per core by default, `uvloop`, `orjson` as the serializer, access logs off (the engine's `trace` replaces them); `single_process` only in tests.
- **Binder:** path, query, headers, cookies and body are bound into one typed shape per route through the engine's `validate`; an unknown field is refused; a body ceiling per route class; multipart through the engine's upload policy.
- **Lifecycle:** `setup` of every domain in `before_server_start` through the application's registry; `close` in `after_server_stop`; nothing opens a connection at import time.
- **Middleware order:** `trace` first (request id, locale, actor), then `throttle`, `idempotent`, `cacheable`, the route, then the response middleware that stamps `X-Request-Id` and security headers; the order is a tuple in one file and a test pins it.
- **Streaming:** server-sent events and ndjson through `http.Response.stream`, chunked, with a heartbeat and a client-disconnect check; a websocket is a `socket` channel.
- **Client:** outbound HTTP is `net`, never Sanic; the same egress, timeout, retry and breaker laws as `library/hyper`.

## Traps

- Sanic reads a body lazily: a handler that returns before `await request.body` leaves the stream; the binder always drains or refuses by size first.
- `app.config` is global and mutable: the engine writes it once in `create` and never reads it afterward; settings live in the engine's `config`.
- Blueprint groups copy middleware on registration; a middleware added after a blueprint is attached does not reach it, so the engine registers in a fixed order.
- A sync handler blocks the loop; every handler is `async`; CPU work goes through `thread.offload`.
- Sanic's own `json` response uses the stdlib unless the serializer is set; the engine sets `orjson` once in `create`.

## Direction

Laravel's route ergonomics on Sanic's speed: groups, names, guards, limits, constraints and generated OpenAPI from the same declarations, the route DSL of `stack/engine/python`.
