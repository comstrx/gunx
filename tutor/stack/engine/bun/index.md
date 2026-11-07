# engine/bun

The TypeScript stdlib every surface stands on: one workspace of member packages under `src/<member>/`, fronted by one facade package, `engine`, that exports one subpath per member. Runtime-agnostic (browser, Bun, Node, Hermes), product-free, shared word for word by every `web`, `mobile` and `desktop` of every product. It never imports Next, Expo or Electrobun. Written in `language/typescript`. Gate: `bun install --frozen-lockfile && bun link`, `bun run check`, `bun run lint`, `bun run test`, `bun run fuzz`, `bun run audit`.

## Layout

```
engine/bun/
├── src/<member>/   package engine-<member>, private, no version: package.json (its members and libraries by name: workspace:* and catalog:, exports "." → src/index.ts) and src/ (index.ts, the public surface, + flat files)
├── src/engine/     the facade: package.json (depends on every member with workspace:*, exports . → src/index.ts and ./<member> → src/<member>.ts), src/index.ts (every member as a namespace, `export * as <member>`) and src/<member>.ts (one line re-exporting the member)
├── assets/         the world's data and drawings (constants, flags, emojis, fonts), LICENSE.txt
├── tests/          flat <member>.test.ts (+ <member>.<topic>.test.ts when one grows) + api.test.ts over api.json (the recorded exports of every member), audit, architecture
├── benches/        flat <member>.bench.ts, one per member, ending in test.run(): numbers, never a verdict
├── fuzz/           flat <member>.test.ts on fast-check: properties over the member's parsers and verbs, tens of thousands of runs, run by `bun run fuzz`
├── .bun/           the link registry the surfaces resolve link:engine through
└── package.json  bun.lock  node_modules/  bunfig.toml  biome.json  tsconfig.json
```

One workspace, one artifact: `workspaces` and the `catalog` (every library's one version) live in the root `package.json`; a member's manifest carries no number; `node_modules/` and `bun.lock` exist once, at the root (`linker = "hoisted"`; the isolated linker would plant a `node_modules/` inside every member); a member that imports what it did not declare is refused by Biome, not by the linker.

## Facade and link

- The facade's `exports` maps `./<member>` → the member's index, and `.` → `src/index.ts`, the whole engine as namespaces; nothing else. Every import is `import * as <member> from "engine/<member>"` and every call reads `<member>.verb()`; a relative import never crosses into another member; a member's index exports only what something outside uses; a local never shadows a member name.
- Every external dependency is pinned once in the root `catalog`; a member asks for it with `catalog:` and for a sibling with `workspace:*`; the resolver refuses an import a member did not declare; React is a peer; a surface never re-declares them.
- Surfaces depend with `"engine": "link:engine"` on the facade and share the one global directory (`engine/bun/.bun`); Next compiles the facade and its members through `transpilePackages` (generated from the manifest), Metro watches the engine's real path, follows its symlinks and resolves host packages from the surface. The day the engine leaves, the surfaces swap `link:engine` for a release reference and nothing else changes.

## Laws

- **Runtime law** (Biome): a member runs on the browser, Bun, Node and Hermes alike; `Bun process Buffer require node:* bun:*` are refused in `src/` except `tool` and `test` (build and test time) and `fs` (reaches the disk at call time); DOM-only mechanics live in `dom`, the one member a native surface never imports.
- **Ownership law:** a member reaches a lower domain through that member's verbs, never inline (`json.parse` not `JSON.parse`, `list.compact` not `.filter(Boolean)`); a verb lives in exactly one member.
- **Generality law:** `api` knows contracts, `spec` knows screens, `tool` knows build conventions, and they never import each other; every other member is general to any project and knows nothing of the spec architecture; defaults ascend `engine → surface → spec`; the engine names no product, brand, framework or deployment, not even in a default or a fake.
- **Library door law:** a third-party library enters through one member and one file; no other file imports it.
- **Render law:** no hook reads a browser global at render; hooks are `use<Name>`; a store binding exposes `useSelect`, never `use`.
- **Credential and outbox laws:** a spec never holds a credential-shaped value; a queued write lives in its owner's outbox and is never replayed under another user; the compiler refuses a cleartext production address unless declared insecure.
- **No policing law:** nothing in `src/{test, tool}` judges size, lines, syntax, markup, style, format or a performance number; tests test code, benches print, the analyzer checks import boundaries, the one audit is the license test.
- **Dependencies:** Bun owns them: `bun audit --audit-level=low`, exact pins, a minimum release age of three days (the pinned dev tools `@biomejs/*`, `@types/bun`, `mitata`, `typescript` excluded by name so the newest release installs), and a license allow-list test with named grants.

## Members

| Group     | Members                                                                                   |
| --------- | ----------------------------------------------------------------------------------------- |
| values    | `json parse string number list date rand money translate`                                 |
| mechanics | `func validate crypto cookie history device storage style`                                |
| contracts | `api` (client, envelope, fault, contracts), `socket`, `queue` (the outbox)                |
| surfaces  | `spec` (compiler, screens, runtime), `dom` (the shared elements and DOM mechanics), `seo` |
| state     | `store` (zustand bindings), `net` (facts, guard, beacons)                                 |
| world     | `world` (countries, currencies, flags, emojis), `font` (subsetting), `icon`               |
| tooling   | `tool` (build conventions), `test` (the stage and bench)                                  |

The list is the target shape; the members that exist are the ones the facade exports. Today: `hello`, the proof verb.

## How to add

- **A verb:** in its member, through the member's index, tested in `tests/<member>.test.ts`, benched when hot, consumed by the surfaces in one line.
- **A member:** `src/<name>/{package.json, src/index.ts}`, a `workspace:*` line and an export in the facade, a test file, a bench file, a place in the ladder; ask first which member owns the domain.
- **A platform difference:** a port in the member and an adapter per runtime (web beside it, native in the surface's `native/`), never a runtime check inside shared logic.

## Direction

The engine carries the surfaces completely: stores, hooks, types and tooling depend on it alone, so features stay business pipelines of a few lines. The strongest libraries of the Bun and React world, newest stable, each wrapped once for measured value: ui behavior, state, icons, motion, virtual scrolling. The spec language stays one system at every depth (`screen → block → feature`). Size and start-up are measured from builds and benches, never policed in code.
