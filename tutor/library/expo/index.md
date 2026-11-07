# Expo

Status: no `product/*/mobile` exists yet; this file governs the first one.

The framework of `product/<project>/mobile`: Expo with its bundled React Native, Metro and Hermes, on Bun over `engine/bun`, building every mobile role of a product from `specs/<role>`. The engine never imports Expo or React Native; the surface's `native/`, `elements/`, `icons/`, `hooks/` and `styles/` are the only files that know them.

## Use

- Expo's bundled ranges are the truth for React, React Native and every native module; a package outside the range is refused. The SDK is the newest stable on the day of the task.
- `app.config.ts` reads the compiled spec (`settings.app`: slug, scheme, package, icon) and refuses to run before the compile; the identity reaches the app through the compiled spec, never through env.
- Daily loop: Metro on the box, the phone first over USB, the web harness as the fallback. Builds: cloud through the owner's project and secrets home, on his order; a local build only when the cloud refuses, under the machine law and a lock.
- `tools/build.ts` exports Hermes bytecode per role; a store build is a release step, never a part of CI.

## Laws

- **One copy of every host package:** the engine's React, React Native and Expo resolve from the surface; Metro watches the engine's real path; an undeclared host package fails the bundle.
- **No tree shaking:** a module that imports a generated registry stays its own module; side-effect imports are explicit.
- **Vendor home:** `native/` is the only third-party import: `<name>.ts` the web adapter, `<name>.native.ts` the phone's (device, lifecycle, random, secure storage, direction, safe area, screens); `react-native` is allowed only where markup lives.
- **Navigation is router-free:** `engine/history` is the brain, `react-native-screens` renders the stack, `hooks/use-router.ts` is the features' door; tabs stay laid out off screen.
- **Storage:** session in secure storage; caches in async storage; nothing private cached across users; a queued write replays only under its owner; offline never invents stock, payment or completion.
- **Permissions** declared in `app.config.ts` from the spec; a native capability is a port in the engine member when generic, an adapter in `native/`, never a call in a hook or feature.
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
