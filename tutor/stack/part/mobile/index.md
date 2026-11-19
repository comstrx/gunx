# Mobile part

## Contract

Own mobile-surface architecture, native capability boundaries and application lifecycle. Apply shared surface knowledge from the part dispatcher; the selected library owns its renderer and build system.

## Structure

Use the shared surface responsibilities with native elements and explicit host bindings.
src/render/bridge binds host adapters at boot and src/render/host owns native views; the surface owns app identity, permissions and packaging configuration.

## Rules

### Native composition

- Supply product role definitions, manifests and contracts to the engine's spec capability rather than implementing another compiler.
- Features consume the declared API/runtime and engine ports; native adapters own host access and permission integration.
- Bind storage, device, appearance and navigation before consumers. Ordinary preferences are non-secret; session material needs an appropriately secure platform store.
- Design permission refusal, revocation and missing hardware as normal states with recovery.
- Preserve agreed shared contracts while retaining native elements and ownership. Web modules are not assumed compatible with a native runtime.
- Apply shared accessibility and state requirements to safe areas, keyboard, touch, text expansion, native framing and motion.

### Recovery and background work

- Private data and queued work belong to an authenticated owner. Clear or revalidate them when identity changes according to product policy.
- The product decides how queued actions, local drafts and permissions change; the engine supplies cancellation, namespacing and replay mechanisms.
- Offline work exposes pending, retry and failure honestly; it cannot assert a remote outcome.
- Resuming after suspension requires rechecking server state, credentials and permissions before replay.
- Background scheduling is OS-controlled; do not promise exact execution times, permanent sockets or unlimited work.

## Proof

Cover roles, native interaction, permission transitions, offline/foreground recovery and actual packaging.
Measure release startup, retained memory, frame behavior and battery on representative devices. Library guides own runtime-specific measurement and build details.

## Sources

Selected product requirements, shared part contracts and the chosen mobile library's platform integration.

## Routing

Continue through [engines](../../engine/index.md) with this part and the inherited product preferences and implementation context.
