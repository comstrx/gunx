# mobile

`product/<project>/mobile` is one spec-driven Expo and React Native surface engine on Bun over the Bun engine, the web's twin to the file name: the same tree, layers, analyzer, spec DSL, contracts, stores, hooks, styles and tests, with the platform as the only difference: React Native markup inside `elements/`, `src/native/` binding the engine's ports to the phone, `app/index.tsx` framing the screen instead of Next, Metro and Hermes instead of a Next build. Every role of the product that needs native reach is a spec.

## Identity

- The surface for roles that need the phone: push, camera, location, background audio, offline queues, secure on-device sessions, biometrics. Each role is a complete experience from `specs/<role>`, not a separate app.
- Phone criteria rule: bundle and APK size, cold start, memory, frame drops, battery; native dependencies stay minimal and each is weighed before it joins.

## Layout and layers

```
product/<project>/mobile/
├── src/{native, types, api, specs, stores, hooks, styles, elements, components, features/<name>, app}
├── specs/index.ts (roles, current)  specs/<role>/{index.ts, config/{index,contents,contracts,features,settings,themes}.ts, schema/{index,<screen>}.ts, brand/messages.ts}
├── tools/{compile,analyze,rules,build}.ts   tests/{setup, architecture,spec,stores,elements,components,screen}   public/
└── package.json  bun.lock  index.ts  app.config.ts  metro.config.cjs  babel.config.cjs  biome.json  bunfig.toml  tsconfig.json
```

```
engine/* → native → types → api → specs → stores → hooks → styles → elements → components → features → app
```

- The web's component, feature, contract and independence laws apply; React Native markup lives in the element; `react-native` is allowed only in `hooks styles elements` and the vendor home `native`.
- **Elements mirror the web's:** `Block Heading Text Button Link Dialog Skeleton Title` take the same semantic props as the web's elements (`direction gap align justify padding surface width height`, `level look`, `tone size weight`, `look size width pending`, `href look current onNavigate`) over the same `styles/tokens.ts` (palettes derived from the spec's brand through `world.shades`, the space scale, radius, the reading width) and `styles/theme.ts` (`useTheme` over the preference and the device scheme), so a spec lays out the same on every surface.
- `native/` is the vendor home and the only third-party import beside React Native: `index.ts` (`boot()`: `cache.use("local", storage)`, `device.port.use(adapter)`, `world.appearance.use(…)` over the adapter's scheme, `history.port.use(…)`), `storage.ts` over AsyncStorage, `device.ts` (facts and watchers over Appearance, Dimensions and AccessibilityInfo), `screen.tsx` (`Frame`: safe areas and the status bar); navigation is router-free over `engine/history` (`hooks/use-path.ts` creates the navigator lazily after `boot()` bound the memory adapter; `app/nav.tsx` is the web's). `app/{index.tsx, nav.tsx, screen.tsx}` is the render layer: `index.tsx` boots then frames the nav and the screen; `screen.tsx` and `nav.tsx` are the web's files without the client directive; `elements/title.tsx` renders nothing, a phone has no document title.

## Specs

The web's DSL, compiler, runtime and files, validated by the mobile surface, with the same address law: `tools/build.ts` and `start` export `API_URL` and `ENGINE_ENV` as `EXPO_PUBLIC_*` so Metro inlines them, and `compileRole` refuses a cleartext or private release address. Preferences live in the same `cache.open({ kind: "local", prefix })` box, which `boot()` binds to AsyncStorage before the first read. Metro inlines every `import()`, so `metro.config.cjs` reads `.cache/spec/current.json` and resolves the world catalogs the role did not name in `settings.world` to an empty module: a bundle carries only the facts its spec asked for. Every feature is client-owned, a tab screen has no path parameters, there is no SEO, delivery or session cookie; `settings.app` names the app (slug, scheme, package); the identity reaches the app through the compiled spec.

## Design bar

The web's design bar, on the phone: every icon and element truly centered in its holder; spacing between cards unified and measured; no broken icon, holder or field by one pixel; a directional icon mirrors in RTL; React owns resting values, a worklet only what follows a finger; a register and a login that are stepped flows, email or phone chosen first and each field with its own shape.

## Production

A part is production-ready when every box below is proven, not promised: it boots from the compiled role alone; every important surface carries its loading, empty, error, offline and denied states as designed states; a release refuses a cleartext or private api address; the host policy names only the role's origin (desktop CSP, web headers, mobile scheme); SEO derives from the contents (web); every control has a role and a name; the bundle stays under `settings.budget` (`tools/build.ts` fails over it: web total js, desktop `app.js`, mobile Hermes bytecode); the artifact is walked in its real host (the served export in a browser, the window, the phone) before the lap closes. `src/elements/contract.ts` holds every element's props once; the element files hold only the platform's markup; `elements/title.tsx` owns the document title (a page on the phone has none); `styles/theme.ts` applies scheme, `lang` and `dir` to the host's document root through `world.theme().apply(adapter.host().document?.documentElement, { lang, dir })`, which is a no-op where there is no document; `tools/compile.ts` branches on `src/types/platform.ts` for the fonts and the stylesheet, so the file is the same on the three.

## Gate

`infra gate --part mobile --product <p>` (or `bun run gate`) = `bun run deps` · `bun run check` (compile the specs, `tsc`, the analyzer) · `bun run lint` · `bun run test` · `bun run build` (`tools/build.ts`: compile, then `expo export --platform android`) · `bun run audit` · `twins` (the shared files hashed across the three surfaces).

- **Twins** (gate `twins`): the structural files shared by web, mobile and desktop are byte-identical, hashed by `infra gate --type twins` from the list `GATE_TWINS` in `engine/infra/src/module/gate/src/bun.sh` (types, the spec deployment, surface and runtime, the stores, the path, preference and session hooks, the tokens and the theme hook, the element contract, the `confirm` and `denied` components, `app/{nav,screen}.tsx`, the analyzer, rules and compile tools, the architecture, spec, states and store tests: 23 files); `GATE_TWINS_DOM` holds the pair web and desktop share beyond them (the eight DOM elements and the element and component tests: 10 files); the hello feature's own files are identical today and left out on purpose, a feature is a surface's to change; `src/specs/platform.ts` is the one line a surface owns about itself (`web | mobile | desktop`), read by the spec surface (`surface.platform`), the api client and the rules, so no other file names the platform; `"use client"` heads the client files on all three (inert outside Next) so they stay twins.

## How to add

- **An element, component, feature, screen:** as the web, with React Native markup in the element and a render test per state; the contract file is the fragment's own.
- **A native capability:** a port in the engine member when generic, the `.native.ts` adapter in `native/`, permissions in `app.config.ts`; never a native call in a hook or feature.
- **A role:** `specs/<role>/` with `settings.app`, an icon in `brand/images`, its messages, `build --all` green.

## Proof

Tests compile the real spec (menu, labels, metadata, public stance) and mount it on the runtime, render real elements and components through the real store and palette under `react-native-web` (`tests/setup.ts` maps `react-native` to it with `I18nManager` and `Platform` stubs, and stubs the status bar, safe areas and AsyncStorage), render the framed screen from the compiled spec, reload the preferences through the box and run the analyzer; the suite is green under random order because a box resolves its storage lazily and `boot()` may run first; `bun run build` exports the Android bundle through Metro and Hermes. The phone is the final truth for RTL, native fonts, dimensions, safe areas, keyboard and motion; the harness lies about them. Every screen × language × theme is walked on the phone, one full-size page at a time. Phone measurements (cold start, memory, jank) come from a release build and are round artifacts outside the repository.
