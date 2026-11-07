# api

`product/<project>/api` is a product's backend: a workspace of services, each a Laravel-shaped application over `engine/rust` or `engine/python` (the client's choice, named by the workspace manifest; nothing else about the product changes). Microservices by default, DOMA: a `gateway`, an `iam`, and one service per business domain, a domain owning every table that serves one business logic (never a service per table), meeting through one contract. A monolith only when the client asks for it in so many words, and then it is the same layers in one service. Gate: the engine's gate per service plus its bootstrap check; journeys on real services on demand.

## Layout

```
product/<project>/api/
├── contract/        the shared vocabulary: service names and layers, roles and audiences, reasons in both languages, topology law
├── gateway/         the one external door: public and admin route allowlists, trusted context, edge limits, proxying, the gathered OpenAPI
├── iam/             accounts, roles, grants, sessions, verification: the first service every other one trusts
├── <service>/       app/{enums, dna, cycle, models, repositories, services, controllers, middlewares, requests, resources, mails, jobs, events, listeners}
│                    bootstrap/  config/ (topology among them)  database/{migrations, seeders}  routes/{api, channel, events, schedule}  views/  tests/  benches/
├── journey/         end-to-end journeys over the real services, both paths
└── run.sh           the stack for a slot: services, relays, workers, the gateway's gathered document (calls engine/infra)
```

## Laws

- **Topology:** every service names its layer; calls go to a smaller layer, committed events go to a larger one; no cross-service SQL, model import or foreign key; every boundary states actor, scope, input and output shape, expected revision, idempotency identity and failure meaning in `config/topology`; no unused wildcard access; events are named `<producer>.<fact>`.
- **One owner:** one service owns each responsibility and its database; money has one owner, in integer minor units on a balanced immutable ledger; a new offering, worker or model server never creates a new service.
- **Gravity:** controller one or two lines over a service; service a readable pipeline over repositories and engine verbs; repository one query chain per function; model a thin declaration; `dna` is what a model inherits so it is born knowing fillables, relations, morphs, search, permissions, attachments and media over the engine and its siblings; `cycle` holds the lifecycle bases. When a layer needs more, the more is an engine verb.
- **Import law** (test): layers import only the engine and the service; above the engine no third-party library and no stdlib beyond typing and data classes; the unified types and verbs come from the engine.
- **Migrations:** one file per table with all its constraints and indexes, forward only, no `down`; before production a table's own file is rewritten, never patched; a constraint for every invariant, partial uniques for live rows, an index on every reference, filter and sort a real query uses and none a query does not; timestamptz, jsonb where it earns its place, exact money.
- **Reads and writes:** no N+1; bounded lists with cursors where tables grow; selected columns on hot paths; cache with a key, TTL and invalidation and stampede protection; short transactions with no network call inside; business mutation and outbox in one local transaction; idempotency on every unsafe retried call; uniqueness races settled by the database; `skip locked` for claims.
- **Security:** actor and scope from trusted context; no IDOR, mass assignment or enumeration; a rate limit that fits each route class; signed webhooks; masked secrets; internal doors stay internal; the api is reachable only from the edge.
- **Reliability:** bounded timeouts, retries and breakers on every peer call; handlers safe for duplicates and disorder; scanners for what a crash leaves; no state leaking between requests or jobs.
- **Contract:** generated OpenAPI truthful for every route, gathered at the gateway per audience; every reason with its code and both languages; the envelope of `global/work`.
- **Providers:** every external provider is an engine adapter with a mock or sandbox; a product may ship on mocks until its first full release by the owner's word (`global/work`).
- **Proof:** tests of the normal and the dangerous path on real services with exact values; races where money, stock or uniqueness are at stake; journeys walk every business path through the real stack.

## How to add

- **A service:** from the skeleton (cycle, bases, configs, outbox and inbox migrations, routes, health and spec tests), a row in `contract`, a layer, its topology, a database of its own.
- **A feature:** enum → migration → model → repository → service → controller → request and resource → route → test → bench when hot → the surfaces' `reply.md` when a contract changed.
- **An engine capability:** never here; in the engine with its test, then consumed in one line.

## Direction

Laravel's shape, thinner than Laravel, over an engine that carries responses, faults, contracts and the whole lifecycle: a `bootstrap/` that is the only wiring point, a `config/` of settings groups, a command line as the manual, declarative tables when the engine's migrator lands, and services that an engineer of the framework reads at first sight. The same layers in Rust and Python, so a product can change language without changing shape.
