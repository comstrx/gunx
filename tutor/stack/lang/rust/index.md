# Rust

## Contract

Use ownership and types to express invariants, and expose the cost and failure behavior of each operation. Start from a correct safe implementation and use profiles, benchmarks and differential proof to justify specialization.

## Structure

- Build with the pinned stable toolchain and workspace edition. Use the pinned nightly only for tools that require it. Verify newest stable and exact dependency versions from primary release sources for an authorized upgrade.
- Workspace inheritance, feature policy and package placement belong to the owning engine or part.
- rust-version declares the supported minimum compiler; edition selects language rules, and Cargo.lock resolves packages. None alone identifies the active compiler. Resolve effective toolchain selection and overrides, then record the actual compiler/target when reproducing a result.
- Preserve strict rustdoc and Clippy, including the repository’s `pedantic`, `nursery`, `cargo` and panic/unwrap/index restrictions. Use a reasoned `#[expect]` only when the inherited lint permits it.
- Match local hand style. Keep definition-site spacing, multi-statement body padding, tight calls and the surrounding import grouping. Use the established 120–140 column range.
- Re-export only intended public names. The owning engine or part chooses declaration and concern-file placement.
- Prefer methods on the established domain namespace, value or handle. Use named conversions, typed error chains and `Result` for recoverable failures.
- Document exported items and relevant Errors, Panics and Safety conditions. Apply the owning workspace's target and command contracts.

```rust
/// A fixed upper bound for an admitted item.
pub struct Limit;

impl Limit {

    /// Whether the item fits the bound.
    #[must_use]
    pub const fn fits ( limit: usize, size: usize ) -> bool {

        size <= limit

    }

}
```

## Rules

### Representation and allocation

- State workload, lifetimes, mutability and size ceilings before choosing representation. Parse inputs into validated types; make invalid states unrepresentable where practical.
- Borrow `&str` and `&[T]` at read boundaries. Own or clone where lifetime or task transfer demands it; measure cost on a hot path.
- Use `Cow` for actual conditional ownership, `Arc` for actual shared ownership, and `Box` for a deliberate layout or dynamic-dispatch boundary.
- Preallocate a known, bounded capacity. Reuse buffers only under an ownership and memory budget; large retained capacities can dominate RSS.
- Cheap buffer slicing shares backing storage and can retain the full allocation. Copy small long-lived slices if retained memory measurements justify it.
- Separate hot data from cold diagnostic state. Keep checked arithmetic on hostile sizes even when the release profile disables implicit overflow checks.
- Prefer named exports and owned public types. Keep allocation, blocking, clone and shared-state costs discoverable from a public operation’s contract.
- HashMap's default randomized hashing resists collision attacks. A faster alternative must match the key trust boundary; trusted integer benchmarks do not justify weaker hashing for attacker-controlled strings. Preserve Eq/Hash consistency and key identity while stored.

### Text destinations and failure

- A caller-owned formatting destination can avoid an intermediate owned string. Accept a borrowed writing contract and support an unsized destination when callers may use a trait object.
- fmt::Write accepts UTF-8 text and has no flushing operation; byte I/O and flush behavior belong to a different writing contract. Propagate fmt::Error as a formatting failure, not a fabricated diagnostic category.
- Successful write_str accepts the entire supplied string. Failure does not establish rollback of earlier destination effects; the destination owns buffering and commit behavior.
- Separate allocations made by the helper from those made by its destination. Existing capacity and successful output prove only the examined path; arbitrary sinks can allocate, block or fail.
- Prove the public consumer path with a prepopulated destination, an unsized destination, rejection and permitted partial effects. Keep stronger transactional guarantees explicit rather than inferring them from Result.

### Byte destinations and buffering

- io::Write::write may accept a prefix. An error from that call means it wrote none of the supplied bytes; earlier successful calls can still have effects.
- Standard write_all handles partial progress and Interrupted, and reports WriteZero on zero progress. Its error does not report how much earlier work succeeded; replaying the entire input may duplicate output. It does not flush.
- Keep BufWriter's capacity and lifetime deliberate. It amortizes repeated small sink writes, not every workload. Observe flush errors explicitly where completion requires them; errors during Drop are ignored. Flushing a buffer does not itself promise durable storage.
- Support borrowed unsized writers when the public contract needs trait-object consumers. Separate destination allocation and buffering costs from the helper's own work.

### Async and failure

- Treat a future as state retained across awaits. Drop large temporaries and release sync guards before suspension; move only the required data into spawned tasks.
- Prefer ownership transfer, local state and sharding before shared locks. Task-spawning and scheduler mechanics belong to the selected runtime library.
- Carry a deadline through queues and I/O. Define what a timeout means when a transaction or external operation may already have committed.
- Dropping a future may discard unfinished progress. Define cancellation safety at the operation boundary and retain state when resumption requires it.
- Blocking I/O and CPU work need an explicit execution boundary; use the runtime library's guarantees for stopping, joining and accounting.
- Stop admission before cancellation and drain. Signal owners, join within a budget, record unconfirmed side effects and handle long-lived upgrades explicitly.

### Safety and interoperability

- Keep facades and ordinary crate roots under their inherited unsafe policy. Any approved unsafe boundary requires the smallest scope, explicit invariants, lifetime/aliasing/alignment checks and a safe oracle.
- Pin for address-sensitive invariants, not as a general allocation strategy. Use safe pinning and projection where available; document drop and movement invariants when the implementation depends on them.
- Keep FFI ownership, layout, allocator origin and unwind behavior explicit. Validate every foreign length before creating a slice or allocating.
- Evaluate a dependency’s feature cost, licensing, target support, advisories and unsafe/build-code exposure. Keep library errors and types private to the owner.

### Scheduler fairness

- Scheduling fairness and blocking-task lifetimes belong to the selected runtime library. Do not infer execution guarantees from Rust's type safety.
- Compare stack/future size and retained allocations before boxing, pooling or pinning; fewer allocations can still mean more retained memory.

### Target and artifact boundaries

- Distinguish host tools, target standard library and runtime support tiers. Linux, macOS and Windows builds need their actual target triples, linker/SDK and any native dependency ABI.
- Windows MSVC/GNU and Linux libc variants are different targets. An available standard library does not supply every cross linker, native library or runtime dependency.
- Keep cfg and OS-specific mechanisms at adapters; preserve the public contract or expose explicit unavailability. Avoid scattering platform branches through domain logic.
- CPU-native compilation and unsupported target features make artifacts machine-specific. Dispatch specialized code only after its preconditions are established, retaining the supported fallback.
- Treat optimization level, LTO, codegen units and panic strategy as workload/artifact decisions. Smaller binaries, shorter builds, lower latency and less memory are separate objectives.

### Safety and input exploration

- Miri examines supported execution for undefined behavior; sanitizers and fuzzing exercise other defects. None proves all executions safe, and instrumentation availability depends on toolchain/target.
- Use property/differential cases for lengths, alignment, integer bounds and state transitions before custom SIMD or unsafe code. Persist a minimal failing case in the owning proof set.
- Keep fuzz-only hooks and test helpers out of release behavior. A faster harness that bypasses the relevant validation cannot prove that validation.
- Concurrency-model exploration complements runtime integration when synchronization is custom; use the smallest model that preserves the actual invariant.

### Shared-state invariants

- Send and Sync establish type-level thread-transfer/sharing conditions, not transaction atomicity, progress or freedom from deadlocks.
- Prefer an existing synchronization abstraction when it expresses the invariant. For custom atomics, document the publication/observation relationship before selecting memory orderings.
- Relaxed operations are atomic for their object but do not publish unrelated data. Acquire/release correctness depends on the actual synchronization relationship, not merely using those names somewhere.
- Specify compare-exchange success/failure ordering and ownership on both paths. Include ABA/reclamation and cancellation when the design exposes them; a pointer-sized atomic does not establish pointee lifetime.
- Make fallible growth and input bounds explicit where resource exhaustion is part of the contract. A local fallible reservation does not make every allocation or native call recoverable.

### Profile-directed compilation

- Instrumented and sample-based PGO use different profile formats and compiler inputs; do not interchange them. Match profiles to the intended source, targets and representative workload, then assess held-out traffic and code size. A fresh stable release enabling a facility does not justify changing an unrelated reproduction pin.

### Allocator selection

- Rust 1.100 stabilizes Allocator facilities, but availability is not a reason to replace the global allocator or introduce an arena. First identify allocation lifetime, peak retention and the measured bottleneck; reuse safe existing implementations where they meet the contract.
- An approved custom allocator must uphold alignment, zero-sized allocation, compatible deallocation, movement/equivalence and grow/shrink failure guarantees. Its storage must outlive every issued live allocation; bulk reclamation must not bypass required destruction.
- Compare allocation cost and retained capacity under realistic size distributions and cross-task lifetimes. Faster local allocation can lose through fragmentation, synchronization or delayed reclamation; preserve the safe reference and supported-target evidence.

## Proof

- The owning workspace declares proof targets. Put new public behavior and intentional failure outcomes under contract proof.
- Cover ownership-sensitive behavior and documented safety/failure contracts; feature and packaging matrices belong to the owning engine or part.
- Use a simple safe oracle before unsafe/SIMD and prove equivalence across alignment, zero length, adversarial sizes, target-feature fallbacks and error boundaries.
- Use complementary methods for memory and ownership defects and retain tests for relevant invariants; a clean result covers only what was actually examined.
- Benchmark a pinned release profile against the reference with identical inputs and correctness checks. Record compiler/target/features, allocator and relevant cost; the engine owns whole-service comparison.
- Use the profiling profile to attribute hot work and repeat clean timing without profiling. Show aggregate service behavior where an isolated optimization changes queuing, memory or I/O.

## Sources

- [Rust stable releases](https://doc.rust-lang.org/stable/releases.html) · [Cargo resolver](https://doc.rust-lang.org/cargo/reference/resolver.html)
- [Rust behavior considered undefined](https://doc.rust-lang.org/reference/behavior-considered-undefined.html) · [Pin](https://doc.rust-lang.org/std/pin/index.html) · [Vec](https://doc.rust-lang.org/std/vec/struct.Vec.html)
- [Miri](https://github.com/rust-lang/miri) · [Rust sanitizer instrumentation](https://doc.rust-lang.org/nightly/unstable-book/compiler-flags/sanitizer.html)

[Target support](https://doc.rust-lang.org/rustc/platform-support.html) · [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html) · [Rust fuzzing guide](https://rust-fuzz.github.io/book/cargo-fuzz/guide.html).

[HashMap invariants and hashing](https://doc.rust-lang.org/std/collections/struct.HashMap.html).

[Atomic ordering](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html) · [Send](https://doc.rust-lang.org/std/marker/trait.Send.html) · [Sync](https://doc.rust-lang.org/std/marker/trait.Sync.html) · [Fallible reservation](https://doc.rust-lang.org/std/vec/struct.Vec.html#method.try_reserve).

[Formatting destinations](https://doc.rust-lang.org/std/fmt/trait.Write.html) · [Byte I/O destinations](https://doc.rust-lang.org/std/io/trait.Write.html).

[Minimum supported Rust](https://doc.rust-lang.org/cargo/reference/rust-version.html) · [Toolchain selection](https://rust-lang.github.io/rustup/overrides.html).

[Rust PGO](https://doc.rust-lang.org/rustc/profile-guided-optimization.html).

[Buffered writer completion](https://doc.rust-lang.org/std/io/struct.BufWriter.html).

[Allocator safety contract](https://doc.rust-lang.org/std/alloc/trait.Allocator.html).

## Routing

This is a terminal language skill. Return to the calling route after reading it and inspect the workspace manifests, lock and proofs for the area.
