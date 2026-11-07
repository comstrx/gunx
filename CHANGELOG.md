# Changelog

Every release of GunX, one section per tag, short bullets.

## Unreleased

### rust

- Opened the workspace under `src/`: `engine-hello` with `Hello::world`, the `engine` facade with one feature per domain and no default, declared `tests`, `benches` and `fuzz` targets, the lint wall, `clippy.toml`, `deny.toml`, cargo-vet exemptions and the `xtask` gate runner (`gates check clippy test doc audit vet udeps hack semver fuzz bench doctor setup`).

### python

- Opened the uv workspace: the facade distribution `engine` (`src/engine`, `pkgutil` namespace root) over `engine-hello` (`src/hello/src/engine/hello`, `hello.world()`), versions read from the root, every pin in `constraint-dependencies`, ruff `ALL`, mypy strict, pytest with random order and a timeout, a test, a bench, a hypothesis fuzz target and pip-audit.

### go

- Opened the workspace: `go.work` over `src/hello` (module `engine/hello`, `New().World()`, standing alone), `src/engine` (the facade module), `tests`, `benches` and `fuzz` (a native fuzz target); golangci-lint with every linter on and no formatter, govulncheck per module.

### bun

- Opened the workspace: member `engine-hello` (`src/hello/src`, `world()`), the `engine` facade exporting `.` and `./hello`, the root `catalog`, the hoisted linker, Biome and TypeScript strict, a test, a mitata bench, a fast-check fuzz target and `bun audit`.

### infra

- Folded `ci` and `tool` away: `gate` is one command (`--part --product --type --timeout --pass`; every part present by default, the first product by default, a type chain of `deps check lint test safety audit quality security` (`safety` = udeps + miri + asan for Rust, asan for Go, dev mode with the debug allocator for Python, `--smol` for Bun, `--shuffle` for infra) with `bench` and `fuzz` by name only, each type in its own subshell under a budget, a chain file per language with every command inlined so no part keeps a gate script), `changes` moved into it, `tool` into the bundle (`@tool`, `@fetch` for many names skipping what is at its pin), `yaml` and `toml` into core behind the one `core:parse` DSL, the workflow rewrite into `extract/src/flows.sh`; a read-only `core:git`; the module reach law (a module calls core, config, the bundle and itself; `extract` reaches `gate` from one file; `core:toml`/`core:yaml` only through `core:parse`); the composite action moved to `module/gate/template`; `setup` removed; `[paths] cache = ".infra"` is the lab (`config:paths:lab`: under the served root, else `${TMPDIR}/.infra`): `tools/`, `sbom/`, `run/<stamp>/` sessions with a pid and the pruning of dead ones, `lock/` by `mkdir` (portable, re-entrant, stale owners swept) around every tool download; `verify` refuses a lab in a tree and a mirror commit excludes it; test sandboxes sit under the session behind `GIT_CEILING_DIRECTORIES`; `target/` keeps the checkout artifacts only; 148 tests.
- Rewrote the DSL as `{layer}:{domain}:{verb}` with no floating name (`core:load:use`, `core:log:print`, `core:error:fail`; the `@` macros are the only short hands) and `core:load:use core::fs` resolving a file or a folder's `index.sh`; four layers `core` (a flat standard library: `load log error ui str num list validate sys run fs net parse cfg cli`, under 500 lines a domain, no proof inside) → `config` (flat: `settings manifest targets`) → `module/<name>/{index.sh,src/,template/}` (plug and play: `bundle tool ci gate extract`) → `app` (flat, one file per domain registering its commands with `module:bundle:usage:add`, `index.sh` the router); proofs are flat files found by suffix (`tests/*.test.sh benches/*.bench.sh fuzz/*.fuzz.sh`) plus any function marked `#cfg[test|bench|fuzz]` beside the code, stripped from the release bundle; core gained `error`, `ui` (registry, rows, tables), `run` (`timeout`, `retry`, `io`), `bench` (quantiles, baseline), `net`; every network call retries under a timeout (`RUN_*`), every test runs under `TEST_TIMEOUT`; `check` adds the defined-call and test-per-domain laws; one `build [--dev]` (release by default), `test` (`--shuffle --fast`), `bench` (`--save --compare` over `BENCH_TOLERANCE`); every domain proven (27 files, 101 cases); `install [--alias NAME] [--into DIR]` writes the release bundle as a command; the distribution table is read from the root's `infra.toml` first, `targets` and `sync` refuse a missing part or an empty table; the `api` gate and `changes` know Go; `core:git` grew `parse resolve origin token exists create ensure checkout commit tag push` (every address form, owner from `origin`, a missing repository created private through `gh` or the API, an orphan branch when new, commits on top of the mirror's history, never a force push); `push` is clone, fill, verify, gate, commit, push with `--repository R` and a `--dry-run` that stops before the push; the table holds `owner/name`; `core:fs:tree:replace`; `core:net:json`; 138 cases, 8 benches, 10 fuzz targets; the bundle provides global macros (`module/bundle/src/macro.sh`: `@use @print @info @succ @warn @err @usage @flag @global @eq @contains @absent @fails @errors @status @measure`, a layer over the verbs, never a replacement), every module declares its commands in `src/usage.sh`, `help view` moved into the bundle, and `app/` is `index.sh` (entry) + `boot.sh` (load order) + `router.sh` (binding) only; `help` is one flat list (no groups, no `stack` meta: the engine is the general framework of the work, the deploy stacks live under `[deploy]`); the manifest is one shape (`[meta]` with description, license, readme and authors behind `infra meta`; `[tools]` pins as a string or `{ version, binary, … }`; `[deps]` as `name = { type, path, repo, deps = [...] }` with `tag` inherited unless a semver is written; `[packages]` only where a name differs) read by a TOML parser that knows inline tables and arrays; the log prints icons and colors on a terminal; `config:meta:*` reads the identity (`owner` = the first author) and `check` refuses a proof that spells the owner; core gained `sys` (os, runtime, distro, ci, cores, memory, `sudo -n`, `report` behind `infra system`), `pkg` (ten package managers with a testable `plan`) and `process` (the former `run` plus spawn, alive, wait, stop, find), `fs:file:edit` and `list:shuffle` keep Linux and macOS one target, `check` refuses non-portable commands outside core, `setup infra` installs the `[requires]` runtime through the machine's manager with the names of `[packages.<manager>]`, `global.yml` runs on ubuntu and macos; the engine is a composite action (`src/module/ci/template/action.yml`, `install` extends `GITHUB_PATH`) and the workflows call `infra` after `uses: $/engine/infra/src/module/ci/template`; `.github/` travels with every tool, rewritten by the new `core:yaml` (`prune erase hollow sub keys`): own workflow plus `global labels labeler daily release`, `paths` erased, absent siblings and the `sync` job pruned, version files re-pointed, the action pinned to the infrax mirror's sha, labels and Dependabot reduced to the tool, the monorepo's name taken from `origin`; `changes` and `gate` serve a tool root as the product `.`; `verify` refuses monorepo paths under `.github/`; `module:tool` fetches every pinned binary (`[binary] [archive] [downloads]`: shellcheck, gitleaks, trivy, syft, zizmor, typos, taplo), `gate security` and `gate quality` run them (`gate global` = both) so the CI and the laptop run the same commands, `global.yml` is one job and `verdict` is gone; the release bundle is slimmed (blank lines and indentation gone) and the hot paths fork and compile nothing (parsers on globs, the log level and the command registry indexed, embedded assets read through process substitution): `hello` from the release bundle 340 ms → 130 ms, the manifest parse 90 ms → 10 ms, 116 KB → 106 KB; strict mode is `set -euo pipefail`.
- Grew the `ci` kit: `setup PART`, `verdict`, fragment lists in `changes` written to `GITHUB_OUTPUT`, `gate` resolving a fragment from `CI_PRODUCT`; `verify` now refuses every product's name; renamed docs are re-formatted at sync; `sys-timeout`, `fs-copy-list`, `fs-clear` and a read-only `git` moved into core; 36 tests; the ten tools extract with their gates green.
- Added the distribution: a `[tool.<name>]` table for the ten tools, the `sync` kit (`extract place push sync targets` with `--gates --timeout --into --branch --dry-run`) over `git ls-files`, a changelog cut, a verify that refuses the monorepo's name, out-of-tree paths and env files, and the `ci` kit (`changes gate`); a read-only `git` core; 35 tests.
- Opened the engine as layers: `core` (`load log sys fs parse cfg manifest cli expect pack`), `config` (schema, precedence, validation), `module` (`build`, `shellcheck`), kits (`bundle gate law hello`) and `ui`; one dev or release bundle under `target/`, `check` (syntax, pinned ShellCheck, the laws), `test` in sandboxes, `bench`, `fuzz` (random bytes into every parser for a time budget), `audit` (pins, digests, schema, secret-shaped values), `config`, `help`.

### global

- Rewrote every workflow from scratch and then folded them into six thin files: `ci` (a `changes` job printing one `{ part, product, os }` matrix, a `gate` job per row running `infra gate --part --product --type --timeout`, callable with `all`, `type` and `timeout`), `release` (`ci` with `all`, then `sync --gates`), `bench` (every morning, `deps,bench`, one hour a part, one at a time, `--pass`), `fuzz` (every night, the same with `deps,fuzz`), `labels`, `labeler`; no `paths:` filters, `changes` decides; every action hash-pinned and allowlisted, no shell line and no expression inside `run:`; actionlint and zizmor (pedantic, low) clean; Dependabot entries for the house product's fragments.

### apex-api

- Opened the fragment as a hello skeleton: a uv package `api` with one verb, a test and the Python gate.

### apex-web

- Opened the fragment as a hello skeleton: a Bun package `web` with one verb, a test and `bun run gate`.

### apex-mobile

- Opened the fragment as a hello skeleton, as web.

### apex-desktop

- Opened the fragment as a hello skeleton, as web.

### tutor

- Rewrote the router (boot, task routes, vocabulary), `work` (creed, truth, research, sessions table, reply), `memory` (recovery) and `vision` (the scale); added the Rust canon, status lines on every library file and the full design bar on `web`.
- Recorded the surface law (one API record per engine, semver tools per language), the 80-character description law and the two comment exceptions.
- Recorded what the proof settled: no default Rust feature, kits may call sibling kits, the Bash vocabulary and naming law, the release-age exclusions for pinned Bun dev tools, `hello` as the proof verb of every engine.
