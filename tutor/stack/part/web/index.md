# Web part

## Contract

Own browser-surface architecture, web presentation and artifact boundaries. Apply shared surface contracts from the part dispatcher; selected libraries own rendering and build mechanics.

## Structure

Map the shared surface responsibilities to the selected web implementation. Preserve its established dependency DAG; role specs, tools and tests retain their own ownership.
The app owns browser entry points and routes; features own product behavior. Elements own semantic DOM and browser styling.

## Rules

### Product rendering

- Supply role definitions, feature manifests, contracts, catalogue, brand and messages to the engine's spec capability. Its guide owns compilation and runtime semantics.
- Identity, navigation, metadata and public stance come from product specifications. A surface renders that intent without duplicating the compiler.
- Derive the required rendering/deployment capability from declared routes, data freshness, identity and content needs. Reject inconsistent configurations before building; neither a lone SEO flag nor an empty endpoint list proves the chosen mode is valid. The framework guide owns which modes support those requirements.
- Apply the shared state and accessibility contract using semantic markup, logical CSS properties and browser focus/navigation behavior.
- Utility styling belongs in elements and icons; features consume semantic presentation rather than owning another design system.
- Bind browser capabilities through engine ports. Use engine state/cache for preferences; session tokens do not belong in web storage.
- Private data and authorization cannot depend on client visibility, prerendering or embedded public configuration.

### Browser and artifact lifecycle

- Start initial HTML in the role locale; hydrate preferences without contradicting its initial state.
- Preserve title, lang, dir, focus, deep links and navigation through reloads. Canonical/alternate links, sitemap and indexing follow actual public content.
- Product specifications choose locale URL policy and title composition. Keep screen/action identity meaningful across tabs and history; a fixed title separator or different locale policy for an administrative role is a product preference, not a browser law.
- Private or unlisted roles are not indexable by default. The product owns which content is public.
- Static artifacts need a compatible CSP, such as reviewed hashes. A nonce must be fresh per response; do not embed a reusable nonce in exported HTML.
- The selected framework owns static/served build behavior and source transpilation. A source layout alone does not prove the deployed artifact's capabilities.

### Large and dense surfaces

- Choose pagination, windowing or incremental loading from the actual data and interaction contract. Virtualization bounds rendered nodes, not fetched data, retained responses, subscriptions or per-item state; budget each separately.
- Preserve stable item identity, logical focus, selection and scroll anchoring as rows enter or leave the rendered window. New chat messages must not silently displace a user reading older content.
- For virtual tables/grids, expose truthful logical totals and row/column positions to accessibility APIs when the DOM omits them. Keep focused/edited items reachable and choose semantics appropriate to interaction, not visual appearance alone.
- Design overflow and scroll ownership at the container boundary. Do not hide scrollbars or clip content to conceal a layout defect; keyboard and touch users must reach all actions. Overflowing tab lists retain focus, active-item visibility and directional navigation.
- Judge these behaviors with realistic long/localized content and sustained interaction on the target device class. A small visible list or lower initial DOM count does not establish steady memory or responsive scrolling.

### Browser identity boundaries

- Distinguish origin from site and cookie scope. Browser storage follows its origin/storage partition; cookies follow host/domain, path, secure transport and same-site policy, with no isolation by port. Browser privacy restrictions can further partition or block storage.
- Choose narrow credential-cookie scope and server enforcement. Cookie Path is a delivery filter, not an authorization boundary; HttpOnly restricts script access without preventing an authenticated request from being sent. Keep CSRF and operation authorization explicit.
- A browser profile, device, tenant and server replica are different identities. Server deployment does not synchronize client persistence or determine whether a rendered component survives navigation; the renderer owns component lifetime.

### Shared browser persistence

- Web Locks coordinate cooperating same-origin contexts; they do not lock localStorage against legacy writers.
- Isolate a new format with a new storage key when old deployed code ignores the coordination protocol. Treat legacy reads as migration input without overwriting the legacy key.
- Storage events help observe other contexts; they are not mutual exclusion. Bind a coordinator only with its actual guarantees.
- Engine state owns version decisions and conflicts; cache owns transactional coordination. The browser adapter supplies the platform mechanism.

## Proof

Cover affected roles, contracts, navigation, metadata, persistence and reload across relevant sizes, themes, directions and states.
Judge the intended experience in the built browser surface; framework build results are a separate concern.

## Sources

[Web storage](https://html.spec.whatwg.org/multipage/webstorage.html) · [Web Locks](https://w3c.github.io/web-locks/) · [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

[Cookie scope and isolation](https://httpwg.org/specs/rfc6265.html) · [Current HTTP cookie work](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html).

[Virtual table structure](https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/) · [Grid interaction](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) · [Keyboard focus](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).

## Routing

For a desktop build, study [desktop](../desktop/index.md) first and return here. Continue through [engines](../../engine/index.md) with this part and the inherited product preferences and implementation context.
