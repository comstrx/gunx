# ✨ API Backend

[![Python](https://img.shields.io/badge/Python-Microservices-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Service per Domain. One Shape for All. One Door to the World.**

A microservice backend engineered so that the **tenth service looks exactly like the first**: the same folders, the same layers, the same faults, and the same proof, with the whole platform reachable through a single gateway.

**Stop designing every service from scratch. Start filling in a shape that already works.**

---

## 🎯 Overview

**One architecture. Every service. No exceptions.**

Microservices fail in a familiar way. Each team shapes its service a little differently, shared code leaks across boundaries, and within a year the system is a distributed monolith that nobody can hold in their head.

API Backend makes the shape a law instead of a guideline. Every service is a member of one workspace, keeps the same layout, climbs the same ladder of layers, and reaches only three things: the engine beneath it, the shared contract, and itself.

What the shape buys is speed with safety: a new business domain is a new folder with a known anatomy, and the test suite refuses it until it stands exactly like its siblings.

**The architecture is not documented. It is enforced.**

---

## 📦 Download

**One repository. One tag per release. One workspace to run.**

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
uv sync
```

Every service starts the same way, by its own name:

```bash
uv run python -m gateway
uv run python -m iam
```

Python 3.15 or newer. Each service documents its settings in its own `.env.example`. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**Five members today. One anatomy for every one that follows.**

| Member     | What it owns                                                                |
| ---------- | --------------------------------------------------------------------------- |
| `contract` | The shared vocabulary: services, layers, roles, scopes, reasons, topology   |
| `gateway`  | The one external door: a door per audience, relayed identity, gathered docs |
| `iam`      | Identity: accounts, one-time codes, sessions, refresh, and revocation       |
| `notify`   | Notifications: devices, notices, and pushes, driven by identity events      |
| `hello`    | The first business domain: the smallest service that walks every layer      |

**Multi-Tenancy** · **Role and Scope Guards** · **One-Time-Code Sessions** · **Token Revocation** · **Event-Driven Services** · **Bilingual Messages** · **Generated API Documentation** · **Health Probes**

Tenancy is enforced where it cannot be forgotten: by row-level policies in the database itself, and the suite runs under a role that cannot bypass them.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
             Clients · Surfaces · Partners
                          │
              gateway — the one door
                          │
          iam · notify · hello · your domain
                          │
            contract — the shared vocabulary
                          │
                       engine
```

**One Service per Domain** · **One Schema per Service** · **Unidirectional Layers** · **Explicit Contracts** · **Events over Calls**

Inside every service, the same ladder, and each rung reaches only the rungs beneath it:

```text
route → request → controller → service → resource → repository → model → migration
```

A request is validated before a controller sees it. A controller never touches a model, a service never names one, and a repository is the only layer that speaks to storage. A service never imports another service: they meet through the contract and through events.

Every member keeps one layout: `app`, `bootstrap`, `config`, `routes`, `database`, `resources`, `public`, and `storage`.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not a set of conventions. A set of laws with tests.**

Seven laws run with the suite, and each fails the build by name:

- **Workspace** — every member is declared exactly once.
- **Domain** — a member reaches only the engine, the contract, and itself.
- **Layout** — every member keeps the one shape.
- **Layer** — each layer reaches only the layers beneath it.
- **Environment** — a service documents exactly the settings it reads.
- **Message** — every reason a service can raise speaks every supported language.
- **Purity** — no comment, print, or eval hides in a member.

Mechanisms belong to the engine; a service carries only its business. HTTP, SQL, caching, queues, events, tokens, and translation arrive from below, so the code that remains is the code that is yours.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Measure the journey, not the function.**

Every service owns a benchmark that drives it the way a client would: through HTTP, through the gateway, through a real session.

```bash
uv run python benches/bench_gateway.py
```

No number is printed here on purpose. Latency is a property of your hardware, your database, and your network; the benchmarks are in `benches/` so you can read it where it matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**Trust is established once, at the door, and never assumed again.**

- **The gateway** is the only public surface; services behind it accept a relayed identity that is signed, not a header that is believed.
- **Sessions** begin with a one-time code, carry a session id, and can be revoked: the row and the token die together.
- **Tenants** are isolated by row-level policies that guard reads and writes alike.
- **Input** is typed at the boundary, and an unknown field is an error, not a surprise.
- **Secrets** live in environment files that are never committed, and a default secret cannot reach production.
- **Dependencies** are audited on every gate.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

Run what CI runs:

```bash
uv run mypy
uv run ruff check
uv run pytest -q
```

| Gate   | What it proves                                                    |
| ------ | ----------------------------------------------------------------- |
| check  | `mypy` in strict mode over every service                          |
| lint   | `ruff` with every rule selected                                   |
| test   | every service, the seven laws, and one journey across all of them |
| safety | the suite again in development mode with warnings as errors       |
| audit  | `pip-audit` over the exported dependency set                      |

The suite talks to real services: PostgreSQL, Redis, and RabbitMQ. Point it at yours with `ENGINE_DATABASE_URL`, `ENGINE_REDIS_URL`, and `ENGINE_AMQP_URL`.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
