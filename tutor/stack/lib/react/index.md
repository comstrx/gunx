# React

## Contract

Own React rendering, hooks and external-store integration. The selected framework owns its host renderer and build integration; engines own state mechanisms.

## Structure

Components consume typed Props; custom hooks use use<Name>. Render remains free of side effects and direct host-global reads.
One compatible React instance serves each rendered application; the selected framework owns resolution and renderer compatibility.

## Rules

- Keep hook ordering stable. Bind host effects and subscriptions to lifecycle, releasing them when their owner ends.
- Use `useSyncExternalStore` for an external mutable store binding. Return immutable snapshots with stable identity while data is unchanged; cache the snapshot when necessary.
- Subscribe returns cleanup. Stable subscription identity avoids needless resubscription.
- The server snapshot and initial hydration snapshot agree; provide the server snapshot when supporting server rendering.
- Avoid retaining screens or large responses through captured subscriptions. Observe repeated mount/unmount and identity changes.
- Engine state owns its public selector DSL; this guide owns React's integration requirements, not that engine's implementation.

### Rendering decisions

- Keep render pure and derived values derived; use effects for synchronization with external systems. Do not duplicate derivable state through effect chains.
- Place state near its consumers and preserve intentional identity through keys. Memoization is a measured optimization, not a correctness guarantee or a substitute for ownership.
- State belongs to component type and position/key in the rendered tree. Removal, replacement or a changed key can reset it during client navigation; navigation alone is no preservation guarantee. Keys identify siblings, not global state records.
- Development StrictMode can expose missing cleanup through repeated setup/rendering. Correct the lifecycle instead of disabling checks to conceal the behavior.
- An interrupted or abandoned render must not commit external effects. Keep subscriptions and mutations in their proper committed lifecycle.
- A transition callback runs immediately; marking updates as non-urgent does not offload synchronous CPU work. Controlled text input updates stay urgent.
- Custom asynchronous transition actions can finish out of order. Select a supported ordering-aware action API or implement the surface’s operation-revision contract; transition scheduling alone does not order responses.

### Run, test and profile

- React has no independent application build server: the selected host/framework owns Linux/macOS/Windows tooling and browser/native execution. Do not introduce a second application runtime for this guide.
- Await relevant asynchronous updates before assertions; React's async act contract, directly or through a compatible testing helper, establishes the testing boundary.
- Assert observable output, interactions, cleanup and hydration behavior. Renderer mocks and snapshots do not establish real layout, accessibility integration or native behavior.
- Profiler actualDuration describes rendering work; it does not measure complete interaction latency, layout, network or native/GPU cost. Use profiling-capable builds deliberately and compare clean production behavior separately.

### Compiler and state boundaries

- React Compiler can reduce manual memoization when supported and enabled by the host build. Confirm the compiled output and diagnostics; do not assume installing React enables it.
- Existing useMemo/useCallback behavior is not removed wholesale during adoption. Preserve observable identity/lifecycle contracts and compare affected interactions.
- Use the engine-owned mechanisms for shared or persisted state; products retain their data and business policy. React owns subscription/render integration and local presentation state, not another persistence or state engine.
- Judge user-visible responsiveness through the host renderer; a lower component render count alone does not prove lower interaction latency.

### Effect event selection

- In supported React releases, useEffectEvent lets an Effect-owned event read current committed values without resubscribing for those values. It is not a shortcut for removing reactive dependencies: values that require resynchronization remain dependencies.
- Call Effect Events only from Effects or local Effect Events; do not pass them to other components/hooks or use them as general callbacks. Follow the installed hooks-linter contract and do not rely on their function identity.

### Deferred and retained rendering

- useDeferredValue changes rendering priority; it is neither debounce nor request suppression. Keep request admission and stale-result ownership at their existing owners, and indicate stale presentation when the interaction requires it.
- Activity preserves hidden UI state and DOM while cleaning up Effects. Hidden is not destroyed: retained trees still cost memory, and media or other DOM side effects may need explicit Effect cleanup.
- Select retention for likely reuse, not every historical screen. Compare repeated hide/show, subscriptions, interaction latency and retained memory through the host renderer; apply supported-version and renderer compatibility before adoption.

## Proof

Cover subscription cleanup, snapshot identity, lifecycle and server/hydration consistency where supported.

## Sources

[External stores](https://react.dev/reference/react/useSyncExternalStore).

[Render purity](https://react.dev/reference/rules/components-and-hooks-must-be-pure) · [StrictMode](https://react.dev/reference/react/StrictMode) · [Async test updates](https://react.dev/reference/react/act) · [Profiler](https://react.dev/reference/react/Profiler).

[React Compiler adoption](https://react.dev/learn/react-compiler/introduction) · [Transition semantics](https://react.dev/reference/react/useTransition).

[State identity and reset](https://react.dev/learn/preserving-and-resetting-state).

[Effect Events](https://react.dev/reference/react/useEffectEvent).

[Deferred rendering](https://react.dev/reference/react/useDeferredValue).

[Activity lifetime](https://react.dev/reference/react/Activity).

## Routing

Read [languages](../../lang/index.md) with TypeScript selected, then return to the caller.
