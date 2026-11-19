# Rust engine

## Contract

A general-purpose Rust engine for demanding production systems. Develop comprehensive reusable capabilities, precise logic and a powerful predictable DSL with the highest practical speed, safety and memory efficiency. Express contracts through idiomatic ownership, types and bounded lifecycles.

## Structure

- `engine/rust/Cargo.toml` owns the Cargo workspace resolver, edition, package metadata, lints, profiles and dependency versions; `Cargo.lock` resolves it.
- Workspace membership covers domain crates, the facade and the relevant tests, benches, fuzz and development support.
- A domain lives under `src/<name>` and imports only lower-level contracts. Its flat source places types, traits and constants in arch.rs, implementation in concern files and named exports in the target root. It never depends on the facade.
- The facade depends only on domain crates, with one named opt-in feature/module per domain, no default feature and named re-exports. Preserve centralized profiles, metadata inheritance and dependency-default-feature policy.

## Rules

### Capability and ownership

- Start with a consumer need, clear behavior and a representative workload. Preserve wire compatibility where consumers depend on it; choose the representation that best satisfies Rust ownership and performance requirements.
- Specify semantics, ownership, cancellation, retries, limits, fault behavior and recovery before choosing types. Use Rust ownership and bounded execution to express the contract.
- Implement the smallest useful domain first. Grow the ladder as consumers prove needs. Keep independent evolution and review each public addition.
- Expose one named contract per responsibility; apply the language's ownership and representation knowledge to its internal design.
- Keep provider, transport and runtime details behind the domain. Introduce an adapter family when there is a real provider boundary and capability distinction.
- Preserve the approved log → error foundation and reuse error::Fault through its declared contract. Extend the responsibility ladder from actual needs without giving each domain a new error vocabulary.
- A product migration requires that product’s feature, wire, data, recovery and capacity proofs, and a deliberate rollout decision.

### Dependencies and integration

- Keep exact external version constraints and selected features centralized; use inherited dependency declarations in members and review every transitive graph change.
- Apply root architecture's dependency policy; the language owns toolchain selection and any instrumentation-only nightly requirement.
- Review deny rules, vetted provenance, licenses, unsafe, build scripts and target support. A part lock uses vetted engine-lock versions; adding a registry crate to a part needs the owner's explicit decision, preserving the existing criterion development exception.
- Give an HTTP proposal one owner, choose the supported protocol and runtime features, and budget memory and shutdown by deployment. Hyper supplies transport, with engine semantics layered above it.
- Preserve workspace unsafe guards. Any approved exception needs its own narrow boundary, review and proof; protect checked input handling under the active release profile.
- Expose only the real contract with pub; keep crate-internal items pub(crate). Preserve the established public-surface compatibility gate against the latest version tag; breaking changes require their deliberate major-version decision.
- Keep empty/default feature sets, individually selected domains and combined features coherent. A feature may add supported capabilities while leaving other behavior stable.

### Evidence and integration order

- Define production baseline and target before building. Benchmark observed operations and service scenarios under the same load, error mix and payload distribution.
- Use safe scalar implementations and test data for differential proof before specialized native, SIMD or unsafe paths.
- Prove a new provider against its exact wire or real service and test interruption, explicit unavailability, cancellation and clean recovery.
- Keep domain DAG, public names, independent consumers and the part lock checked. Introduce an independent stage when a domain needs real service or end-to-end proof.
- Record portability gaps in evidence. Observed behavior on one host does not establish target support elsewhere.

### Independent and portable consumption

- Verify extracted crates through their declared package contents and dependency closure. Workspace inheritance or local paths must not conceal missing published files or unusable dependencies.
- Test relevant default/minimal/combined feature sets: workspace feature unification can hide a dependency that an isolated consumer lacks.
- Keep target adapters and optional native dependencies owned by their domains. Linux/macOS/Windows consumers receive the same semantic contract or an explicit capability refusal.
- Account for code size, compile time and dependency closure alongside runtime measurements when adding generic or feature-heavy public APIs.

## Proof

- Cover workspace, public surface, selected feature combinations, independent domain consumption and supported targets.
- Keep behavioral tests, measurements and failure exploration with each domain; compare optimized paths against a simple correct reference.
- Exercise ownership, aliasing, cancellation, interruption, bounded resource use and clean recovery.
- Distinguish instrumentation from clean performance measurements and source inspection from executed behavior. Methods follow the scope and owner timing.

## Sources

- Repository evidence lives in `engine/rust/Cargo.toml`, `engine/rust/src/engine/src/lib.rs`.
- [Cargo workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) · [Cargo features](https://doc.rust-lang.org/cargo/reference/features.html) · [Rust releases](https://doc.rust-lang.org/stable/releases.html)

## Routing

For HTTP transport or serving, read the [library dispatcher](../../lib/index.md) with Hyper and the actual runtime context. For Tokio task/runtime work, select Tokio there. With no external library in scope, read the [language dispatcher](../../lang/index.md) with Rust selected. Return here for workspace ownership and inspect the affected manifests, facade and proofs.
