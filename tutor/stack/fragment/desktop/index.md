# desktop

`product/<project>/desktop` is one spec-driven desktop surface engine on Bun over `engine/bun` (`library/electro`), the web's twin for the office: the same path, layers, analyzer, spec DSL, contract shape and the engine's `dom` elements, with the host as the only difference: the page runs inside a native window, a router-free navigator replaces Next, Bun's bundler and PostCSS build the page, and one native runtime under `native/` carries everything the page asks of the operating system. Gate: `bun run check`, `bun run typecheck`, `bun test`, `bun run build --all`, then `bun run native gate` and `bun run app`.

## Identity

- The surface for roles that live at a desktop all day: dense panels, many windows of work, files on disk, the clipboard, notifications, long sessions. Each role is a complete experience from `specs/<role>`.
- One native runtime, one contract: the page reaches the operating system only through `native/bridge.ts`; the runtime is replaceable as one folder; nothing in the desktop root changes (`library/electro`).

## Layout and layers

```
product/<project>/desktop/
├── src/{native, api, specs, stores, types, hooks, styles, components, features/<name>, app}   (the elements are the engine's dom)
├── specs/<role>/{config, schema, brand}   tools/{core,compile,build,page,theme,serve,alias,plugin,app}.ts + page.html   tests/  benches/  messages/  public/
├── package.json  bun.lock  biome.json  bunfig.toml  tsconfig.json  tsconfig.tools.json  .env.example
└── native/   the runtime, its own workspace: src/{contract, view, plugin, host, index}  tools/  tests/  benches/  types/  its own manifests
```

```
engine/* → native · api · types · specs → specs → stores → hooks · features/*/hooks → styles → components · features/*/components → features → app
```

- The web's analyzer, Biome wall, token law and independence law apply; `@native/*` is the only native import and lives in `native/`; markup and classes live only in `engine/dom`.

## Specs

The web's DSL validated by the desktop surface: every feature client-owned; `settings.app` names the app (slug, reverse-domain identifier, semver version); `settings.window` sizes it. The selected spec reaches the page through the bundle's `define`.

## Build

- `compile` emits the compiled spec, `client.json`, `host.json` (identity, name, identifier, version, window) and `theme.css`; `build [--all]` bundles the page with Bun, builds the stylesheet through PostCSS, writes `index.html` with the saved theme painted before React, into `dist/<role>/`, refreshing `dist/current`.
- `app [--all] [--env=dev|canary|stable]` builds the page then the runtime: a runnable dev build or the installer and the update archive per role; the release attests them.

## How to add

- **An element, component, feature, screen:** as the web; the contract file is the fragment's own.
- **A native capability:** a request or signal in `native/src/contract.ts`, its handler in `native/src/host.ts` with its test, its verb in `native/bridge.ts` with its test; never a native call in a hook or feature.
- **A role:** `specs/<role>/` with `settings.app` and `settings.window`, an icon, its messages, `build --all` green.

## Proof

`tests/host.test.ts` drives the DSL over a fake bridge and asserts every verb's exact request, the honest refusal without a host and the page document; element tests render the real DOM elements with exact classes and roles; `native/tests` prove the handler map covers every request over a mocked SDK and that no bridge opens outside a desktop window. Numbers for Windows and macOS come from real machines, never claimed.
