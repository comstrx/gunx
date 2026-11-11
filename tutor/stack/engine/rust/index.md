# engine/rust

An extended standard library over every Rust dependency: one engineering language for every Rust `api` above it and for the binaries of the tools. It grows from what proved itself in the products and, by decision, from domains proven in another engine.

## Layout

```
engine/rust/
├── Cargo.toml            the workspace: members, [workspace.package] (the one version, edition, rust-version), [workspace.dependencies] (every pin)
├── src/<name>/           package engine-<name>: version.workspace = true, every dependency { workspace = true }; flat files: arch.rs, <concern>.rs, mod.rs
├── src/engine/           the facade: one pub mod per domain re-exporting named items, one feature per domain (no default: a consumer names its domains), a prelude, Contract
├── target/  Cargo.lock    the one artifact and the one lock of the workspace
├── tests/ benches/ fuzz/ one declared target per crate (<crate>.rs)
├── xtask/                a task runner the gate never calls: the gate is the infra chain
└── clippy.toml deny.toml .cargo/config.toml .config/nextest.toml supply-chain/ (cargo-vet)
```

## Laws

- **Workspace** (test): one version in `[workspace.package]`, one pin per library in `[workspace.dependencies]`; a crate's manifest carries no number and names only the crates and libraries it imports; the facade depends on every crate and nothing else, one feature per domain, no default feature (`deny.toml` refuses workspace default features).
- **Fault:** `error::Fault` (code, reason, message, errors); one error model, one lifecycle, one shape for every crate.
- **Layers:** `log` is the floor, `error` above it, then values and mechanics, then io, data, messaging, http, providers; the facade over all.
- **Registry discipline:** a part's `Cargo.lock` holds only versions present in the engine's vetted lock; a part never adds a registry crate without the owner's written order (`criterion` dev excepted); the default answer is to teach the engine.
- **Visibility:** `pub` only for the real contract, `pub(crate)` inside a crate; `cargo semver-checks` against the newest `v*` tag refuses a breaking change without a major bump.
- **Cross-platform:** no code assumes one system; the gate runs on Linux and a platform limit is handled in its chain.
- **Stage:** `engine-test` carries the reference application, provisioning, clients, sockets, samples, relay and bench.

## Domains

| Layer     | Domains                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| floor     | `log error context fast`                                                              |
| values    | `json parse string number list date rand`                                             |
| mechanics | `func task config validate crypto token adapter`                                      |
| io        | `fs net storage asset view cache`                                                     |
| data      | `database` (pool, migrations DSL, query, outbox, documents, RLS, provisioning)        |
| messaging | `broker queue event schedule socket broadcast`                                        |
| http      | `http` (server, router, binder, one response, envelope, throttle, trace) `health cli` |
| providers | `mail sms gateway domain llm rag`                                                     |
| proof     | `test`                                                                                |

Every domain is a crate (today: `hello`, the proof verb); the ladder is this engine's own.

## Gate

`infra gate --part rust` = deps · check (+ hack feature powerset) · lint (clippy, rustdoc) · test (nextest, doc tests) · safety (udeps, miri, asan) · audit (deny, vet, semver); `bench` and `fuzz` by name. Parts run plain clippy and test with the same `clippy.toml`.

## How to add

- **A verb:** in its crate, defined in `arch.rs`, implemented in its concern file, re-exported by the facade by name, pinned in `tests/<crate>.rs`, benched when hot.
- **A crate:** `src/<name>` as `engine-<name>`, its place in the layer order, a `pub mod` in the facade, a test target, a bench target, a fuzz target; the wall refuses anything less.
- **A provider:** an adapter behind its family's DSL with declared capabilities, a memory or log implementation for tests, the real one proven against the service or its exact wire.

## Direction

The fastest, broadest and easiest engine in the world, with a std DSL that lets systems above it write a tenth of their code: memory (arenas, pools, buffer reuse), SIMD parsing and search, fs, process, net, http and websockets, database and transactions, cache and brokers, crypto, observability, concurrency and backpressure, all behind one grammar; argon2id, token pairs with fingerprints, sealed values with rotation and tenant isolation by RLS as the security law lands domain by domain. Every measurement is reproducible on a stated machine; TLS and every security surface arrive when a product needs them, never before. The day it is production-ready, the house product's `api` moves to it and `apix` becomes Rust. The gate grows to macOS and Windows beside Linux.
