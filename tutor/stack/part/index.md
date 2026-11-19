# Parts

## Contract

Shared architecture of product workspaces, independent of any product's business or identity.

## Structure

Product-owned code applies these general architectures. Optional fragment skills supply only additional product choices; absence means use the general contract unchanged.

## Rules

A full product visits every applicable part. A subset visits exactly that subset and necessary knowledge.
Shared vocabulary and contracts do not require identical runtime architecture across a server, browser, phone and desktop.
Cross-part effects are communicated through owned contracts; no import of another product's private code.

### Cross-part contracts

- The producing boundary owns each versioned schema and behavior; consumers use that declaration rather than restating it. API knowledge owns HTTP contract selection; product knowledge supplies business meaning.
- Select representation, authentication, pagination and event framing from the actual boundary and consumer requirements. A working implementation is compatibility evidence, not a universal format for unrelated products.
- Preserve an established contract until its owner approves a transition. Removing an overgeneralized knowledge rule does not authorize changing existing payloads, credentials or clients.
- Define units, precision, missing values and cross-language serialization in the owning schema. Business rules determine currency scale, rounding and civil-time intent; a generic conversion cannot invent them.

### Shared surfaces

- Surface specifications compose registered features into roles, screens, layouts and navigation through validated settings and bindings. Product identity and content remain spec/brand data; the engine owns compilation and runtime mechanics. A configuration DSL cannot create an unimplemented capability.
- Separate portable mechanisms, transport contracts, presentation state, reusable UI and product features. Dependencies follow responsibility; a single linear folder chain cannot express every valid edge. The selected part owns its layout, and existing consumers retain their compatibility contract.
- In the spec-driven architecture, elements own presentation semantics and accessibility; components compose coherent interactions; features connect business behavior to contracts and the spec runtime. Keep generic UI free of endpoint and product policy. Local interaction state differs from business orchestration; these responsibilities do not mandate empty folders or forbid justified composition.
- Expose semantic variants and composition slots with explicit contracts. Extend the owning primitive for a recurring presentation need rather than scattering raw styles through consumers or multiplying one-off elements. Use meaningful alternatives instead of unexplained Boolean combinations.
- Hooks bind presentation lifetime and product decisions to owned mechanisms. Delegate general scheduling, storage, networking and state machinery to the engine; a branch or loop implementing product policy is not automatically engine work.
- A feature's consumer contract groups the operations, options, permission requirements and states it needs, potentially across several endpoints. Use the authoritative cross-part contracts above and the engine client; do not create another transport implementation.
- Use semantic typography, spacing, color, elevation and motion tokens. Light/dark art directions, keyboard/touch, RTL/LTR, focus, text expansion and reduced motion are designed behavior.
- Assign token scales by semantic category so related controls remain coherent. Product brand selects palettes and illustration style; no fixed color family, icon treatment or animation on every interaction is a universal surface rule.
- Loading, empty, partial, offline, validation, denial, error, success and confirmation are explicit states where applicable.
- Preserve agreed shared contracts without requiring identical rendering or runtime structure. Product identity and business remain in their product knowledge.
- A role or project grouping is organizational context, not tenant isolation. Keep compiled output, state identities and public/private assets scoped deliberately; optional grouping names do not establish security boundaries.
- A surface binds host adapters before consumers and tears down owned bindings with their screen or application. Engine and library guides own their respective mechanics.
- Bind asynchronous results to the active identity, route and operation revision; a late response cannot overwrite a newer view or another tenant's state. Cancellation is useful but not the only stale-result guard.
- Compose mutation states from the API outcome: optimistic display, pending acknowledgement, confirmed result and unknown outcome are distinct. Reconcile or roll back the affected operation under product policy without discarding newer edits; use the engine's revision and replay mechanisms.

### Consumer-driven improvement

- Compose the requested behavior through the engine's actual public capabilities. Describe any reusable gap by inputs, outputs, limits and failures; the engine owns its evolution and composition-cost rules.
- Apply root/work's delegation policy for engine changes. Integrate the improved capability without duplicating it or shrinking the business requirement; preserve product-owned decisions under root/arch.

## Proof

Every selected part has an owner, engine route and applicable consumer preferences, if any.

## Sources

Child architecture skills; product fragments supply business context.

## Routing

| Selected part              | Child                       |
| -------------------------- | --------------------------- |
| api                        | [api](api/index.md)         |
| infra                      | [infra](infra/index.md)     |
| web                        | [web](web/index.md)         |
| mobile                     | [mobile](mobile/index.md)   |
| desktop (a surface of web) | [desktop](desktop/index.md) |

Enter here from a product, an optional fragment, or a general part task. Preserve product preferences and selected implementation as context.
Each child routes to the engine dispatcher, never a specialized engine directly.
