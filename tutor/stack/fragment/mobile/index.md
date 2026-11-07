# mobile

`product/<project>/mobile` is one spec-driven Expo and React Native surface engine on Bun over `engine/bun` (`library/expo`), the web's twin: the same path, layers, analyzer, spec DSL and contract shape (`api/<name>.ts`), with the platform as the only difference: native views instead of the DOM, a router-free navigator instead of Next, Metro and Hermes instead of a Next build. Every role of the product that needs native reach is a spec. Gate: `bun run check`, `bun run typecheck`, `bun test`, `bun run build --all`.

## Identity

- The surface for roles that need the phone: push, camera, location, background audio, offline queues, secure on-device sessions, biometrics. Each role is a complete experience from `specs/<role>`, not a separate app.
- Phone criteria rule: bundle and APK size, cold start, memory, frame drops, battery; native dependencies stay minimal and each is weighed before it joins.

## Layout and layers

```
product/<project>/mobile/
├── src/{native, api, specs, stores, types, hooks, elements, icons, styles, components, features/<name>, app}
├── specs/<role>/{config, schema, brand}   tools/{core,compile,build}.ts   tests/  benches/  messages/  public/
└── package.json  app.config.ts  metro.config.cjs  biome.json  bunfig.toml  tsconfig.json  tsconfig.tools.json
```

```
engine/* → native · api · types · specs → specs → stores → hooks · features/*/hooks → elements · icons · styles → components · features/*/components → features → app
```

- The web's element, component, feature, contract and independence laws apply (`stack/fragment/web`); React Native markup lives in the element; `react-native` is allowed only where markup lives (`elements icons hooks styles native`).
- `native/` is the vendor home and the only third-party import; navigation is router-free over `engine/history` (`library/expo`).

## Specs

The web's DSL validated by the mobile surface: every feature is client-owned, a tab screen has no path parameters, there is no SEO, delivery or session cookie; `settings.app` names the app (slug, scheme, package); the identity reaches the app through the compiled spec.

## Design bar

Real enterprise product design: hierarchy, density, typography, spacing, surfaces, depth, restraint; separate light and dark art directions; RTL and LTR from the first line; motion that explains state (React owns resting values, a worklet only what follows a finger, reduced motion respected); skeletons shaped like what they replace; one rhythm where gaps come from the parent. Every icon and element truly centered in its holder; spacing between cards unified and measured; no broken icon, holder or field by one pixel; a directional icon mirrors in RTL. 3D art and font icons as the web; a register and a login that are stepped flows, email or phone chosen first and each field with its own shape.

## How to add

- **An element, component, feature, screen:** as the web, with React Native markup in the element and a render test per state; the contract file is the fragment's own.
- **A native capability:** a port in the engine member when generic, the `.native.ts` adapter in `native/`, permissions in `app.config.ts`; never a native call in a hook or feature.
- **A role:** `specs/<role>/` with `settings.app`, an icon in `brand/images`, its messages, `build --all` green.

## Proof

Tests render real elements and components through the real store and palette under Metro's view of the app (react-native-web, the compiled spec); the phone is the final truth for RTL, native fonts, dimensions, safe areas, keyboard and motion; the harness lies about them. Every screen × language × theme is walked on the phone, one full-size page at a time. Phone measurements (cold start, memory, jank) come from a release build and are round artifacts outside the repository.
