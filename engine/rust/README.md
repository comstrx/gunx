# ✨ Rust Engine

[![Rust](https://img.shields.io/badge/Rust-Systems_Engineering-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Foundation. Infinite Possibilities. Zero Compromises.**

A Rust foundation engineered to bring **systems programming, backend development, and infrastructure engineering** under one unified language of performance, safety, and control.

**Stop assembling fragmented stacks. Start engineering complete systems.**

---

## 🎯 Overview

**One engineering philosophy. Every capability. Total control.**

Modern software depends on powerful crates, yet combining them often introduces fragmented APIs, duplicated abstractions, inconsistent errors, and unnecessary complexity.

Rust Engine answers that fragmentation with one workspace where every domain follows the same shape, the same vocabulary, and the same proof before it is allowed to exist.

**Where it stands today:** the workspace, the lint wall, and the complete proof chain are in place, and the first domain, `hello`, walks through every one of them. Domains land one at a time, and none lands without its tests, its benchmark, and its fuzz target.

The mission is ambitious: **combine the depth of systems programming with the elegance of a modern developer experience.**

---

## 📦 Download

**One repository. One tag per release. One line in your manifest.**

Depend on the facade and switch on only the domains you use:

```toml
[dependencies]
engine = { git = "https://github.com/comstrx/gunx", tag = "<version>", features = ["hello"] }
```

From source:

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
cargo test --workspace --all-features
```

Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**One door. One feature per domain. Nothing you did not ask for.**

```rust
use engine::hello::Hello;
```

**Shipped today** · `hello` — the domain that proves the workspace end to end: facade, feature flag, tests, benchmark, fuzz target, and supply chain.

**The direction** · Memory & Buffers · Strings & Numerics · Parsing & Validation · Async I/O & Filesystems · Networking & Realtime · Databases & Caching · Concurrency & Scheduling · Cryptography & Randomness · Errors & Observability · Processes & System Integration

That second line is a direction, not an inventory. A capability is called shipped only when its domain sits in `src/` with its proofs beside it.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
        Applications · Services · Tools
                       │
            engine — the one door
                       │
        one crate per domain · one feature each
                       │
       arch (definitions) · verbs (behavior)
                       │
             Proven Rust Ecosystem
```

**Single Responsibility** · **Unidirectional Dependencies** · **Explicit Contracts** · **Opt-in Features** · **Modular Composition**

`src/engine` is the only crate a consumer names. Every domain is its own crate behind its own feature, so an application compiles exactly what it uses. Inside a domain, `arch` holds the definitions and the remaining modules hold the verbs.

Tests, benchmarks, and fuzz targets are workspace members of their own, outside the crates they prove, and reach the engine through the same door a consumer does.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not another collection of crates. One engineering system.**

The workspace compiles under Rust 2024 with warnings denied and a lint wall that leaves little to taste: Clippy's `all`, `pedantic`, `nursery`, and `cargo` groups are errors, and so are more than a hundred restriction lints on top of them.

No `unwrap`, no `expect`, no `panic!`, no unchecked indexing, no `todo!`, no stray `dbg!` or printing. Every public item is documented, every `allow` carries a reason, and rustdoc warnings fail the build.

Dependencies are pinned to exact versions and must earn their place. Mature ecosystem crates are embraced where they excel; custom engineering appears only where it measurably improves performance, safety, or the developer experience.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Push the hardware. Respect the measurements.**

The release profile is tuned for the final binary: `opt-level = 3`, a single codegen unit, fat LTO, aborting panics, and stripped symbols. A `profiling` profile keeps full debug information for flame graphs, and `release-checked` keeps overflow checks and debug assertions under release optimizations.

Every domain owns a Criterion benchmark, and no optimization is accepted on reputation alone.

```bash
cargo bench --workspace
```

No number is printed here on purpose. Performance is a property of your hardware and your workload; the benchmarks are in `benches/` so you can read it where it matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**Safety is the foundation. Security is the contract.**

Every crate declares `#![forbid(unsafe_code)]`, and the workspace denies it again at the lint level. Should a future domain need an unsafe boundary, the lints for documented invariants and single-operation unsafe blocks are already switched on, waiting for it.

The supply chain is guarded twice: `cargo deny` refuses advisories, yanked and unmaintained crates, duplicate versions, wildcards, unknown sources, and OpenSSL in favor of rustls; `cargo vet` refuses any dependency version that has not been accounted for.

The safety gate runs the tests again under Miri with both stacked and tree borrows, under the address, thread, memory, and leak sanitizers, and hunts unused dependencies. Every domain carries a libFuzzer target.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

Run what CI runs:

```bash
cargo check --workspace --all-targets --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo nextest run --workspace --all-features
cargo deny --all-features check
cargo vet
```

| Gate   | What it proves                                                 |
| ------ | -------------------------------------------------------------- |
| check  | `cargo check` on every target, then every feature combination  |
| lint   | Clippy with warnings denied, then rustdoc with warnings denied |
| test   | `cargo nextest` and the documentation tests                    |
| safety | unused dependencies, Miri, and the sanitizers                  |
| audit  | `cargo deny` and `cargo vet`                                   |
| semver | `cargo semver-checks` against the last released tag            |

Every change should strengthen the system, preserve architectural boundaries, and justify its complexity.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
