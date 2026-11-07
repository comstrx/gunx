# engine/rust

The end goal of the arsenal: an extended standard library and the final wrapper over every Rust dependency, one engineering language for every Rust `api` above it and for the binaries of the tools. It grows at its own pace from what proved itself in the products and, by decision, from domains proven in another engine. Written in `language/rust`; HTTP through `library/hyper`. Gate: `cargo xtask gates`.

## Layout

```
engine/rust/
├── Cargo.toml            the workspace: members, [workspace.package] (the one version, edition, rust-version), [workspace.dependencies] (every pin)
├── src/<name>/           package engine-<name>: version.workspace = true, every dependency { workspace = true }; flat files: arch.rs, <concern>.rs, mod.rs
├── src/engine/           the facade: one pub mod per domain re-exporting named items, one feature per domain (no default: a consumer names its domains), a prelude, Contract
├── target/  Cargo.lock    the one artifact and the one lock of the workspace
├── tests/ benches/ fuzz/ one declared target per crate (<crate>.rs), never an inline #[cfg(test)]
├── xtask/                the gates; nightly pinned only here
└── clippy.toml deny.toml .cargo/config.toml .config/nextest.toml supply-chain/ (cargo-vet)
```

## Laws

- **Workspace law** (test): one version in `[workspace.package]`, one pin per library in `[workspace.dependencies]`; a crate's manifest carries no number; a crate names only the crates and libraries it imports; the facade depends on every crate and nothing else; one `target/`, one lock.
- **Final wrapper:** no dependency type crosses the facade; the engine owns `Request Response Body Router Server Client Pool Job …`. Hiding a library means owning its semantics, errors and options.
- **Product-free:** no business, product, tenant, role, endpoint, brand or UI word in sources or tests; a test asks "would this survive deleting every product?".
- **Faults:** `error::Fault` (code, reason, message, errors) over a closed code set; reasons unique across the engine; a part reuses engine faults and declares its own; one error model, one lifecycle, one shape for every crate.
- **Layers:** `log` is the floor, `error` above it, then values and mechanics, then io, data, messaging, http, providers; the facade over all; a DAG, refused by a test.
- **Registry discipline:** a part's `Cargo.lock` holds only versions present in the engine's vetted lock; a part never adds a registry crate without the owner's written order (`criterion` dev excepted); the default answer is to teach the engine.
- **Visibility:** `pub` only for the real contract, `pub(crate)` inside a crate, private by default; every `pub fn` has a caller or a contract test; binaries expose nothing; `cargo semver-checks` against the newest `v*` tag refuses a breaking change without a major bump.
- **Adapter law:** one DSL per family with an adapter per provider chosen in code (`database cache broker queue schedule socket storage mail sms gateway domain llm`); declared capabilities; an unsupported capability is a `Fault` before any I/O; a memory or log implementation for tests, the real one proven against the service or its exact wire; provider-specific features are extra functions, never a second DSL; no configuration inside the engine.
- **Outbox and recovery:** a side effect that must survive the request is written in its transaction and delivered at least once by the relay; dead pooled connections are replaced at checkout; an outage is a typed `UNAVAILABLE`; the stage can cut a real service mid-operation.
- **Security law:** input validated at the boundary, secrets redacted in every log, paths confined, uploads policed, archive bombs bounded, SSRF-safe egress, argon2id, token pairs with fingerprints, sealed values with rotation, tenant isolation by RLS.
- **Cross-platform:** builds, lints and tests on Linux, macOS and Windows; platform limits handled in xtask.
- **Stage law:** `engine-test` carries the reference application, provisioning, clients, sockets, samples, relay and bench, so tests and benches need no product.

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

Every domain is a crate (today: `hello`, the proof verb); the ladder is this engine's own; a domain from another engine arrives by decision, when a Rust consumer needs it.

## Gates

`infra gate --part rust` = deps · check (+ hack) · lint (clippy, doc) · test (nextest, doc tests) · safety (udeps, miri, asan) · audit (deny, vet, semver); `--type bench` and `--type fuzz` run by name, daily. The chain is `engine/infra/src/module/gate/src/rust.sh`; no xtask. Parts run plain clippy and test with the same `.clippy.toml`.

## How to add

- **A verb:** in its crate, defined in `arch.rs`, implemented in its concern file, re-exported by the facade by name, pinned in `tests/<crate>.rs`, benched when hot.
- **A crate:** `src/<name>` as `engine-<name>`, its place in the layer order, a `pub mod` in the facade, a test target, a bench target, a fuzz target; the wall refuses anything less.
- **A provider:** an adapter behind its family's DSL with declared capabilities, a memory or log implementation for tests, the real one proven against the service or its exact wire.

## Direction

The fastest, broadest and easiest engine in the world, with a std DSL that lets systems above it write a tenth of their code: memory (arenas, pools, buffer reuse), SIMD parsing and search, fs, process, net, http and websockets, database and transactions, cache and brokers, crypto, observability, concurrency and backpressure, all behind one grammar. Every measurement is reproducible on a stated machine; TLS and every security surface arrive when a product needs them, never before. The day it is production-ready, the house product's `api` moves to it and `apix` becomes Rust.
