# Engines

## Contract

One organizational model across languages: owned members, predictable verbs, explicit dependencies and proof beside the capability. Apply the equal quality ambition defined in vision.

## Structure

Each engine owns its workspace, capability units, public entry, proofs and configuration. The specialized engine defines their concrete layout; the shared model does not force every ecosystem into identical directories.
A capability is independently consumable through its declared dependency closure. Its public entry exposes the contract; implementation details remain private. A proof category need not be a directory when its tooling/configuration owns it.

## Rules

### Names and ownership

- Name the responsibility, not the technology or product. Short lowercase words where clear; use each language's casing rules.
- Keep equivalent operations semantically consistent across engines. Each engine owns its approved spelling and lifecycle distinctions; do not impose a fixed verb list independently of those contracts.
- Preserve existing approved API spelling until a deliberate compatibility change. Do not mass-rename to make a diagram tidy.
- Reject catch-all util/common/helper homes when a domain owns the behavior. File length alone does not decide a new member.
- No same-feature reimplementation in a consumer or higher member. Delegate through the public operation, never import sibling internals.
- Define ownership, inputs, outputs, error/fault vocabulary, cancellation, retry/idempotency, ordering, allocation and shutdown behavior.
- In-memory, local filesystem and distributed guarantees are different capabilities. Do not name them all atomic without specifying the boundary.

### Dependency graph

- Record member imports as a DAG; implementation libraries have one responsible adapter door.
- The facade aggregates outward and is never imported by members. A lower member never knows its consumer.
- Domain choices need not mirror other languages. Port proven semantics and failure cases, then redesign idiomatically.
- Public surface changes require explicit classification and relevant compatibility records; a snapshot update is not approval by itself.

### Lifecycle and adapters

- Explicit bootstrap validates configuration and provider capabilities before serving traffic; no network calls during import.
- Own connection pools, clients and subscriptions once per suitable runtime scope; don't create them per operation.
- Every acquire has release, every task has an owner, every stream has cancellation, every retry has a budget.
- Adapters expose one semantic family with explicit capabilities and unsupported features. Refuse a required guarantee before starting effects; do not accept an option that the provider ignores.
- Deadline includes queue/pool wait. Backpressure and bounded waiters prevent overload turning into memory exhaustion. State separately when a caller stops waiting, underlying work stops and resources are reclaimed; timeout alone proves none of the latter.
- Transaction/outbox/inbox facilities provide mechanism; consumers choose business atomicity and effects.
- Close must state drain/cancel behavior, deadline and treatment of in-flight operations. Recovery must not double-register subscribers or tasks.
- Validate invariant configuration and compile reusable plans during binding or registration; keep request values and mutable authorization request-scoped. Cache only with a defined identity, invalidation and lifetime.

### Provider contracts

- Normalize equivalent meanings, not merely similar field names. Separate accepted, pending, completed, rejected and unknown outcomes where the provider family distinguishes them; a transport success is not a completed business effect.
- Declare capability support per operation and guarantee. A provider switch is compatible only for the capabilities the consumer requires; adding an adapter file alone does not establish substitutability.
- Own public request/result values and faults, including nested values, iterators and callbacks. Keep SDK objects inside the adapter except for deliberately approved compatibility exposure under root/arch.
- Preserve missing, unsupported, unknown and zero as distinct values where meaningful. Normalize units and precision without inventing amounts, timestamps or states absent from the provider response.
- Expose useful provider-specific capability through a typed, checked extension at its owner. Do not silently discard it to fit a smaller common denominator or force every provider's fields into every ordinary call.
- Raw evidence, when required, is bounded, access-controlled and retained under the consumer's policy; it is not a business-logic escape hatch around normalization. Signature verification may require original bytes before parsing; a decoded or redacted record is not equivalent evidence.
- Provider credentials and protocol details belong in validated adapter configuration. Shared verb names do not require identical credential fields or authentication schemes.

### Capability semantics

Inspect the relevant family when developing it; this table neither mandates new members nor enables every capability in every product.

| Family                          | Distinctions the public contract must preserve                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data and query                  | Transaction ownership, isolation, stable pagination order and bounded iteration; provider features are explicit capabilities.                                                        |
| Cache and local memory          | Miss versus stored null, freshness versus retention, invalidation scope and process-local versus shared coordination; stale serving is a declared policy.                            |
| Broker, queue and events        | Publication acceptance, delivery, handler completion and durable business effect; ordering, replay and deduplication have explicit scopes.                                           |
| Schedule                        | Civil-time zone and clock changes, missed/overlapping runs, manual invocation and retry identity; pause stops admission unless in-flight cancellation is also promised.              |
| Payment and messaging providers | Authorization, capture, settlement, refund or delivery states remain distinct where applicable; units and replay rules follow the operation, not an invented universal success flag. |
| External model inference        | Local history and provider-managed session identity differ; streaming, structured output, attachments, usage and cancellation require declared support.                              |

Lifecycle and introspection verbs describe real operations; naming consistency does not justify a meaningless method. Introspection reports registered and active work without exposing private payloads. Where stale workers could corrupt effects, the protected resource must reject stale authority through its supported revision/fencing contract; lease expiry alone does not stop a worker.

### Service performance evidence

- Keep hot paths narrow and monomorphic where the ecosystem benefits; measure before adding caches, pools, unsafe code or specialization.
- Apply root/arch's performance and measurement-validity contracts to the actual service path. A router microbenchmark does not establish whole-engine performance.
- Specify the service's payload distribution, worker/pool limits, protocol, TLS, durability and cache-hit mix. Include the owned queues, provider connections and all worker processes in its resource model.
- Attribute costs through the selected language/library mechanisms, then verify the effect through the real consumer boundary. Preserve error and overload behavior while optimizing.

### Capability evolution

- Start from the consumer's required behavior and identify the missing general mechanism. Existing engine sophistication is not a reason to dismiss a real gap.
- Inspect existing owners before adding a member. A repair may extend an operation, parameter, adapter, supported state, failure mode or composition rather than add a new package.
- Consider simplification equally: extend the existing DSL, improve parameters/defaults, merge equivalent capabilities without losing behavior, or remove unnecessary steps. Added code, parameters or members are not measures of engine evolution.
- Every option has semantics, a bounded valid domain, interaction rules and a useful default where possible. Avoid Boolean combinations that create unexplained states; use coherent policies or explicit variants when they clarify intent.
- Keep the ordinary case short and demanding cases expressible. Public API growth must pay for itself in real capability or clearer behavior.
- Review behavioral compatibility as well as signatures: defaults, failure classification, cancellation, ordering and persisted/wire representations can change consumers without changing a function name. Identify affected consumers and transition before changing them.
- Exercise defaults, omitted versus explicit values, supported option interactions and unsupported combinations. More parameters without distinct useful behavior are not capability growth.
- Prove the general contract with neutral examples and relevant edge cases, then integrate the consumer. A product's private policy remains outside the engine.
- One executor may own both sides under root/work's delegation rule. Role allocation changes coordination, not code ownership.

### Evidence design

- Separate invariant tests, adapter contracts, actual integration, consumer behavior and performance questions. Each needs an observable failure criterion and an assertion that detects the stated defect; file, test or coverage counts do not prove it.
- A capability needs contract evidence before broad adoption; usefulness is not counted by imports alone. Use an independent model or known case where testing through the same implementation would reproduce its mistake.
- Fault injection targets acquisition, partial startup, timeout, cancellation, commit ambiguity, retry, reconnect and shutdown. Assert resource recovery and durable effects, not only the returned status.
- Stateful exploration varies operation sequences and interleavings against an explicit model. Generate enough valid state transitions to reach deep behavior, alongside invalid boundary cases; a campaign that only exercises early rejection provides narrow evidence. Bound input sizes, steps, memory and runtime; retain minimal reproducible failures.
- Round-trip tests alone can preserve a shared encoder/decoder mistake. Include independent expected values, malformed/non-canonical inputs and required compatibility cases; a rejected input must leave state and resources valid.
- Fakes model declared capabilities and faults; run the same contract against real providers when that boundary matters. A mock cannot prove real concurrency or transport semantics.
- Organize adapter acceptance by required capability and failure boundary. Cover absent fields, unsupported options, partial results, replay and cancellation; successful authentication or one happy-path request does not qualify an entire provider.
- Test DSLs may compose request, state and exact-result assertions; they must preserve underlying failures and useful diagnostics. Do not verify a normalizer solely by creating expected results through that same normalizer.
- Frame an engine benchmark around a consumer capability and an explicit hypothesis. Apply root/arch’s measurement-validity contract; the selected ecosystem owns the diagnostic and runner mechanics.
- Select adversarial cases from the capability boundary: tenant/key isolation, spoofed identity, parser/decompression limits, destination/path control and cleanup under cancellation. Assert the invariant rather than merely expecting an exception.
- Keep portable contracts independent of test host; exercise native adapters and installed/extracted artifacts on their supported targets when execution is authorized.

### Composition costs and bulk capabilities

- Trace the consumer's complete operation before adding abstraction: repeated calls may reveal a missing bulk operation, incremental iterator or reusable prepared plan. Change the responsible mechanism when this removes repeated work without moving product decisions into it.
- A bulk operation declares item/result correspondence, ordering, partial failure, cancellation and commit scope. A provider's batch is not automatically atomic; a fallback loop must preserve promised semantics and bounded admission.
- For timing, entropy, I/O or scheduling needed by proof, use the owning existing port or narrow seam. Controllable fixtures must not add production-only test flags, weaken real validation or expose an alternate public DSL solely for the harness.

## Proof

For each new member: justified owner, single public facade, DAG placement, contract/failure evidence and a real consumer need or owner-approved foundation scope.

## Sources

Specialized skills own ecosystem evidence; universal invariants are taught in root.
[wrk2 measurement model](https://github.com/giltene/wrk2) · [HdrHistogram](https://github.com/HdrHistogram/HdrHistogram). These references do not select a benchmark tool or authorize load.

[Publisher and consumer acknowledgement boundaries](https://www.rabbitmq.com/docs/confirms) · [Provider replay semantics](https://docs.stripe.com/api/idempotent_requests) · [Authenticated webhook bytes and ordering](https://docs.stripe.com/webhooks) · [Provider currency units](https://docs.adyen.com/development-resources/currency-codes) · [Lease limits](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/).
These sources support semantic distinctions; they do not select providers for consumers.

[State-machine exploration](https://hypothesis.readthedocs.io/en/latest/stateful.html).

## Routing

| Selected engine | Child                             |
| --------------- | --------------------------------- |
| bash            | [bash](bash/index.md)             |
| go              | [go](go/index.md)                 |
| python          | [python](python/index.md)         |
| rust            | [rust](rust/index.md)             |
| typescript      | [typescript](typescript/index.md) |

Choose from caller context, manifests and owner scope, resolving physical source coordinates through root/tree. No silent default for an unspecified API language.
All-engines scope visits every child. Each child routes through the library or language dispatcher; return here after its branch.
