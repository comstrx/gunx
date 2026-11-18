# ✨ Web Surface

[![Next.js](https://img.shields.io/badge/Next.js-Web_·_Desktop-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Spec. Every Role. A Website or a Window.**

A spec-driven surface engineered to turn **a declared role into a finished application**: a website on Next or a desktop window in Electrobun, built from the same tree by changing one flag.

**Stop building the dashboard again for every role. Start declaring it.**

---

## 🎯 Overview

**Describe the role. The surface builds itself.**

An enterprise product is never one application. It is an admin console, a client area, a vendor portal, each on the web and some on the desktop, and each traditionally a codebase of its own that repeats the same shell, the same forms, and the same session handling.

Web Surface inverts that. The application code is written once and knows nothing of any particular role. A role is a folder of declarations, its configuration, its brand, and its screens, and the build compiles each one into its own application.

The same role can leave the build as a static website or as a native desktop window. Nothing in the role changes; only the output does.

**Roles are data. The surface is the engine that reads them.**

---

## 📦 Download

**One repository. One tag per release. One command to see it.**

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
bun run deps
bun run dev
```

The desktop window is the same command with one flag:

```bash
bun run dev --desk
```

Bun 1.4.4 or newer. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**Everything a role needs, declared in one folder.**

```text
specs/<role>/
├── config/     contracts · settings · contents · themes · features
├── brand/      messages in every locale
└── schema/     the screens, one file each
```

**Spec-Driven Roles** · **Web and Desktop from One Tree** · **Themes per Role** · **Right-to-Left and Left-to-Right** · **Typed API Contracts** · **Sessions and a Vault** · **Offline-Aware States** · **Byte Budgets**

| Command                | What it produces                                       |
| ---------------------- | ------------------------------------------------------ |
| `bun run dev`          | The website, live, on Next                             |
| `bun run dev --desk`   | The desktop window, live, in Electrobun                |
| `bun run build`        | The static website of every role                       |
| `bun run build --desk` | The desktop page of every role                         |
| `bun run release`      | The production website, or desktop build with `--desk` |

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
        render — bridge and host, the desktop boundary
                            │
                         engine
```

**Single Responsibility** · **Unidirectional Layers** · **Explicit Contracts** · **One Fenced Bridge** · **Modular Composition**

Eleven layers, and an import may only travel down. The order is not advice: the build analyzes every file and refuses an import that climbs.

The desktop boundary is fenced twice. Only the `app` layer may reach the bridge, and the host beneath it imports nothing from the application at all. The website never carries desktop code, and the desktop bundle never carries Next.

State, forms, storage, networking, and localization are not written here. They come from the engine, so this tree holds only what is specific to a rendered surface.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not a template. A compiler for surfaces.**

A spec is checked before anything is rendered. Unknown options are refused by name, a role that asks for a desktop window without an application identity is refused before a byte is bundled, and every text a screen shows is a message key resolved for the active locale.

The compile step is explicit and repeatable: specs are compiled, fonts are prepared, the theme is emitted as a stylesheet, and the appearance script is written, in that order, before the type checker runs.

Elements are small and closed, components compose them, and features compose components. Each level is tested on its own, down to the loading, empty, error, denied, and stale states.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**A budget is a number the build is allowed to fail on.**

Every build ends by measuring what it produced. The website's script chunks and the desktop page's bundle each have a byte budget, and a build that exceeds its budget fails.

The website is a static export, so a role can be served from a bucket or an edge with no server to keep warm. The desktop page is minified and split, and ships only the code of its own role.

```bash
bun run build
bun run build --desk
```

The budgets are declared once, in the surface's own settings, where a role may tighten them.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**The surface holds as little as it can, as briefly as it can.**

- **Token custody** is a declared choice of each role, not an accident of the framework.
- **The vault** keeps sensitive values behind one feature with one way in.
- **The desktop bridge** is the only path to native capabilities, and only one layer may call it.
- **Configuration** that differs per deployment arrives from the environment at build time; no secret is written into a spec.
- **Dependencies** are few, pinned, and audited on every gate.

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
| build | the website and the desktop page of every role, inside budget   |
| audit | `bun audit` over the frozen dependency graph                    |

A surface is finished when it has been seen: rendered, in both themes, in both directions, in every state.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
