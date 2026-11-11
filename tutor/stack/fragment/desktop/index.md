# desktop

`product/<project>/desktop` is one spec-driven desktop surface engine on Bun over the Bun engine, the web's twin for the office to the file name: the same tree, layers, analyzer, spec DSL, contracts, stores, hooks, styles, elements (DOM markup, word for word the web's) and tests, with the host as the only difference: the page runs inside a native window, a router-free navigator replaces Next, Bun's bundler and PostCSS build the page, and one native runtime under `native/` carries everything the page asks of the operating system.

## Identity

- The surface for roles that live at a desktop all day: dense panels, many windows of work, files on disk, the clipboard, notifications, long sessions. Each role is a complete experience from `specs/<role>`.
- One native runtime, one contract: the page reaches the operating system only through `src/native/bridge.ts` (today `ready opened info title open mark`); the runtime is replaceable as one folder; nothing in the desktop root changes.

## Layout and layers

```
product/<project>/desktop/
├── src/{native, types, api, specs, stores, hooks, styles, elements, components, features/<name>, app}   (src/native/bridge.ts is the page's one door to the runtime; src/native/index.ts binds the ports at boot; src/app/{index.tsx, index.html, globals.css, nav.tsx, screen.tsx} is the page)
├── specs/index.ts (roles, current)  specs/<role>/{index.ts, config/{index,contents,contracts,features,settings,themes}.ts, schema/{index,<screen>}.ts, brand/messages.ts}
├── tools/{compile,analyze,rules,build}.ts   tests/{architecture,spec,stores,elements,components,screen,host}
├── package.json  bun.lock  biome.json  bunfig.toml  tsconfig.json
└── native/   the runtime, its own workspace: src/{contract, view, plugin, host, index}.ts  tools/{electrobun,app}.ts  tests/  types/electrobun.d.ts  hutch.config.ts  electrobun.config.ts  its own manifests
```

```
engine/* → native → types → api → specs → stores → hooks → styles → components → features → app
```

- `nav.tsx`, `screen.tsx`, `elements/title.tsx` and `hooks/use-path.ts` are the web's files: the document title is React's hoisted `<title>` (`index.html` carries none; the window's title is the host's from `host.json`), the navigator is created lazily after `boot()` bound the memory history adapter.
- The web's analyzer, Biome wall, token law and independence law apply; `@native/*` (→ `native/src/*`) is read only by `src/native/`; markup and classes live only in `src/elements`.
- The contract between the page and the runtime is four names and two folders: `@native/contract`, `@native/view`, `@native/plugin`, the scripts `prepare dev app gate` of `native/`, and the `dist` layout below.

## Specs

The web's DSL validated by the desktop surface: every feature client-owned; `settings.app` names the app (name, reverse-domain identifier, semver version); `settings.window` sizes it (width, height and their minimums). The compiled spec reaches the page inside its bundle, and the runtime through `host.json`: `native/electrobun.config.ts` reads the app's name, identifier, version and window from it and names a neutral page when nothing is built. A release build sets `ENGINE_ENV=production` and `API_URL`; `tools/build.ts` defines both in the page bundle and names only that origin in the policy, and `compileRole` refuses a cleartext or private address. Preferences live in the window's local storage through the same `cache.open({ kind: "local", prefix })` box; `boot()` binds `device.port` to the web adapter with `open` routed through the host.

## Build

- `tools/compile.ts` writes the compiled role, the theme and the font faces into `.cache/`; `tools/build.ts [--all]` bundles the page with Bun (minified, `engine` resolved through the link, no CSS import in the entry: Bun's CSS bundler refuses `@theme`), builds `theme.css` through PostCSS and `@tailwindcss/postcss` from `src/app/globals.css`, copies the fonts, writes `index.html` from `src/app/index.html` (lang, dir, a strict Content-Security-Policy naming only the role's API origin, `script-src 'self'`, under which `validate.compile` keeps its source), and `client.json` and `host.json` (identity, window), into `dist/<role>/`, refreshing `dist/current`.
- `bun run app [--env=dev|canary|stable]` builds the page then the runtime through Electrobun over the SDK Hutch projects into `native/.hutch`: a runnable dev build or the installer and the update archive per role.

## Production

A part is production-ready when every box below is proven, not promised: it boots from the compiled role alone; every important surface carries its loading, empty, error, offline and denied states as designed states; a release refuses a cleartext or private api address; the host policy names only the role's origin (desktop CSP, web headers, mobile scheme); SEO derives from the contents (web); every control has a role and a name; the bundle stays under `settings.budget` (`tools/build.ts` fails over it: web total js, desktop `app.js`, mobile Hermes bytecode); the artifact is walked in its real host (the served export in a browser, the window, the phone) before the lap closes. `src/elements/contract.ts` holds every element's props once; the element files hold only the platform's markup; `elements/title.tsx` owns the document title (a page on the phone has none); `styles/theme.ts` applies scheme, `lang` and `dir` to the host's document root through `world.theme().apply(adapter.host().document?.documentElement, { lang, dir })`, which is a no-op where there is no document; `tools/compile.ts` branches on `src/types/platform.ts` for the fonts and the stylesheet, so the file is the same on the three.

## Gate

`infra gate --part desktop --product <p>` (or `bun run gate`) = `bun run deps` · `bun run check` (compile the specs, `tsc`, the analyzer, the runtime's `tsc`) · `bun run build` · `bun run lint` · `bun run test` · `bun run audit`, every one reaching `native/` too; `bun run app` builds the window on demand · `twins` (the shared files hashed across the three surfaces).

- **Twins** (gate `twins`): the structural files shared by web, mobile and desktop are byte-identical, hashed by `infra gate --type twins` from the list `GATE_TWINS` in `engine/infra/src/module/gate/src/bun.sh` (types, the spec deployment, surface and runtime, the stores, the path, preference and session hooks, the tokens and the theme hook, the element contract, the `confirm` and `denied` components, `app/{nav,screen}.tsx`, the analyzer, rules and compile tools, the architecture, spec, states and store tests: 23 files); `GATE_TWINS_DOM` holds the pair web and desktop share beyond them (the eight DOM elements and the element and component tests: 10 files); the hello feature's own files are identical today and left out on purpose, a feature is a surface's to change; `src/specs/platform.ts` is the one line a surface owns about itself (`web | mobile | desktop`), read by the spec surface (`surface.platform`), the api client and the rules, so no other file names the platform; `"use client"` heads the client files on all three (inert outside Next) so they stay twins.

## How to add

- **An element, component, feature, screen:** as the web; the contract file is the fragment's own.
- **A native capability:** a request or signal in `native/src/contract.ts`, its handler in `native/src/host.ts` with its test, its verb in `src/native/bridge.ts` with its test; never a native call in a hook or feature.
- **A role:** `specs/<role>/` with `settings.app` and `settings.window`, an icon, its messages, `build --all` green.

## Proof

`tests/host.test.ts` drives the bridge over a fake runtime and asserts every verb's exact request, the honest refusal without a host and the page document's policy (and that it carries no title of its own); component and screen tests render the real engine elements with exact classes and roles; `native/tests` prove the handler map covers every request of the contract over a mocked SDK (`electrobun/main`, `electrobun/view` as virtual modules), that every handler validates what the page sends, and that no bridge opens outside a desktop window. The window is launched for real by `bun run app`.
