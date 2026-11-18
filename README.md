# ✨ GunX

<div align="center">
  <br/>
  <img height="130" src="https://github.com/user-attachments/assets/29d06cd7-b9fc-4b19-aab9-97384f19db15"/>
  <br/><br/>
</div>

[![Stack](https://img.shields.io/badge/Rust_·_Go_·_Python_·_TypeScript_·_Bash-Enterprise_Engineering-0D9488?logo=rust&logoColor=white)](https://github.com/comstrx/gunx)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One Monorepo. Five Engines. Every Product After It.**

GunX is the single place where **reusable engines and real enterprise products are built together**: every product sharpens the engines beneath it, and every engine leaves as an independent tool of **ToolX**.

**Build the hard thing once. Ship it everywhere, forever.**

---

## 🎯 Overview

**One repository. Two factories. A loop that never stops.**

**A factory of tools:** five engines and the reusable parts of a product are developed here, against real requirements, and extracted into independent repositories that anyone can depend on.

**A factory of products:** enterprise products are assembled here from those same engines, so a new product starts where the last one finished instead of where it began.

The loop between the two is the whole idea. A product needs a capability; it is built once, in the engine that should own it; the product proves it under real load; and the engine ships it to every product that follows.

No parallel implementations. No throwaway architecture. No tool designed in a vacuum.

The ambition is clear: **prove advanced engineering inside working products, then make that engineering reusable everywhere.**

---

## 📦 Download

**One clone. One command. The whole arsenal.**

```bash
git clone https://github.com/comstrx/gunx.git
cd gunx
bash engine/bash/src/main.sh self install
gunx gate
```

The install places one self-contained command on your path, and from there one word drives everything: gates, builds, extraction, and releases.

Every tool also lives on its own, extracted from here and released under the same tag:

| Tool                                      | Built in              | What it is                                       |
| ----------------------------------------- | --------------------- | ------------------------------------------------ |
| [RustX](https://github.com/comstrx/rustx) | `engine/rust`         | The Rust foundation for systems and backends     |
| [GoX](https://github.com/comstrx/gox)     | `engine/go`           | The Go foundation for operators and tooling      |
| [PyX](https://github.com/comstrx/pyx)     | `engine/python`       | The Python foundation: fifty backend domains     |
| [TSX](https://github.com/comstrx/tsx)     | `engine/typescript`   | The TypeScript foundation for every screen       |
| [BashX](https://github.com/comstrx/bashx) | `engine/bash`         | The engine of gates, builds, and extraction      |
| [APIX](https://github.com/comstrx/apix)   | `product/apex/api`    | The microservice backend, one service per domain |
| [WebX](https://github.com/comstrx/webx)   | `product/apex/web`    | The spec-driven web and desktop surface          |
| [MobX](https://github.com/comstrx/mobx)   | `product/apex/mobile` | The spec-driven native mobile surface            |

---

## 🧩 Capabilities

**Everything an enterprise product needs, and everything needed to ship it.**

**Systems & Backends** · **Microservices & Multi-Tenancy** · **Identity & Authorization** · **Data, Caching & Search** · **Queues, Events & Realtime** · **Web, Desktop & Mobile Surfaces** · **Localization, Right-to-Left & Theming** · **Operators & Command-Line Tools** · **Quality Gates for Five Languages** · **Extraction, Tagging & Releases**

Every capability serves a real product requirement while strengthening the reusable engine beneath it.

**One arsenal. Eight tools. Endless products.**

---

## 🏗️ Architecture

**Five foundations. Three product parts. Strict ownership.**

```text
┌──────────────────────────────────────────────────────────────────┐
│                               GunX                               │
│             Engines · Products · The Factory Between             │
└──────────────────────────────────────────────────────────────────┘
                                  │
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐
│   Rust   │ │    Go    │ │  Python  │ │  TypeScript  │ │   Bash   │
│  RustX   │ │   GoX    │ │   PyX    │ │     TSX      │ │  BashX   │
└──────────┘ └──────────┘ └──────────┘ └──────────────┘ └──────────┘
                                  │
         ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
         │     API      │ │     Web      │ │    Mobile    │
         │     APIX     │ │     WebX     │ │     MobX     │
         └──────────────┘ └──────────────┘ └──────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────┐
│                       Enterprise Products                        │
│                Apex · and every product after it                 │
└──────────────────────────────────────────────────────────────────┘
                                  │
                  extract · verify · gate · release
                                  │
┌──────────────────────────────────────────────────────────────────┐
│            ToolX Repositories · Product Repositories             │
└──────────────────────────────────────────────────────────────────┘
```

**Python foundation:** [PyX](./engine/python) → [APIX](./product/apex/api)  
**TypeScript foundation:** [TSX](./engine/typescript) → [WebX](./product/apex/web) · [MobX](./product/apex/mobile)  
**Systems foundations:** [RustX](./engine/rust) · [GoX](./engine/go)  
**The factory itself:** [BashX](./engine/bash) → gates every path, extracts every tool

Each engine owns generic capabilities and knows no product. Each part owns one specialized concern and never imports a sibling. A product owns what is truly its own: its business domains, its roles, its branding, its texts, and its data.

**One-way dependencies. One owner per responsibility. No duplicated foundations.**

---

## 🧠 Engineering

**Not a folder of projects. One factory with a production line.**

The line is a single table. Every tool is one row: its kind, its folder, its repository, and what it depends on. One command reads the table and walks each row through the same stations:

1. **Copy** only what belongs to the tool. Locks and build artifacts never travel.
2. **Rename** the identity of this repository into the tool's own, across its documents, manifests, and workflows.
3. **Verify** that nothing of the source leaked: not its name, not a secrets file, not its private lab.
4. **Gate** the extracted tree on its own, with the same gates that guard it here.
5. **Deliver** the result: commit, tag, and release in the tool's repository.

Rows are walked in dependency order. A tool that fails stops only itself and whatever waits on it; everything else still ships.

The independent repositories are **one-way release destinations**. GunX remains the single source of development; extraction is packaging, never a rewrite.

**Maximum reuse. Minimum coupling. No architectural shortcuts.**

---

## ⚡ Performance

**Push the hardware. Challenge the assumptions. Prove every gain.**

Memory-Safe Systems · Async I/O · Native Hot Paths · Bounded Concurrency · Lean Bundles · Byte Budgets · Static Exports · Resource-Aware Gates

Every engine owns its benchmarks, every surface builds against a byte budget it is allowed to fail, and the gates run only where a change landed. Real workloads, not marketing benchmarks, decide what stays.

**Maximum practical efficiency. Zero performance theater.**

---

## 🛡️ Security

**Enterprise trust starts at the boundaries.**

Memory safety, tenant isolation enforced by the database, least privilege, typed input at every edge, and secrets that never reach a repository are design requirements across the stack.

The supply chain is guarded in every language it enters through, and the repository itself is scanned on every gate for leaked secrets, vulnerable dependencies, and unsafe workflows. Tools are pinned by version and by checksum, workflows by commit.

Extraction is a security boundary of its own: a tree that still carries a secrets file or the name of its source is refused before it can leave.

**No cross-tenant shortcuts. No silent trust. No compromise on integrity.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Release with confidence.**

Each path owns its linting, tests, audits, and benchmarks. One command runs them, here and in CI, and gates only what a change touched when you ask it to.

```bash
gunx gate
gunx gate --only-changed
gunx gate --path engine/python
gunx extract rustx --to ../rustx
```

**Build in GunX → prove in GunX → release through ToolX.**

[Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Support](./SUPPORT.md) · [Issues](https://github.com/comstrx/gunx/issues)

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
