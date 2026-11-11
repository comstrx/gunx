# web

`product/<project>/web` is one spec-driven Next surface engine on Bun over the Bun engine: it builds every web role of the product from `specs/<role>` alone, a static export by default and a standalone server when `WEB_OUTPUT=standalone` asks for one. Its tree, layers, spec DSL, contracts, stores, hooks, styles and tests are the twins of `mobile` and `desktop` to the file name; only `app/` (Next's), `elements/` (DOM markup) and `native/` (absent here: the engine's web adapters answer every port) differ. The web is the surfaces' harness: what the three share is proven here first, in a browser.

## The path

`elements/` → `components/` → `features/<name>/` → `api/<name>.ts`, placed by `specs/<role>/schema`, rendered by `app/screen.tsx` under the spec runtime and reached through `app/nav.tsx` over the engine's history.

- **Elements** (`src/elements/{block,heading,text,button,link,dialog,skeleton,title}.tsx`) are the only code with markup and Tailwind classes: one job each, semantic props only (`Block` direction gap align justify padding surface width height wrap; `Heading` level look; `Text` tone size weight; `Button` look size width pending; `Link` href look current onNavigate; `Dialog` open kind label labelledBy onDismiss; `Skeleton` size width; `Title` text), `data-ui` and `data-*` states, variants through `world.variants` over the token custom properties; `className`, `style` and attribute bags are refused; an element owns its focus, keyboard, overflow and dismissal. The same names with the same props (`elements/contract.ts`) exist on every surface.
- **Components** compose elements and components without cycles and import exactly one hook, `hooks/use-<component>.ts`; no markup, no classes.
- **Features** are `features/<name>/{index.tsx, hooks/}`: a thin entry over its components; the business decision lives in the hooks; registered once in `features/index.ts`; a feature registers its actions on the spec runtime (`live.handle("hello.refresh", …)`) and publishes its topics on its bus.
- **Contracts** are `api/<name>.ts`: `transport` (endpoints, inputs, shapes, permissions, cache) and `manifest` (the feature's `spec.Manifest`: settings schema, ports, actions, emits, signals); `api/index.ts` is the one client over `api.create`, the `manifests` map and the `catalogue` the compiler checks bindings against. A fake lives inside the feature only while the endpoint does not exist.
- **The render layer** is `app/`: `layout.tsx` (html lang and dir from the surface locale, the font preloads, the layout metadata), `[[...path]]/page.tsx` (one catch-all route: `generateStaticParams` from `pathsOf()`, `generateMetadata` from `metadataOf()` with `title: null`), `nav.tsx` (the menu from the spec through `menu(locale, at)`, `Link` with `onNavigate={navigate}`, the theme cycle, the locale toggle), `screen.tsx` (mounts the screen matched by `usePath`, renders its blocks and `<Title>`, the document title as React's hoisted `<title>` from `elements/title.tsx`), `robots.ts` and `sitemap.ts` (from `publicOf()` and `siteOf()`). Navigation is router-free: `hooks/use-path.ts` creates the engine navigator lazily (`history.create()` after boot, never at import) and `usePath` follows it through `useSyncExternalStore`.
- **The engine boundary** is responsibility: a reusable mechanism sinks into the engine; a business decision stays in a hook.

## Layout and layers

```
product/<project>/web/
├── src/{types, api, specs, stores, hooks, styles, elements, components, features/<name>, app}
├── specs/index.ts (roles, current)  specs/<role>/{index.ts, config/{index,contents,contracts,features,settings,themes}.ts, schema/{index,<screen>}.ts, brand/messages.ts}
├── tools/{compile,analyze,rules,build}.ts   tests/{architecture,spec,stores,elements,components,screen}   public/
└── package.json  bun.lock  biome.json  bunfig.toml  tsconfig.json  next.config.ts  postcss.config.mjs
```

```
engine/* → native → types → api → specs → stores → hooks → styles → elements → components → features → app
```

The analyzer (`tools/analyze.ts` over `engine/tool`, inside `bun run check`) enforces the order, the engine doors (`engine/<member>` only), Next only in `app`, and `specs/` as the one outside folder `src/` may read. **Nameless law** (`tests/architecture.test.ts`): no file that leaves with the surface names a product or its tree, and only the manifest reaches out of it; the spec's brand is a placeholder, the surface is named `${platform}-${role}`, the preferences box is prefixed `app`, and `next.config.ts` finds the engine through `node_modules/engine`. **Independence law:** this fragment owns its `src/` outright; the engine is the only shared layer; repeating a contract in a sibling fragment is not duplication.

## Specs

A spec is data: `config/` (contents, contracts, features, settings, themes), `schema/` (screens of blocks and features), `brand/` (messages). `src/specs/surface.ts` declares the block vocabulary (`stack`, `feature`), reads the deployment (`API_URL`, `ENGINE_ENV`, also as `EXPO_PUBLIC_*`), resolves the address through `api.address` (a release refuses a cleartext or private one) and hands the surface to `spec.compile` with the `manifests` and the `catalogue`, and the role's message keys as `texts`, so an unknown block prop, a setting outside its schema, an unbound or mistyped port, an unknown path, target, action, text key or topic and a watch cycle fail the build with a path, a rule and the nearest valid name. `src/specs/deployment.ts` reads the deployment and the current role; `src/specs/runtime.ts` revives the compiled role from `.cache/spec/current.json` (written by `tools/compile.ts`, so the compiler never ships to the browser), holds the bus, `live = spec.runtime(compiled)` and the readers every surface shares (`screenAt menu title labels settingsOf publicOf pathsOf siteOf metadataOf`); `app/screen.tsx` mounts the screen matched from the path (the Next page passes a path across the server boundary, never the compiled object) and asks `live.visible(id)` before rendering a feature. `tools/compile.ts` writes `.cache/spec/<role>.json` (`spec.serialize`), `.cache/styles/theme.css` from `styles/tokens.ts` (`world.css`, brand tints from `world.shades` over `themes.brand`) and `fonts.css` with the engine's faces, copying the woff2 files from `tool.assets(engine)` into `public/fonts`.

## Web truth

SEO and page performance derive from the spec's settings and contents, never from an SEO key: `contents.url` present and public makes the site indexable (`robots.txt` allows, the sitemap lists `pathsOf()`, every page carries canonical, hreflang alternates and open graph from `metadataOf`); absent, `robots.txt` disallows all and every page is `noindex, nofollow`. The export is static (`generateStaticParams`), so nothing reads a preference server-side: the HTML speaks the surface locale, the client re-speaks the stored one after hydration. One owner per head tag: the document title is React's hoisted `<title>` from `app/title.tsx` and the Next page sets `title: null`, because Next's streamed metadata hydrates after the effects and would overwrite an imperative `document.title`; the layout keeps the default title for pages Next renders alone (the 404). Device, storage and history reach the page through the engine's ports with their web fallbacks bound at the port (`sideEffects: false` lets Next drop a module that only binds a fallback at import).

## Design

UI is not decoration; it is the product the client judges by the millimeter. The reference is the best operations consoles and consumer products in production that day, studied as evidence and never imitated.

- One system, no raw value: every color, radius, shadow, motion and font is a token in `styles/tokens.ts`, light and dark as two art directions; the CSS custom properties are derived, never written by hand; `styles/theme.ts` (`useTheme` over `engine/world`: `world.theme({ tokens, box, key: "scheme" })`, preference `system | light | dark`, cycle and toggle) follows the preference or the device scheme and writes `lang`, `dir`, `data-theme` and `color-scheme` on the root (`system` removes `data-theme`).
- Enterprise identity, never the AI look: dense, restrained, hierarchical; no random gradients, card soup, glass or purposeless motion. WCAG 2.2 AA contrast, visible focus, correct roles and names; desktop first and truly usable at 390 px; keyboard, touch and reduced motion from the first line.
- Preferences (`locale scheme`) live in `cache.open({ kind: "local", prefix })` through `stores/box.ts` and hydrate after mount; tokens never in web storage.

## Every screen

Loading, empty, partial, error, offline, validation failure, permission denial, success, destructive confirmation, long and short content, missing media and realistic volume, with a skeleton shaped like what it replaces. The server is the authority on permissions; a 403 is a designed state.

## Production

A part is production-ready when every box below is proven, not promised: it boots from the compiled role alone; every important surface carries its loading, empty, error, offline and denied states as designed states; a release refuses a cleartext or private api address; the host policy names only the role's origin (desktop CSP, web headers, mobile scheme); SEO derives from the contents (web); every control has a role and a name; the bundle stays under `settings.budget` (`tools/build.ts` fails over it: web total js, desktop `app.js`, mobile Hermes bytecode); the artifact is walked in its real host (the served export in a browser, the window, the phone) before the lap closes. `src/elements/contract.ts` holds every element's props once; the element files hold only the platform's markup; `elements/title.tsx` owns the document title (a page on the phone has none); `styles/theme.ts` applies scheme, `lang` and `dir` to the host's document root through `world.theme().apply(adapter.host().document?.documentElement, { lang, dir })`, which is a no-op where there is no document; `tools/compile.ts` branches on `src/types/platform.ts` for the fonts and the stylesheet, so the file is the same on the three.

## Gate

`infra gate --part web --product <p>` (or `bun run gate`) = `bun run deps` · `bun run check` (compile the specs, `tsc`, the analyzer) · `bun run lint` · `bun run test` · `bun run build` (`tools/build.ts`: compile, then `next build`) · `bun run audit` · `twins` (the shared files hashed across the three surfaces).

- **Twins** (gate `twins`): the structural files shared by web, mobile and desktop are byte-identical, hashed by `infra gate --type twins` from the list `GATE_TWINS` in `engine/infra/src/module/gate/src/bun.sh` (types, the spec deployment, surface and runtime, the stores, the path, preference and session hooks, the tokens and the theme hook, the element contract, the `confirm` and `denied` components, `app/{nav,screen}.tsx`, the analyzer, rules and compile tools, the architecture, spec, states and store tests: 23 files); `GATE_TWINS_DOM` holds the pair web and desktop share beyond them (the eight DOM elements and the element and component tests: 10 files); the hello feature's own files are identical today and left out on purpose, a feature is a surface's to change; `src/specs/platform.ts` is the one line a surface owns about itself (`web | mobile | desktop`), read by the spec surface (`surface.platform`), the api client and the rules, so no other file names the platform; `"use client"` heads the client files on all three (inert outside Next) so they stay twins.

## How to add

- **An element:** in `src/elements`, semantic props, variants over the tokens, `data-*`/`aria-*` states, a render test per state with exact attributes; the same name and props on the two other surfaces. **A component:** one file over elements, its hook, a test per state. **A feature:** `api/<name>.ts` (transport and manifest), its folder, a line in `features/index.ts`, placed by a spec with a `feature` block. **A block:** a schema in `src/specs/surface.ts` and a branch in `app/screen.tsx`. **A role:** `specs/<role>/` with its settings, contracts, screens and brand, green under `bun run build`. **An engine verb:** in the engine, then one line here.

## Proof

Tests compile the real spec (clean, with its topics and manifests, the menu, the labels, the metadata and the public stance), mount the hello screen on the runtime and watch a trigger land, render real elements and components in every state with exact attributes, render the compiled screen with its hoisted title and the nav with the current screen marked, persist and reload the preferences through the box and run the analyzer over the real tree. `bun run build` exports every page. Visual truth: Playwright over the served export, one page at a time, both themes, both directions, at 1440, 1024, 768 and 390, every control exercised, the title, `lang` and `dir` read after a reload, the navigation entries counted (a spec link is one SPA navigation); fix the token or the primitive, never the pixel. The training fuel that proves a shared mechanism (screens, elements, features beyond hello) is deleted once the proof is recorded; the repository keeps one element, one component, one feature and one screen saying hello.
