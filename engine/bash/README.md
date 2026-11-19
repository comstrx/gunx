# ✨ Bash Engine

[![Bash](https://img.shields.io/badge/Bash-Gates_·_Releases_·_Infrastructure-4EAA25?logo=gnubash&logoColor=white)](https://www.gnu.org/software/bash/)
[![CI](https://github.com/comstrx/gunx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/comstrx/gunx/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/comstrx/gunx?sort=semver)](https://github.com/comstrx/gunx/releases/latest)
[![License](https://img.shields.io/badge/License-Apache_2.0-007EC6)](https://www.apache.org/licenses/LICENSE-2.0)

> **One File. Every Gate. The Same Answer Everywhere.**

A Bash foundation engineered to run **the work around the code**: the quality gates of five languages, the build and the install of every tool, the extraction of a monorepo into its mirrors, and the report at the end, from a laptop and from CI with the same command.

**Stop maintaining a Makefile per project. Start running one engine.**

---

## 🎯 Overview

**One command surface. Every language. No drift between local and CI.**

Every repository grows the same undergrowth: a Makefile, a folder of scripts, a CI file that repeats them slightly differently, and a release procedure only one person remembers. Each is written once, tested never, and trusted until the day it fails.

Bash Engine replaces that undergrowth with one program that is itself engineered: layered, typed where Bash allows, tested, benchmarked, fuzzed, and shipped as a single file. It reads a project, recognizes its languages, and runs the right chain for each.

The same gate that runs on your machine runs in CI, because CI calls the same engine.

**Shell scripts are where discipline usually ends. Here it is where discipline starts.**

---

## 📦 Download

**One clone. One command. One file on your path.**

```bash
git clone https://github.com/comstrx/gunx.git
bash gunx/src/main.sh self install
```

The install builds the release bundle, a single self-contained file, and places it on your path as `gunx`. It asks before replacing a command of the same name.

In a GitHub workflow, one step prepares the runner and installs the engine:

```yaml
- uses: comstrx/gunx/src/module/gate/template@<commit>
- run: gunx gate
```

Bash 5.2 or newer runs the engine. Started under an older Bash, the bootstrap finds a newer one, or installs it through the system's package manager, and starts again. Every release is a `vX.Y.Z` tag of this repository; the newest one is on the [releases page](https://github.com/comstrx/gunx/releases/latest).

---

## 🧩 Capabilities

**Everything around the code, behind one word.**

| Command                         | What it does                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `gate`                          | Runs the gates of every path: Rust, Go, Python, Bun, Bash, and the repository |
| `check` `lint` `test` `audit` … | One gate alone, with its arguments passed straight to the tool                |
| `lock`                          | Brings the lock file of a path in line with its manifest, upgrading nothing   |
| `build` `run`                   | Builds or runs a path for release, or for development with `--dev`            |
| `install` `update` `remove`     | The life of a tool as a command on your path                                  |
| `extract`                       | Extracts a part of a monorepo into its own repository: prove, then deliver    |
| `notify`                        | Reports a run to Telegram, Slack, Discord, a webhook, or email                |
| `changes` `toolchains`          | Which paths changed, and which toolchains they need                           |
| `config` `meta` `system`        | The resolved settings, the identity, and the machine, secrets redacted        |
| `self`                          | The engine on itself: build, check, lint, test, bench, fuzz, audit, install   |

**The gates** · `fetch` · `check` · `lint` · `test` · `safety` · `audit` · `semver` · `quality` · `security` · `bench` · `fuzz`

The first nine are the default, and every one of them holds its tool to the lock file; `lock` is the only command that writes it. A path is recognized by its manifest, so one repository may hold every language and still be gated by one command, in full or only where something changed.

**One vocabulary. Endless possibilities.**

---

## 🏗️ Architecture

**Power beneath the surface. Simplicity above it.**

```text
                     app — the command surface
                                │
            module — bundle · gate · extract · notify
                                │
      config — manifest · settings · paths · tools · targets
                                │
        core — fs · proc · net · git · parse · log · error …
                                │
                       Bash · The Operating System
```

**Single Responsibility** · **Unidirectional Dependencies** · **Explicit Contracts** · **Lazy Loading** · **One File to Ship**

Four layers, and a call never travels upward. A module never calls another module. Every definition a module owns lives in its `arch.sh`, its commands in `usage.sh`, and its behavior in files that hold nothing but functions.

A manifest, `bash.toml`, names the identity, the pinned tools, and the paths. A project may lay its own `bash.toml` or `infra.toml` over it, and settings resolve in one order: defaults, the environment file, the process environment, then the command line.

The bundler folds the whole tree, the manifest, and the assets into one file. A release bundle carries no tests; a development bundle carries them all.

**No circular dependencies. No duplicated foundations. No unnecessary complexity.**

---

## 🧠 Engineering

**Not a folder of scripts. One engineering system.**

The architecture is not a convention; it is a law the engine checks on itself. `self check` refuses an upward call, a module that reaches into another, a definition outside `arch.sh`, a comment, a stray `sudo`, or a domain without its test, its benchmark, and its fuzz target.

Every core member, every configuration member, and every module owns exactly three proof files. The tests run each case in isolation and can run in a random order; the benchmarks write a report a machine can read and can be held to a saved baseline; the fuzz targets are fed raw bytes and printable text against the clock.

External tools are pinned by version and by SHA-256, fetched once, and never trusted from the path by accident. Language toolchains are installed only when a path needs them.

**Maximum capability. Minimum friction. Absolute engineering discipline.**

---

## ⚡ Performance

**Start instantly. Load only what the command needs.**

A release bundle is one file with the whitespace and the proofs stripped out, and its units are loaded on first use, so `help` does not pay for `extract`.

Gates run under a time budget, I/O is retried with backoff, and `--only-changed` gates only the paths a change touched.

```bash
gunx self bench
gunx self bench --save
gunx self bench --compare
```

`--save` records a baseline and `--compare` fails a run that is slower than it by more than the tolerance you set. No number is printed here on purpose: the report is yours to produce on the machine that matters.

**Optimization is universal in ambition, evidence-driven in execution.**

---

## 🛡️ Security

**A tool that runs everywhere must trust nothing by default.**

- **Downloads** are verified against a pinned SHA-256 before a single byte is executed.
- **Secrets** are redacted from settings, logs, and reports, and never written into a bundle.
- **Files** are written atomically; symlinked destinations are refused; the lab is private to its user.
- **Extraction** refuses a tree that still carries a secrets file, the name of the repository it left, or its private lab.
- **Workflows** are pinned to commits and audited: the repository gates run gitleaks, Trivy, Syft, and zizmor.
- **Input** is hostile until proven otherwise: every parser and every validator has a fuzz target.

The engine runs with `errexit`, `nounset`, and `pipefail`, and it asks before it replaces anything on your path.

**No silent failures. No unjustified risks. No shortcuts around safety.**

---

## 🧪 Development

**Build with discipline. Verify with evidence. Evolve with confidence.**

The engine gates itself with the same command it gives everyone else:

```bash
gunx gate
gunx gate --type bench
gunx gate --type fuzz
```

| Gate   | What it proves                                                   |
| ------ | ---------------------------------------------------------------- |
| check  | the syntax of every file and the laws of the architecture        |
| lint   | ShellCheck at style severity                                     |
| test   | every test in isolation, each under its own budget               |
| safety | the tests again in a random order                                |
| audit  | every tool pinned, every download checksummed, no secret default |
| semver | the command surface against the last released tag                |

```bash
gunx self build --release
gunx self test --fast
gunx help gate
```

Every change should strengthen the system, preserve architectural boundaries, and justify its complexity.

**Engineering excellence isn't a milestone. It's the standard.**

---

## 📜 License

Copyright © 2026 Abdulrahman Yasser (comstrx).

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
