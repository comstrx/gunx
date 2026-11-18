# ✨ Python Engine

[![Python](https://img.shields.io/badge/Python-Backend_Engineering-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **Fifty Domains. One Vocabulary. Zero Glue Code.**

A Python foundation engineered to carry a complete backend, from the **first byte of a request to the last retry of a background job**, under one consistent language of types, faults, and verbs.

**Stop wiring libraries together. Start writing the product.**

---

## 🎯 Overview

**One engineering philosophy. Every capability. Total control.**

A serious backend needs HTTP, SQL, caching, queues, events, storage, search, cryptography, mail, payments, and a dozen things more. Each arrives as an excellent library with its own names, its own errors, its own configuration, and its own idea of a lifecycle. The product then pays for the glue forever.

Python Engine removes the glue. Fifty domains live in one workspace, each a package of its own, and all of them answer through one namespace, raise one kind of fault, read one kind of settings, and are proven by the same three files: a test, a benchmark, and a fuzz target.

The libraries underneath are the best of the ecosystem. What changes is that a service no longer imports them: **it imports the engine, and the engine keeps its promises.**

---

## 📦 Download

**One repository. One tag per release. One line per domain.**

Every domain is its own distribution inside this repository, so a service names only what it imports:

```toml
[project]
dependencies = ["engine", "engine-cache", "engine-database"]

[tool.uv.sources]
engine = { git = "https://github.com/comstrx/gunx", subdirectory = "src/engine", tag = "<version>" }
engine-cache = { git = "https://github.com/comstrx/gunx", subdirectory = "src/cache", tag = "<version>" }
engine-database = { git = "https://github.com/comstrx/gunx", subdirectory = "src/database", tag = "<version>" }
```

From source:

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
uv sync
```

Python 3.15 or newer. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**A complete backend, spoken in one language.**

| Layer      | Domains                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| Foundation | `error` `exception` `config` `context` `log` `metric` `health` `adapter` `func` `thread` |
| Values     | `string` `number` `date` `array` `json` `cast` `parse` `validate` `rand` `geo` `fake`    |
| Trust      | `crypto` `auth` `token`                                                                  |
| Data       | `database` `cache` `storage` `fs` `search` `rag`                                         |
| Flow       | `event` `broker` `queue` `schedule` `broadcast` `socket` `stream`                        |
| Edge       | `http` `net` `view` `translate` `cli`                                                    |
| Providers  | `mail` `sms` `notify` `gateway` `domain` `ai` `video`                                    |
| Proof      | `test`                                                                                   |

A few of them, in their own words:

- **`database`** — one SQL door over PostgreSQL, SQLite, MySQL, ClickHouse, and MongoDB documents, with migrations, repositories, and row-level policies.
- **`http`** — the whole request lifecycle: bootstrap, routes, middleware, requests, responses, sockets, and the generated documentation.
- **`queue`** and **`event`** — typed background jobs with retries, uniqueness, delays, and a graveyard; durable, idempotent domain events through the broker.
- **`net`** — outbound HTTP that refuses server-side request forgery, bounds every body, and carries retries and circuit breakers.
- **`crypto`** and **`token`** — authenticated encryption, signatures, streaming hashes, Argon2id; JWT, PASETO, and stored opaque tokens.
- **`test`** — the stage: a reference application, provisioning, a client, and the benchmark harness the engine measures itself with.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
           Services · Workers · Command Lines
                          │
              engine — the one namespace
                          │
          one package per domain · fifty of them
                          │
        adapters — one family per provider kind
                          │
               Proven Python Ecosystem
```

**Single Responsibility** · **Unidirectional Dependencies** · **Explicit Contracts** · **Provider Independence** · **Modular Composition**

Every domain is a workspace member that declares exactly the domains it builds on. Laws in the test suite keep it that way: the domains form a graph without cycles, a dependency is declared if and only if it is imported, and every third-party library has exactly one owner domain.

Providers stay behind adapters. Mail, SMS, payments, storage, search, AI, and video each expose one normalized shape, and every family ships a memory or log provider, so a test never needs the real one.

The engine owns no tables and no global state of yours. Migration ledgers, outboxes, inboxes, and vector stores are blueprints that the service names and migrates itself.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not another collection of packages. One engineering system.**

One closed set of codes and one `Fault` are the floor of every layer. Any exception, from any library, is mapped to that fault by type, reported once, and throttled, so a caller handles one shape and an operator reads one kind of log.

Settings are groups bound to the environment, validated at boot, and redacted wherever they are shown. Under a production environment the engine refuses to start on a default secret.

The code is checked by `mypy` in strict mode and `ruff` with every rule selected. Every runtime library is pinned to an exact version, and the public surface is compared with the last release so a breaking change cannot slip out under a minor version.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Push the hardware. Respect the measurements.**

The hot paths stand on native code chosen for it: `uvloop` under the event loop, `orjson` for JSON, `msgspec` for typed decoding at the boundary, `asyncpg` for PostgreSQL, `hiredis` under Redis, and SIMD string and set kernels where the work is text and membership.

Where a native core and a portable one both exist, one switch picks between them, and both are held to the same tests.

Every domain owns a benchmark, run by the engine's own harness:

```bash
uv run python benches/bench_domain.py
```

No number is printed here on purpose. Performance is a property of your hardware and your workload; the benchmarks are in `benches/` so you can read it where it matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**Secure by default. Explicit when it is not.**

- **Input** is decoded once, at the boundary, into typed shapes; unknown fields are named and refused.
- **Egress** is guarded against server-side request forgery, with bounded bodies and bounded redirects.
- **Secrets** are redacted from settings and logs, and a default secret cannot reach production.
- **Files** live inside confined roots and are written atomically; templates render in a sandbox.
- **Data** can be fenced by row-level policies that the database itself enforces.
- **Dependencies** are audited by `pip-audit` in strict mode on every audit gate.

The safety gate runs the whole suite again in Python's development mode with warnings turned into errors, and every domain carries a fuzz target built on property testing.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

Run what CI runs:

```bash
uv run mypy
uv run ruff check
uv run pytest -q
uv run python fuzz/fuzz_domain.py
```

| Gate   | What it proves                                              |
| ------ | ----------------------------------------------------------- |
| check  | `mypy` in strict mode over every member                     |
| lint   | `ruff` with every rule selected                             |
| test   | `pytest` in a random order, one file per domain             |
| safety | the suite again in development mode with warnings as errors |
| audit  | `pip-audit` over the exported dependency set                |
| semver | the public surface against the last released tag            |

The suite talks to real services: PostgreSQL, Redis, and RabbitMQ. Point it at yours with `ENGINE_DATABASE_URL`, `ENGINE_REDIS_URL`, and `ENGINE_AMQP_URL`.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
