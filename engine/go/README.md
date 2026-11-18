# ✨ Go Engine

[![Go](https://img.shields.io/badge/Go-Operators_%26_Tooling-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **Small Surface. Sharp Tools. Built to Run Forever.**

A Go foundation engineered for the software that operates other software: **controllers, operators, infrastructure providers, and command-line tools** that must start fast, stay small, and never surprise the person on call.

**Stop rewriting the same plumbing. Start shipping the operator.**

---

## 🎯 Overview

**One workspace. One vocabulary. The standard library first.**

Go rewards simplicity, yet every new operator and every new CLI tends to regrow the same helpers, each with its own names, its own error style, and its own idea of testing.

Go Engine gathers that foundation into one workspace where every domain is a module of its own, speaks the same vocabulary, and is proven the same way before it is allowed to exist.

**Where it stands today:** the workspace, the lint wall, and the complete proof chain are in place, and the first domain, `hello`, walks through every one of them. Domains land one at a time, and none lands without its tests, its benchmark, and its fuzz target.

The mission is deliberate: **the reliability of the standard library with the reach of a complete platform.**

---

## 📦 Download

**One repository. One tag per release. One workspace line.**

The modules are named for the workspace rather than for a host, so the engine is consumed from source through `go.work`:

```bash
git clone https://github.com/comstrx/gunx.git
```

```text
use (
    ./gunx/src/engine
    ./gunx/src/hello
)
```

```go
import "engine"

greeting := engine.NewHello().World()
```

Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**One door. One module per domain. Nothing hidden behind it.**

**Shipped today** · `hello` — the domain that proves the workspace end to end: facade, module, tests, benchmark, fuzz target, and a recorded public surface.

**The direction** · Kubernetes Operators & Controllers · Infrastructure Providers · Command-Line Tools · Configuration & Validation · Processes & Signals · Networking & Clients · Concurrency & Scheduling · Errors & Observability

That second line is a direction, not an inventory. A capability is called shipped only when its module sits in `src/` with its proofs beside it.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
        Operators · Providers · CLIs
                     │
          engine — the one door
                     │
          one module per domain
                     │
     arch (definitions) · verbs (behavior)
                     │
          The Go Standard Library
```

**Single Responsibility** · **Unidirectional Dependencies** · **Explicit Contracts** · **Namespaces as Values** · **Modular Composition**

`src/engine` is the only package a consumer imports. Each domain is a module of its own whose namespace is a value and whose methods are its verbs, so a call reads the same everywhere: `engine.NewHello().World()`. Inside a domain, `arch.go` holds the definitions and the remaining files hold the verbs.

Tests, benchmarks, and fuzz targets are modules of their own, outside the code they prove, and reach the engine through the same door a consumer does.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not another collection of packages. One engineering system.**

`golangci-lint` runs with every linter enabled; the handful that are switched off are named in the configuration, in the open. An import guard allows the standard library and the engine itself, and nothing else: a third-party dependency cannot arrive by accident.

The public surface is recorded. A test parses every package and fails when an exported name appears or disappears without the record changing with it, so the API moves only on purpose.

Every module keeps `go mod tidy` clean, and `go vet` runs across the whole workspace.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Measure first. Optimize second. Keep what the numbers defend.**

Every domain owns a benchmark in `benches/`, run through the standard `testing` package so the results are comparable with any other Go code you already measure.

```bash
go test -bench=. ./benches/...
```

No number is printed here on purpose. Performance is a property of your hardware and your workload; the benchmarks are there so you can read it where it matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**Few dependencies. Many eyes. No silent paths.**

The strongest supply-chain defense is the dependency that was never added, and the import guard enforces exactly that. What remains is checked by `govulncheck` against every module on every audit.

The tests run with the race detector and a shuffled order on every pass. The safety gate runs them again under the address and memory sanitizers, and every domain carries a native fuzz target.

Compatibility is a security property too: `apidiff` compares each released module with the last tag and refuses an incompatible change that did not come with a major version.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

Run what CI runs:

```bash
go vet ./src/engine/... ./src/hello/... ./tests/...
golangci-lint run ./src/engine/... ./src/hello/... ./tests/...
go test -race -shuffle=on ./tests/...
go test -fuzz=FuzzWorld -fuzztime=60s ./fuzz
```

| Gate   | What it proves                                                  |
| ------ | --------------------------------------------------------------- |
| check  | `go mod tidy` is clean in every module, then `go vet`           |
| lint   | `golangci-lint` with every linter on                            |
| test   | `go test -race -shuffle=on` across the workspace                |
| safety | the tests again under the address, memory and thread sanitizers |
| audit  | `govulncheck` on every module                                   |
| semver | `apidiff` against the last released tag                         |

Every change should strengthen the system, preserve architectural boundaries, and justify its complexity.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
