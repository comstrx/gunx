# ✨ Mobile Surface

[![Expo](https://img.shields.io/badge/Expo-React_Native-000020?logo=expo&logoColor=white)](https://expo.dev)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Spec. Every Role. A Native App in Your Hand.**

A spec-driven surface engineered to turn **a declared role into a native mobile application** on Expo and React Native, with its own name, its own brand, and its own screens.

**Stop forking the app for every audience. Start declaring the audience.**

---

## 🎯 Overview

**Describe the role. The app builds itself.**

A product rarely ships one mobile app. It ships one for clients, one for staff, one for couriers, and each is traditionally a project of its own that repeats the same navigation, the same session handling, and the same native plumbing.

Mobile Surface inverts that. The application code is written once and knows nothing of any particular role. A role is a folder of declarations, its configuration, its brand, and its screens, and the build compiles each one into its own application with its own name, identifier, and theme.

**Roles are data. The surface is the engine that reads them.**

---

## 📦 Download

**One repository. One tag per release. One command to see it.**

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
bun run deps
bun run start
```

Bun 1.4.4 or newer, with the Android toolchain for a device build. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**Everything a role needs, declared in one folder.**

```text
specs/<role>/
├── config/     contracts · settings · contents · themes · features
├── brand/      messages in every locale
└── schema/     the screens, one file each
```

**Spec-Driven Roles** · **Native Navigation** · **Themes per Role** · **Right-to-Left and Left-to-Right** · **Typed API Contracts** · **Sessions and a Vault** · **Offline-Aware States** · **A Byte Budget**

**Native capabilities, behind one bridge** · Camera · Pickers · Location · Notifications · Haptics · Audio and Video · Clipboard · Secure Storage · Screen-Capture Guard

| Command           | What it produces                                    |
| ----------------- | --------------------------------------------------- |
| `bun run start`   | The development server, for a device or an emulator |
| `bun run build`   | The Hermes bundle of the application, inside budget |
| `bun run release` | The Android release build                           |

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
                 specs — one folder per role
                            │
              app — the shell, the nav, the screens
                            │
          features → components → elements → hooks
                            │
              stores · styles · specs · api
                            │
        render — bridge and host, the native boundary
                            │
                         engine
```

**Single Responsibility** · **Unidirectional Layers** · **Explicit Contracts** · **One Fenced Bridge** · **Modular Composition**

Eleven layers, and an import may only travel down. The order is not advice: the build analyzes every file and refuses an import that climbs.

React Native itself is fenced. Only the hooks, the styles, and the elements may import it, so a feature is written against elements, never against the framework, and reads the same on every surface.

Native modules meet the application at one bridge. Only the `app` layer may reach it, and the host beneath it imports nothing from the application at all.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not a template. A compiler for apps.**

A spec is checked before anything is rendered, and every text a screen shows is a message key resolved for the active locale. The engine's ports are bound to their native implementations once, at boot: storage, secure storage, randomness, the device, and the camera.

Elements are small and closed, components compose them, and features compose components. Each level is tested on its own, down to the loading, empty, error, denied, and stale states.

State, forms, networking, and localization are not written here. They come from the engine, so this tree holds only what is specific to a native surface.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**A budget is a number the build is allowed to fail on.**

Every build ends by measuring the Hermes bytecode it produced against a byte budget, and a build that exceeds it fails. Size is not reviewed after the fact; it is gated before the merge.

```bash
bun run build
```

Hermes bytecode starts without parsing JavaScript on the device, and the engine underneath is built to do less work: bounded lanes, windowed selection, and virtual layouts that render what is visible.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**The device is not a safe. The app must not pretend it is.**

- **Token custody** is a declared choice of each role, and secrets go to the platform's secure storage, not to plain preferences.
- **The vault** keeps sensitive values behind one feature with one way in.
- **Screen capture** can be refused on the screens that show what must not leave.
- **The bridge** is the only path to native capabilities, and only one layer may call it.
- **Configuration** that differs per deployment arrives from the environment at build time; no secret is written into a spec.
- **Dependencies** are pinned and audited on every gate.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

Run what CI runs:

```bash
bun run gate
```

| Gate  | What it proves                                                  |
| ----- | --------------------------------------------------------------- |
| check | the specs compile, `tsc` passes, and no import climbs a layer   |
| lint  | Biome in CI mode                                                |
| test  | elements, components, screens, stores, sessions, and the bridge |
| build | the Hermes bundle, inside budget                                |
| audit | `bun audit` over the frozen dependency graph                    |

Native claims require native execution: the tests prove the logic, and only a device proves the app.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
