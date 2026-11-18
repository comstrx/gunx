# ✨ Apex

[![Stack](https://img.shields.io/badge/Python_%2B_TypeScript-Enterprise_SaaS-0D9488?logo=python&logoColor=white)](https://github.com/comstrx/gunx)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Product. Every Tenant. Every Role. Every Screen.**

An enterprise platform engineered as **one coherent system**: a microservice backend, a website, a desktop application, and a mobile application, all multi-tenant, all multi-role, and all standing on the same engines.

**Stop stitching a product together from unrelated stacks. Start building it as one.**

---

## 🎯 Overview

**One product. One architecture. From the database row to the pixel.**

Enterprise software is usually four projects pretending to be one: a backend, a web app, a mobile app, and the infrastructure that holds them, each with its own conventions and its own way of failing.

Apex is built the other way round. The mechanisms live in engines that know nothing about the product. The product keeps only what is truly its own: its business domains as services, and its roles as declared specs that compile into surfaces.

**Where it stands today:** identity with one-time-code sessions, tenants and memberships, notifications, a gateway, and the first business domain on the backend; the admin and client roles on the web, the desktop, and the phone.

**The product is the proof. The engines are what it proved.**

---

## 📦 Download

**One repository. One tag per release. Everything it needs inside.**

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
bash engine/bash/src/main.sh self install
gunx gate
```

The repository carries the engines the product stands on, so a clone is complete. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**One product. Three faces. One vocabulary between them.**

| Face            | What it is                                                   |
| --------------- | ------------------------------------------------------------ |
| Backend         | One workspace of services, one per business domain           |
| Web and Desktop | Every role from its spec, as a website or as a native window |
| Mobile          | Every role from its spec, as a native application            |

**Multi-Tenant** · **Multi-Role** · **One-Time-Code Sessions** · **Row-Level Isolation** · **Event-Driven Services** · **Spec-Driven Surfaces** · **Arabic and English, Right-to-Left and Left-to-Right** · **Light and Dark**

A role is declared once as a spec and becomes an application: a website, a desktop window, or a native app.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
            Web · Desktop                Mobile
                    │                      │
                    └──────────┬───────────┘
                               │
                   gateway — the one door
                               │
             iam · notify · hello · your domain
                               │
        ┌──────────────────────┴──────────────────────┐
      Python                TypeScript               Bash
    (services)              (surfaces)        (gates · delivery)
```

**One Service per Domain** · **One Spec per Role** · **Unidirectional Dependencies** · **Explicit Contracts** · **Engines Know No Product**

Dependencies flow one way: engines, then the product. The surfaces reach the backend only through the gateway, and the services meet each other only through the contract and through events.

Everything specific to the product, its domains, roles, branding, texts, and data, lives in services and specs. Everything reusable lives beneath them, in an engine.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not four codebases. One engineering system.**

The backend's shape is a set of laws with tests: one layout for every service, one ladder of layers, and one rule about what a service may reach. The surfaces' shape is a law the build enforces: eleven layers, and an import may only travel down.

A capability is built where it belongs. If more than one side needs it, it is an engine's; if only this product needs it, it is a service or a spec. Nothing is written twice, and nothing generic hides inside the product.

Everything proves itself with the same gates, run by the same command, locally and in CI.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Measured where the user feels it.**

The backend's benchmarks drive real journeys through the gateway and a real session. The surfaces' builds end against byte budgets, and a build that exceeds its budget fails.

```bash
gunx gate --type bench
```

No number is printed here on purpose. Performance is a property of your hardware and your deployment; the benchmarks and the budgets are in the repository so you can read it where it matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**One door in. Isolation all the way down.**

- **The gateway** is the only public surface; identity is established there and relayed, signed, to the services behind it.
- **Tenants** are isolated by row-level policies that the database itself enforces.
- **Sessions** can be revoked, and a revoked session is refused everywhere.
- **Surfaces** choose token custody per role and reach native capabilities through one fenced bridge.
- **Secrets** live in environment files that are never committed, and a default secret cannot reach production.
- **The repository** is scanned for leaked secrets, vulnerable dependencies, and unsafe workflows on every gate.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

One command gates everything, or only what a change touched:

```bash
gunx gate
gunx gate --only-changed
```

Every change should strengthen the system, preserve architectural boundaries, and justify its complexity.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
