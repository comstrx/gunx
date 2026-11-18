# ✨ TypeScript Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-Web_·_Mobile_·_Desktop-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Engine. Every Screen. No Framework Lock-In.**

A TypeScript foundation engineered to run the same mechanisms on **the web, the phone, and the desktop**: state, forms, storage, networking, realtime, localization, and cryptography, written once and bound to each platform at boot.

**Stop rebuilding the client three times. Start sharing what never changes.**

---

## 🎯 Overview

**One engineering philosophy. Every platform. Total control.**

A product with a website, a mobile app, and a desktop app usually owns three copies of the same client logic, each shaped by the framework it happened to be written in. They drift, and every fix is made three times.

TypeScript Engine separates what a client does from where it runs. Thirty-seven members provide portable mechanisms behind one `engine` facade, and none of them imports a framework runtime. The framework, the native adapter, and the product's policy belong to the application that consumes them.

Developed and proven with Bun; consumed by Next, Expo, and Electrobun surfaces through the same imports.

**Write the mechanism once. Bind it where it runs.**

---

## 📦 Download

**One repository. One tag per release. One linked package.**

The engine is consumed as a linked package:

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
bun install
bun run link
```

```json
{ "dependencies": { "engine": "link:engine" } }
```

```bash
BUN_INSTALL_GLOBAL_DIR="/path/to/gunx/.bun" bun install
```

```ts
import * as cache from "engine/cache";
import * as state from "engine/state";
```

Bun 1.4.4 or newer. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**Import a namespace. Choose the owner. Nothing else changes.**

| Need                                          | Members                            |
| --------------------------------------------- | ---------------------------------- |
| Native mechanisms and device capabilities     | `device` `fs` `media`              |
| Typed faults, events and bounded work         | `error` `exception` `event` `func` |
| Serialization, parsing, validation and values | `json` `parse` `validate` `value`  |
| Text, numbers, dates and geography            | `string` `number` `date` `geo`     |
| Collections, search and virtual layouts       | `list` `search` `virtual`          |
| Persistence, outbox and history               | `cache` `queue` `history`          |
| State, forms and identity                     | `state` `form` `auth`              |
| Randomness and cryptography                   | `rand` `crypto`                    |
| HTTP, streams and realtime transport          | `net` `socket`                     |
| Localization, catalogs and appearance         | `translate` `world`                |
| Logging and search metadata                   | `log` `seo`                        |
| Supplied API and surface contracts            | `api` `spec`                       |
| Hosted development and data generation        | `tool` `test` `fake`               |

`spec` turns a declared surface, its configuration, schema, and messages, into a running role. `tool` is the build and verification runner the surfaces share. `world` owns the catalogs a global product needs: languages, currencies, flags, emoji, colors, icons, and appearance.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
        Next · Expo · Electrobun · Your Runtime
                          │
               engine — the one facade
                          │
         thirty-seven members · one job each
                          │
        ports — bound to the platform at boot
                          │
          Web Platform · Native · Bun Runtime
```

**Single Responsibility** · **Unidirectional Dependencies** · **Explicit Contracts** · **Platform Independence** · **Modular Composition**

Every member keeps its public definitions in `src/arch.ts`, and its `src/index.ts` only exports. Members never import each other's implementation files, and only `api`, `spec`, and `tool` interpret a contract supplied by the application.

Platform capabilities arrive through ports. The application installs an implementation at boot, keeps the disposer it gets back, and releases it when the owner ends:

```ts
import * as state from "engine/state";
import { useRef, useSyncExternalStore } from "react";

const renderer: state.Renderer = { ref: useRef, read: useSyncExternalStore };
const bound = state.bind(source, serverSnapshot, renderer);
```

Browser and React Native resolution of the facade carries only the portable members. Hosted utilities live behind the explicit `engine/tool` and `engine/test` doors and never reach a client bundle.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not another collection of helpers. One engineering system.**

Units are part of every contract: a storage entry's time to live is in seconds; timers, deadlines, and queue delays are in milliseconds. Bounds are explicit as well: a work lane rejects when it is full rather than queuing without limit, and concurrent iteration has a stated width.

Failure is a value with a name. A catalog that was not loaded refuses with a reason instead of pretending to be empty, a malformed amount is rejected instead of rendered as zero, and a write acknowledges persistence separately from the observers that react to it.

The compiler runs in strict mode with exact optional properties and unchecked index access closed. Source laws verify dependency direction, library ownership, portable host boundaries, and file structure, and every export is named by a test.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Do less work. Prove it on a clock.**

Selection does not sort what it will not show: `list.best` keeps a window of the requested size. Text operations stop at their budget, byte length is counted without allocating a buffer, and virtual layouts render what is visible.

Every member owns a benchmark:

```bash
bun run bench
```

No number is printed here on purpose. Performance is a property of your device and your workload; the benchmarks are in `benches/` so you can read it where it matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**Honest boundaries. No borrowed guarantees.**

- **Cryptography** keeps the provider it acquired across awaits and snapshots mutable input; key labels never retain plaintext secrets.
- **Sessions** use the storage the application supplies. The engine does not pretend that browser storage is a credential vault: token custody is chosen at the platform boundary.
- **Networking** ignores forwarded identity and scheme unless the host states its trusted proxy chain, and URL guards constrain origins and redirects.
- **Realtime** bounds pending requests and treats an authentication close as terminal.
- **Exports** can guard spreadsheet formulas, and strict validation reports when a content security policy refuses code generation.

Every member carries a property-based fuzz file, and the dependency graph is audited on every gate.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

Run what CI runs:

```bash
bun run gate
bun run bench
```

| Gate   | What it proves                                              |
| ------ | ----------------------------------------------------------- |
| check  | `tsc` in strict mode over the workspace                     |
| lint   | Biome in CI mode                                            |
| test   | one test file per member, the source laws and the lifecycle |
| safety | the suite again under a constrained heap                    |
| audit  | `bun audit` over the frozen dependency graph                |
| semver | the exported surface against the last released tag          |

Native claims require native execution: a production build, a Hermes export, and a browser run are each useful evidence with distinct limits.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
