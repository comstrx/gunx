# Expo

Status: Expo SDK 58 (58.0.23) with React Native 0.88.1 in the mobile fragment, exported for Android through Metro and Hermes.

The framework of the mobile fragment: Expo with its bundled React Native, Metro and Hermes, on Bun over the engine, building every mobile role of a product from its spec. The engine never imports Expo or React Native; only the fragment's vendor home, elements, icons, hooks and styles know them.

## Use

- Expo's bundled ranges are the truth for React, React Native and every native module; a package outside the range is refused.
- `app.config.ts` reads the compiled spec (`settings.app`: name, slug, scheme, package) and refuses to run before the compile; the identity reaches the app through the compiled spec, never through env.
- Daily loop: Metro on the box, the phone first over USB, the web harness as the fallback. Builds: cloud through the owner's project and secrets home, on his order; a local build only when the cloud refuses, under the machine law and a lock.
- `build` compiles the spec, then `expo export --platform android` writes the Hermes bundle per role; a store build is a release step, never a part of CI.

## Laws

- **One copy of every host package:** the engine's React, React Native and Expo resolve from the surface; Metro watches the engine's real path; an undeclared host package fails the bundle.
- **No tree shaking:** a module that imports a generated registry stays its own module; side-effect imports are explicit.
- **Vendor home:** one folder is the only third-party import: `<name>.ts` the web adapter, `<name>.native.ts` the phone's (device, lifecycle, random, secure storage, direction, safe area, screens); `react-native` is allowed only where markup lives.
- **Navigation is router-free:** the engine's history is the brain, `react-native-screens` renders the stack, one hook is the features' door; tabs stay laid out off screen.
- **Storage:** session in secure storage; caches in async storage; nothing private cached across users; a queued write replays only under its owner; offline never invents stock, payment or completion.
- **Permissions** declared in `app.config.ts` from the spec; a native capability is a port in the engine member when generic, an adapter in the vendor home, never a call in a hook or feature.
- **Phone criteria** rule every dependency: bundle and APK size, cold start, memory, frame drops, battery; each native module is weighed before it joins.

## Traps

- `boxShadow` on native is a value object, never the web's string; a shared element passes shadow tokens through the adapter.
- A `Modal` that unmounts while focused keeps the keyboard; dismiss before unmount.
- Animated values must settle before unmount or they leak; React owns resting values, a worklet owns only what follows a finger.
- Theme color transitions need keys on the animated node or the old color sticks.
- `FlashList` defaults (`estimatedItemSize`, `drawDistance`) decide jank; set them from the element, not per feature.
- RTL offsets: `I18nManager` flips layout but not absolute offsets, transforms or directional icons; directional icons carry a mirror flag.
- Hermes lacks some Intl pieces; dates, numbers and plurals come from the engine, never from `Intl` directly.
- The harness lies about RTL, native fonts, dimensions, safe areas, keyboard and motion timing; the phone is the final truth.
- Expo 58's `@expo/cli` and `@expo/fingerprint` ask for `glob ^13` and `minimatch ^10`, both under advisories since November 2026 (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249); the surface overrides them to `glob 14.0.3` and `minimatch 11.0.4`, which keep every call Expo makes (a fingerprint and an export proven), and drops the overrides the day Expo's own ranges move.
- A native module takes the version in `expo/bundledNativeModules.json`, never npm's newest: AsyncStorage is 2.2.0 for SDK 58 while 3.x exists.
- Only `EXPO_PUBLIC_*` reaches the bundle: Metro inlines those names alone, so the surface's scripts map `API_URL` and `ENGINE_ENV` onto them.
- React must equal the renderer React Native embeds (19.3.0 for 0.88): Expo bundles exactly that version, so the engine's catalog pins it and the surface links React from the engine; a newer React is a crash at the first render.
