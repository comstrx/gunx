# TypeScript engine

## Contract

A product-free TypeScript workspace supplies general mechanisms to the surfaces. Members form a DAG and one facade exposes them; business and surface frameworks stay outside.

## Structure

Root package.json owns workspace, catalog and lockfile. Bun owns package/tool execution; Biome owns the existing lint configuration. Each src/<member> owns a concern and declares its dependencies; src/engine is the facade. Tests, benches and fuzz are separate proof folders.

## Rules

- Apply the engine purity, fault, visibility and dependency laws. A business decision stays in its product; line count is not a reason to move it.
- Members are independently importable; none imports the facade. Dependencies enter the owning member door and use workspace or catalog references.
- Shared runtime code supports browser, Bun, Node and Hermes without Bun, process, Buffer, require or node:/bun: imports; tooling stays separate. It uses ports and adapters instead of runtime globals and checks. Adapter owns host access; unbound capabilities refuse honestly. Native bindings belong at surface boot.
- API, spec and tool are terminal peers: no capability member imports them, and they do not import one another. A surface passes the API catalogue to spec compilation.
- API owns wire, contracts, client, envelopes, realtime and fakes; spec owns schema, compilation and runtime; state, cache, history and device retain their own concerns.
- Compile role schemas against manifests, catalogue, messages and capabilities; reject invalid bindings and cycles. Serialize the result so the compiler need not ship to a surface.
- A new member or verb needs an owner and proof.
- Keep facade exports limited to deliberately owned public contracts. Metadata access has a declared owner; manifests and lockfiles establish the installed dependency state.

### Workspace and ports

- Root catalog pins dependencies once. Private members are engine-<directory>, export src/index.ts and carry descriptions of at most 80 characters; siblings use workspace references and libraries use catalog references. The facade declares one namespace and subpath per member; consumers never enter internal files.
- React and selected surface-library guides own renderer resolution and transpilation. Tool and test members do not belong in shipped runtime closures.
- adapter owns host reading. Each port supplies an appropriate fallback or typed unavailable result; a surface binds native adapters at boot. Scoped test bindings restore their previous state.
- sideEffects false permits registration-only imports to be removed: locate fallback in the port and bind native adapters explicitly. Dispose listeners, timers, native handles and pending work with their owner.
- cache owns storage families and boxes; state owns stores and binding/selector mechanisms. A renderer binding follows the selected library's subscription contract. A box resolves its driver lazily; secure storage is a native adapter, not a property of every local cache.
- device owns host capability contracts, history owns navigation mechanics; the surface supplies platform implementations and permissions. Do not duplicate their verbs in hooks.

### Existing source and quality laws

- Preserve member purity: named exports, no source comments or eval, and console access only at its existing log owner. Tooling exceptions do not become runtime permissions.
- tests/laws.test.ts owns the engine's laws: host names stay behind their adapter and every member declares exactly the members it imports. Parser fuzz targets remain required.
- Preserve the exact install, minimum-release-age and named-exclusion policy in bunfig.toml, plus dependency security/license gates. If latest-stable or an urgent security update conflicts with a hold, report the concrete conflict for an owner decision; do not silently relax the gate or label an older pin latest.

### API and spec lifecycle

- API describes endpoints, input/output schemas, permissions and cache intent. Its client owns envelope parsing, request identity, fault mapping and retry policy; fakes and stubs use the same wire.
- Spec compilation checks blocks, feature settings, paths, ports, text keys, grants, actions, targets, navigation and topics against the surface catalogue and manifests. Reject invalid raw inputs and watch cycles with useful paths.
- Keep supplied feature/contract catalogues separate from product identity. Validate bindings against declared input/output and capability requirements; configuration must not become arbitrary executable expressions or a way to bypass authorization.
- A multi-role loader defines its grouping grammar and canonical identities explicitly. Normalize before detecting duplicate routes, roles or artifact destinations; report both conflicting source locations. Do not infer compiler behavior from a framework's folder convention.
- Keep compiled artifacts deterministic for the same declared inputs and compiler contract. Exclude runtime handles and secrets; bind named capabilities through the supplied runtime catalogue. Retain enough source location information for actionable schema diagnostics.
- Extend specs by a real compositional need: new state, option, binding or feature contract. Prove meaningful variants and rejected combinations through the compiled/runtime boundary; counting schema fields or copying branded screens does not demonstrate expressiveness.
- Serialize a compiled role at build time and revive it on the surface. Mount and unmount watches, triggers and live bindings with each screen; cleanup is part of correctness.
- Client visibility is UX, not server authorization.
- World catalogs may be lazy. Each consumer proves its runtime closure using its selected library's bundling contract. A closure snapshot and a deployed role bundle measure different things.
- Record public API changes intentionally. Parsers get fuzzing, adapters get unsupported and failure cases, integrations get real-service or exact-wire proof, and benchmark reports name workload, runtime and machine.

### Persistent state

- state owns schema versions, migration decisions, dirty state and consumer-visible conflicts; cache owns storage identity and atomic read/check/write coordination.
- Hydrating invalid or incompatible data does not silently overwrite it with initial state. No-change flush does not write. A successful explicit migration may commit under the transaction and revision check.
- A newer persisted version freezes older-code persistence, including later local edits; expose a typed conflict while allowing memory-only operation.
- Recheck inside every write transaction. Storage events aid detection, not mutual exclusion; sync=false cannot disable version protection.
- Legacy writers outside the coordination protocol require isolation during rollout; the consuming platform owns its storage-key and coordination integration.
- Lock identity includes backing storage plus key, across instances. Native or single-process operation can still race across awaits.
- Declare driver guarantees; unsupported strong shared persistence fails explicitly or requires a deliberate weaker-policy choice.

### Asynchronous state ownership

- Resource, action and feed completion must verify the active operation before publishing success or failure. Abort/reset and owner disposal invalidate stale commits, including already queued continuations; caller cancellation alone does not establish that guarantee.
- A required latest-operation guarantee belongs to state’s owned commit mechanism. Products supply the active identity and business transition; parts compose those values without duplicating a general state engine.
- Cover completion racing with abort/reset, a replacement operation and owner disposal. Observe both returned promises and committed state; a cancelled caller is not proof that stale data was never published.

## Proof

Cover independent members, the public surface, dependency direction, runtime closures and meaningful behavior. Exercise parser and state boundaries, adapter failures and actual consumers; keep representative performance questions separate. Choose appropriate methods within the assigned task and timing.

## Sources

The workspace manifests, member declarations and law proofs. Bun mechanics and their upstream references belong to the selected runtime library skill.

## Routing

Continue through [libraries](../../lib/index.md) with Bun selected and any surface-framework context supplied by the caller. The dispatcher resolves companion knowledge and language learning; return here for engine composition.
