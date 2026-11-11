# Rust

How Rust is written here, in the engine and in every Rust service and binary. The hand style is the format: no `rustfmt`; the deny-wall checks rules, the hand writes the shape, the reviewer reads it.

## Toolchain

- Stable Rust; nightly pinned only for the gates that need it (udeps, miri, the sanitizers, fuzzing); `rust-version` in every manifest; exact pins (`=x.y.z`) for every dependency.
- clippy with `pedantic`, `nursery` and `cargo` as `deny`, plus `unwrap_used expect_used indexing_slicing missing_docs`; `#[expect(reason = "…")]` is the only knob, never `allow`. `CARGO_BUILD_WARNINGS=deny` reproduces CI.
- cargo-deny (licenses, bans, advisories, sources), cargo-vet (every crate audited or imported), cargo-udeps, cargo-hack (feature powerset), cargo-semver-checks, nextest, criterion, libfuzzer; sanitizers and miri in the safety gate.
- `#![forbid(unsafe_code)]` at every facade; `unsafe` only for a proven need, narrow, with its invariants in a `// SAFETY:` line and a test.

## Hand style

```rust
pub struct Cache;

impl Cache {

    pub async fn remember <T> ( key: &str, ttl: Duration, load: impl Future<Output = Result<T, Fault>> ) -> Result<T, Fault> {

        if let Some( found ) = Store::get(key).await? { return Ok(found); }

        let value = load.await?;

        Store::set(key, &value, ttl).await?;

        Ok(value)

    }

}
```

- Spaces inside parentheses at definitions (`fn main () -> Exit`, `|( head, _ )|`, `Some( found )` in patterns); generics spaced only at definition sites (`fn get <T> ( … )`, `impl <T> Task<T>`); calls, literals and indexing tight. Columns 120–140.
- Fn, impl and multi-statement bodies padded; `else` on its own line; struct, enum and match arms not padded; short arms aligned on `=>`.
- ZST namespaces: `pub struct Str;` + `impl Str` per concern file; no free functions except `main`; snake_case constructors; `impl Into<String>` arguments; builders by value; one control block per method.
- Files: `arch.rs` holds definitions (types, traits, consts), `<concern>.rs` holds impls, `mod.rs` re-exports by name; a crate is a folder of flat files.
- Imports: one `use` per path, siblings braced; std and external, a blank line, then `crate::`; each group longest first. No glob imports outside a prelude.
- Errors: one `thiserror` enum per crate behind the fault; `?` everywhere; no `unwrap`, `expect`, `panic!` or index outside tests and gate runners.
- Comments: only what the wall requires: `//!` per target root, `///` per `pub` item with `# Errors`, `# Panics`, `# Safety` sections when they apply, `// SAFETY:` per unsafe block.
- Binaries: `main.rs` + `arch.rs` + `base.rs`; `fn main () -> Exit { Exit::loud(X::run()) }`; every binary answers `--version` with `<bin> <version>` and exposes no library surface.

## Async and memory

- tokio; no blocking call inside the runtime (`spawn_blocking` for CPU and sync I/O); every I/O carries a timeout; every fan-out is bounded; cancellation is explicit and documented per verb.
- Allocation is a decision: arenas, pools, buffer reuse and `Bytes` on hot paths, proven by a bench; zero-copy where a measurement earns it, never by habit. `Arc` only across tasks; `Rc` never in shared code.
- Public types own their semantics: no dependency type crosses a facade; conversions are `From`/`TryFrom`, never free functions.

## Tests and benches

- One declared target per crate for tests, benches and fuzz (`tests/<crate>.rs`, `benches/<crate>.rs`, `fuzz/<crate>.rs`), never an inline `#[cfg(test)]` module.
- A law is a test: the layer DAG, the facade's export list, `pub` with a caller, the registry discipline of a part's lock, every binary answering `--version`.

## Canon

The laws a review sweeps in one pass; the wall enforces most of them mechanically:

- The safe path is the easy path and the easy path is the fast path; every exceptional cost (allocation, clone, lock, hash, dynamic dispatch, blocking) is visible in the name or the signature, never a surprise.
- Contract before container: workload, mutation, concurrency, lifetime and adversarial limits are stated before a representation is chosen; representation before instruction: layout, ownership and data movement beat clever syntax.
- Scalar truth before specialized speed: every unsafe or SIMD engine has a simple safe oracle and a differential test; a benchmark proves speed, never safety.
- Borrow over clone; `&[T]`/`&str` over `&Vec<T>`/`&String`; `Cow` only for real conditional ownership; `Arc` only for real shared ownership; `Box` for layout, not for size by habit.
- `Result` for every recoverable failure, codes first and prose last, source chains preserved, `From` for conversions, never a `map_err` sprawl; a panic is a bug, never a control path.
- `with_capacity` when the size is known; reuse (`clear`, `drain`, `extend`, `mem::take`); `write!` into buffers over `format!`; hot and cold paths separated so diagnostics never sit in a hot loop.
- Make illegal states unrepresentable: newtypes, typestate, validated handles at the boundary (parse, don't validate); `#[must_use]`, `#[non_exhaustive]`, sealed traits, `From`/`TryFrom`/`FromStr` where they belong.
- One public item, one public path; no glob re-export; a feature adds capability and never changes semantics.
- Remove sharing before optimizing sharing: ownership transfer, sharding, worker-local state and batching before locks and atomics; bounded channels; a future is a state structure whose size and `Send` are decisions.
- A dependency needs a dossier: the capability it buys, its maintenance, its license, its unsafe, its features; versions and features centralized in the workspace manifest.
