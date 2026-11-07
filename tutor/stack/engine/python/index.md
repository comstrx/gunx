# engine/python

The creative server engine and the one in use today: a uv workspace of domain distributions under one namespace, `engine`, and a facade distribution of the same name that owns the namespace root. Sanic is its center (`library/sanic`); native cores (C, Rust, Zig, C++) carry the lifecycle wherever a measurement proves them. It is the path for clients who refuse Rust and the laboratory where ideas are born before Rust reverse-engineers them. Written in `language/python`. Gate: `uv sync --locked`, `uv run ruff check`, `uv run mypy`, `uv run pytest`, `uv run python fuzz/<file>` per target, `uv run griffe check engine -a <tag>` when a tag exists, `uv export --frozen --no-emit-project --no-emit-workspace --format requirements-txt | uv run pip-audit -r /dev/stdin --strict`.

## Layout

```
engine/python/
├── pyproject.toml        the workspace root `engine-workspace` (members = ["src/*"], depends on `engine`): the one version, every pin in [tool.uv] constraint-dependencies, ruff ALL, mypy strict, pytest
├── uv.lock  .venv/       the one lock and the one artifact of the workspace
├── src/engine/           the facade distribution `engine`: pyproject.toml (depends on every engine-<domain>; version dynamic from the root) and src/engine/__init__.py: `__path__ = extend_path(...)`, then every domain imported as an attribute
├── src/<domain>/         one member: pyproject.toml (engine-<domain>: the domains and libraries it imports, by name; version dynamic from the root)
│   └── src/engine/<domain>/  the package: __init__.py facade with __all__ and a lowercase singleton, flat files, py.typed
├── conftest.py           neutral env, test.provision(), the session app from test.application()
├── tests/                flat test_<domain>.py on engine.test, real services only; test_api.py records every `__all__`
├── benches/              flat bench_<name>.py on engine.test.Bench
└── fuzz/                 flat fuzz_<domain>.py: hypothesis strategies over the domain's parsers and verbs, run as scripts
```

Every member ships its code under its own `src/engine/<domain>/` because Python needs the import root, `engine`, inside each distribution; a member's `engine/` has no `__init__.py` (a PEP 420 portion), so `engine.hello` installs and imports alone and loads only its DAG; the facade's `engine/__init__.py` extends `__path__` over every portion (pkgutil style), so `import engine` gives `engine.hello` with every member installed.

## Laws

- **Final wrapper:** every library and every network, file, process, database, broker and model access lives here; no library type crosses a facade (the one declared raw surface is `engine.database` speaking SQLAlchemy Core).
- **Product-free:** no business rule, product name, tenant, model or migration; a test asks "would this survive deleting every product?".
- **Workspace law** (test): the facade depends on exactly every member; a member is `engine-<dir>`, ships `engine/<dir>/`, reads its version from the root (`dynamic`), and declares exactly the domains and libraries it imports, by name only; every pin lives once in the root's `constraint-dependencies`; one `.venv`, one lock.
- **Shape law** (test): a domain is one folder of flat files of 100–300 lines plus a facade with `__all__` and `py.typed`; domains form a DAG with `log` as the floor; the engine raises only `Fault`; facades export only engine or stdlib names; public verbs speak no library type.
- **One vocabulary, one error, one typing:** the verbs of `global/work`; `Fault(code, reason, message, errors)` over a closed code set; mypy strict at zero; `DateTime TimeDelta UTC Uuid Path Decimal JsonValue` defined here for every layer above; async-only I/O, CPU work through `thread.offload`.
- **Security law:** input filtered at the boundary (`validate` shapes and the rulebook), secrets redacted in every log, paths confined, uploads policed, archive bombs bounded, SSRF-safe egress (`net.Egress`: public addresses only, pinned connection, redirects re-checked), argon2id, JWT pairs with fingerprints, Fernet with rotation, tenant isolation by RLS (`blueprint.isolated`, bound per transaction, runtime role `NOSUPERUSER NOBYPASSRLS`).
- **Adapter law:** every provider is an `adapter.Adapter` with `family`, `name` and declared capabilities; an unsupported capability is a `Fault` before any I/O; a missing setting fails at construction; HTTP providers subclass `net.Remote` with one status mapping; `gateway` returns one dense normalized output plus `raw` never read by logic; a new provider is one more file.
- **Outbox and recovery:** a side effect that must survive the request is written in its transaction (`queue.durable`, `event.durable`, `broadcast.durable`), delivered at least once by the relay; dead pooled connections are replaced at checkout; a Redis outage raises typed `UNAVAILABLE`; RabbitMQ resumes; `test.Relay` cuts a real service mid-operation.
- **Model, turn, extraction, retrieval laws:** the llm layer knows no model name and routes by task; a turn is saved only after validated success; files are read by code first and return typed gaps, never invented text; a scope is a namespace, never an authorization.
- **Stage law:** `engine.test` carries the reference application, provisioning, clients, sockets, samples, relay and bench, so tests and benches need no product.

## Domains

| Layer     | Domains                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------- |
| floor     | `log error context exception fast`                                                                       |
| values    | `json parse string number array date rand`                                                               |
| mechanics | `func thread config validate crypto token adapter`                                                       |
| io        | `fs net storage assets view cache`                                                                       |
| data      | `database` (pool, migrations DSL, query, outbox, documents, RLS, provisioning)                           |
| messaging | `broker queue event schedule socket broadcast`                                                           |
| http      | `http` (the Sanic app: route DSL, binder, request, one Response, envelope, throttle, trace) `health cli` |
| providers | `mail sms gateway domain llm rag`                                                                        |
| proof     | `test`                                                                                                   |

Today: `hello`, the proof verb. The ladder is this engine's own; a domain proven here is ported to another engine by decision, when a consumer there needs it.

## How to add

- **A verb:** in its domain, a flat file, exported by the facade, pinned in the domain's test file, benched when hot.
- **A domain:** `src/<name>/pyproject.toml`, `src/<name>/src/engine/<name>/{__init__.py, py.typed, …}`, a workspace source in the root, a dependency and an import in the facade, `uv lock`, a place in the ladder.
- **A provider:** one `Adapter` subclass behind its family's manager, a log or memory implementation for tests, the real one proven against the service or its exact wire.
- **A native core:** one wrapping file in the domain, the same signature as the pure path, chosen by a measured bench on a stated machine, the pure path kept as the fallback and the reference test.

## Direction

Laravel's breadth and ease with the best measured latency in Python: every lifecycle domain several times stronger (database, cache, queue, schedule, event, socket, http), every domain a DSL, adapters for every provider family, configuration folded into settings groups, boot and warm-up as a discipline, the command line as the manual, a test DSL of its own. The database dream: one declarative file per table, a diffing migrator that plans typed operations with a safety class, expand first, backfill in resumable batches, contract in a separate run, proven on millions of rows. Everything proven here is the Rust engine's next lap.
