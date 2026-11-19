# Desktop part

## Contract

Own the desktop surface that the web part builds from the same tree, and its host/renderer architecture. Apply shared surface knowledge from the part dispatcher; the selected runtime library owns its APIs and packaging mechanics.

## Structure

The page shares the web part's surface layers, specs, DOM elements, build and tests.
src/render/bridge binds the page to the host at boot; src/render/host owns the contract, host, view and packaging.
The runtime remains replaceable behind that contract.

## Rules

### Capability boundary

- Product specifications supply roles, screen behavior, manifests and API contracts to the engine's spec capability.
- The page reaches host capability only through a narrow contract. Add the request/signal, validated host handler, implementation and consumer binding together.
- Treat messages and navigation as untrusted. Bound inputs, paths, payload bytes, pending requests and deadlines; refuse unsupported host operations explicitly.
- Grants belong to the current document/window and operation. Revoke them on navigation or teardown; an old ready event cannot authorize a new document.
- Restrict origin and content policy. Untrusted remote content must not gain privileged bridge operations.
- Product configuration owns API origin and update audience. Packaged artifacts are public, not secret storage.

### Window lifecycle

- The product selects when its window becomes visible. For ready/fallback policies, stale readiness or timers must never target a replaced/closed window.
- Bind host ports before consumers; handle an unavailable host and timeouts with explicit page states.
- Window close, view replacement and navigation settle pending operations and release owned listeners, timers and view references.
- Preserve independent desktop adapters and shared surface contracts. Keep preferences separate from privileged credentials and remote authority.
- Apply shared accessibility/state requirements to keyboard control, focus, dense layouts, long content and actual window geometry.
- The selected runtime guide owns renderer differences, RPC APIs, installer signing and update implementation.

## Proof

Cover page/host contracts, malformed requests, unavailable capabilities, navigation, close/reopen and long-running use.
Use affected OS and packaged artifacts for native claims; source inspection or a compatibility environment is not target-platform evidence.

## Sources

Shared part contracts and the selected desktop runtime's integration knowledge.

## Routing

Continue through [engines](../../engine/index.md) with this part and the inherited product preferences and implementation context.
