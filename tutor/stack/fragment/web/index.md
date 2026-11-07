# web

`product/<project>/web` is one spec-driven Next surface engine on Bun over `engine/bun` (`library/next`): it builds every web role of the product from `specs/<role>` alone, client-only exported panels and server-rendered indexable sites. Its layers, spec DSL and feature contracts are the twins of `mobile` and `desktop`. Gate: `bun run check`, `bun run typecheck`, `bun test`, `bun run build --all`.

## The path

`elements/` + `icons/` → `components/` → `features/<name>/` → `api/<name>.ts`, rendered from `specs/<role>/schema`.

- **Elements** are the only files with markup, Tailwind classes and tokens: one job each, adapted only through semantic props (`sm md lg xl full auto disabled hoverable`, tones, states); `className`, `style` and attribute bags are refused; an element never composes an element; it owns its focus, keyboard, overflow and dismissal through `engine/dom`. No native-looking control survives: select, combobox, menu, pickers, switch, slider, file drop, tooltip, popover, dialog, drawer, tabs, pagination, skeleton, toast, scrollbars all carry a designed identity.
- **Components** compose elements and components without cycles and import exactly one hook, `hooks/use-<component>.ts`; no markup, no classes.
- **Features** are `features/<name>/{index.tsx, components/, hooks/}`: a thin entry over its own components; the business decision lives in the hooks; a feature never builds a complex piece from scratch.
- **Contracts** are `api/<name>.ts`: `transport` (endpoints, inputs, shapes, permissions) and `view` (owner, options, ports, access, signals); a look never touches a transport. A fake lives inside the feature file only while the endpoint does not exist; going real is deleting it.
- **The engine boundary** is responsibility: a reusable mechanism sinks into `engine/bun`; a business decision stays in a hook. File counts and fashionable libraries are never goals.

## Layout and layers

```
product/<project>/web/
├── src/{api, specs, stores, types, hooks, elements, icons, styles, components, features/<name>, app, proxy.server.ts}
├── specs/<role>/{config/{index,contents,contracts,features,settings,themes}.ts, schema/{index,<screen>}.ts, brand/{images,fonts,messages}}
├── tools/{core,compile,build,page,theme,serve,verify}.ts
└── tests/  benches/  messages/  public/  package.json  biome.json  bunfig.toml  tsconfig.json  next.config.ts  postcss.config.mjs
```

```
engine/* → api · types · specs → specs → api/base → stores → hooks · features/*/hooks → elements · styles → components · features/*/components → features → app
```

The analyzer (`bun run check`) enforces the order, the import rules, the `@spec/*` owners and the vendor homes: imports only, never size, syntax, markup or style. **Independence law:** this fragment owns its `src/` outright; nothing is shared with another product or another fragment; the engine is the only shared layer, and repeating a contract in a sibling fragment is not duplication.

## Specs

A spec is data: `config/` (contents, contracts, features, settings as a delta over defaults, themes), `schema/` (screens), `brand/` (assets, messages); `(group)` folders are transparent. The vocabulary stays small and composable and refuses invalid combinations at compile time; a new difference is not automatically a new option. Behavior, not flags: indexing, server rendering, localized urls and the export or standalone output derive from what the config and schema say. A role is a complete product from its spec; one feature serves every role, adapted by options from outside; a screen that needs a fork means the feature is wrong.

## Design

UI is not decoration; it is the product the client judges by the millimeter. The reference is the best operations consoles and consumer products in production that day (Apple HIG, Fluent, Carbon, Atlassian, and the strongest real products of the field), studied as evidence and never imitated; the previous local version is never the reference.

- Tokens and CSS as `language/typescript`. Radius, shadow, hover, press and focus are unified per category, never per element; thin unified scrollbars only on large regions; titles read `action | page | project`.
- Enterprise identity, never the AI look: no random gradients, card soup, glass, hollow heroes, decorative stats or purposeless motion; dense, restrained, hierarchical; sidebars and bars without a fill where the brand calls for it. Font icons for controls; original 3D cartoon art, brand primary with an orangered, orange and red break, only in big spaces (empty, error, celebration, welcome, offer, coupon, wallet, popups), centered in their holders, in `specs/<role>/brand/images` with source and license.
- Preferences (`language currency theme`) are first-party cookies; caches in local storage; drafts and the outbox per tab; tokens never in web storage.
- One system, no raw value: shadows, panels, borders, radius, spacing, type, transitions, popups, motion, z layers, densities and focus rings are tokens unified per category. WCAG 2.2 AA contrast, visible focus, correct roles and names; desktop first and truly usable at 390 px; keyboard, touch and reduced motion from the first line.
- Motion explains enter, exit, continuity and feedback, fast and restrained, from tokens that fall to zero under reduced motion; expressive motion only for real moments (onboarding, success, reward).
- Art: a consistent 3D family (one camera, one material language, one light), transparent backgrounds, the brand palette with controlled breaks; licensed or original, each with source and license; never random internet artwork.

## Every screen

Loading, empty, partial, error, offline, validation failure, permission denial, success, destructive confirmation, long and short content, missing media and realistic volume, with a skeleton shaped like what it replaces; empty and error art centered in the space it owns. Tables are server-driven and url-synced (sort, filter, search, saved views, selection, bulk actions, columns, export, virtualization). Forms validate on both sides, map field errors, guard unsaved leaves, survive retries and carry the whole payload a record can take. The server is the authority on permissions; a 403 is a designed state.

## How to add

- **An element:** semantic props, variants over tokens, `data-*`/`aria-*` states, a render test per state. **A component:** one file over elements, its hook, a test per state. **A feature:** `api/<name>.ts` registered in the index, its folder, placed by a spec with `feature("<name>", …)`. **A role:** `specs/<role>/` with its settings delta, contracts, screens and brand, green under `build --all`. **An engine verb:** in `engine/bun`, then one line here.

## Proof

Tests compile a real spec, render real elements in every state with exact classes and serve a real folder; the engine's members are tested in the engine. `build --all` weighs the first load of every page and audits what crawlers see. Visual truth: Playwright, one page at a time at full size, both themes, both directions, at 1440, 1024, 768 and 390, every control exercised (click, type, tab, hover, open, close, fail); fix the token or the primitive, never the pixel. A UI change is done when it is functionally correct, visually exceptional, brand-coherent, responsive, accessible, interaction-complete and visually verified; a screenshot alone proves nothing.
