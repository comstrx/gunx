# Arch

The toolchains, services, gates, root governance, workflows and release of the whole repository. Manifests and lockfiles name the numbers; this file names the tools.

## Policy

- The newest stable release of every runtime, library, image and action on the day of the task, checked at the official source that day (the registry, the release page, the changelog), never from memory. No exception, no silent downgrade; a pin that cannot be verified is not written.
- Mature libraries with native cores over custom code; custom code needs a measured advantage. A library that fails on the pinned runtime is replaced after it was installed and exercised there, never on hearsay.
- One strict type checker and one linter with every rule on per language; no formatter on Rust, Python, Go, TypeScript or Bash (the hand style is the format, `language/`); Prettier for Markdown, YAML and JSON, taplo for TOML.

## Parts

| Part                | Runtime and tools                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/rust`       | stable Rust, Cargo workspace, exact pins, tokio, hyper; clippy deny-wall, cargo-deny, cargo-vet, nextest, criterion, libfuzzer, no `xtask`                                                |
| `engine/python`     | current CPython, uv workspace, Sanic, SQLAlchemy Core + asyncpg, pydantic, orjson, structlog, httpx, native cores by measurement; ruff `ALL`, mypy strict, pytest                         |
| `engine/go`         | current Go, one `go.work` of modules (`src/engine`, `src/<domain>`, `tests`, `benches`, `fuzz`); golangci-lint with every linter (no formatter), govulncheck, `-race`, testing benchmarks |
| `engine/bun`        | Bun (manager, tests, tooling), zod, zustand, React as a peer; Biome, TypeScript strict                                                                                                    |
| `engine/infra`      | Bash 5.2+, ShellCheck pinned, Docker Compose, HAProxy; digests, checksums and the distribution table in `infra.toml`                                                                      |
| `tutor`             | Markdown; Prettier, typos                                                                                                                                                                 |
| `product/*/api`     | its engine by path (`pyproject.toml` or `Cargo.toml` names the language); the engine's gate plus the bootstrap check per service                                                          |
| `product/*/web`     | engine/bun by link, Next, React, Tailwind, Node for the standalone server                                                                                                                 |
| `product/*/mobile`  | engine/bun by link, Expo with its bundled React Native, Metro, Hermes                                                                                                                     |
| `product/*/desktop` | engine/bun by link, Electrobun through Hutch, Bun's bundler, PostCSS                                                                                                                      |
| `product/*/infra`   | `infra.toml` and env files over `engine/infra`; an optional `src/` whose `main.sh` sources the engine's entry                                                                             |
| root                | `gate security` (gitleaks, trivy, syft, zizmor) and `gate quality` (typos, taplo, Prettier), every binary fetched at a pin and a digest; actionlint by hand                               |

## Services

PostgreSQL, Redis and RabbitMQ run natively on localhost, never as development containers. Each engine owns an `engine_test` database and provisions it through its own stage; each product service owns `<project>_<service>` and `<project>_<service>_test`. Redis test databases are numbered per owner; RabbitMQ tests declare and purge their own queues. Products own ignored env files plus a committed `.env.example`; engines read only what their tests need.

## Gates

One command gates every part: `infra gate --part <p> [--product <x>] [--type <t>] [--timeout <s>] [--pass]`, run from the repository root (or `bash engine/infra/src/main.sh --root . gate …` before `infra` is installed). The chains are functions of `engine/infra/src/module/gate/src/<chain>.sh`, inlined and tested there (`stack/engine/infra`); no part keeps its own gate script. The default type chain is `deps check lint test safety audit quality security` (`safety` is the memory and soundness gate: miri, sanitizers, udeps for Rust; asan for Go; dev mode and the debug allocator for Python; `--smol` for Bun; `--shuffle` for infra); `bench` and `fuzz` run by name only.

| Part                | Chain                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/rust`       | `rust`: cargo check + hack powerset · clippy + rustdoc · nextest + doc tests · udeps + miri + asan · deny + vet + semver-checks · `cargo bench` · `cargo fuzz` per target |
| `engine/python`     | `python`: `uv sync --locked` · mypy · ruff · pytest · pytest in dev mode with the debug allocator · pip-audit over the frozen export · `benches/*.py` · `fuzz/*.py`       |
| `engine/go`         | `go`: over every module of `go.work`: `tidy -diff` + vet · golangci-lint · `test -race -shuffle` · `test -asan` · govulncheck · `-bench` · `-fuzz` per target             |
| `engine/bun`        | `bun`: `install --frozen-lockfile` · tsc · `biome ci` · `bun test tests` · `bun --smol test tests` · `bun audit` · `benches/*.bench.ts` · `bun test fuzz`                 |
| `engine/infra`      | `infra`: the runtime packages + ShellCheck at its pin · `check` · `test` · `test --shuffle` · `audit` · `bench` · `fuzz`                                                  |
| `tutor`             | `tutor`: typos · Prettier                                                                                                                                                 |
| `product/*/api`     | the engine chain its manifest names (`pyproject.toml` python, `Cargo.toml` rust, `go.work` go; never bun); journeys on real services on demand                            |
| `product/*/web`     | `bun` (`typecheck` and `build --all` join when the spec engine lands)                                                                                                     |
| `product/*/mobile`  | `bun` (as web)                                                                                                                                                            |
| `product/*/desktop` | `bun` (as web; `native gate` and `app` join with the runtime)                                                                                                             |
| `product/*/infra`   | `bash src/main.sh check` and `test` through the product's entry over the engine, against its `infra.toml` and env files                                                   |
| root                | `global`: the root gate below                                                                                                                                             |

Benches run on demand, never in CI, and print numbers; nothing in code judges them.

## Root governance

The root owns what every part obeys: scanners, ignore files, editor and format contracts, documents, changelog, commit grammar, labels, owners and the workflows. A part never duplicates a root rule; a root rule never carries a part's business.

- **One exclusion list, for every project:** the root ignore and scanner files cover the ecosystems of this repository and nothing else (Node, Bun, pnpm, npm, yarn, Python, Rust, Bash, Go); `.gitignore` and `.dockerignore` are one identical list; the same directories in the same order sit in `.trivy.yml`, `.syft.yml`, `.taplo.toml`, `.typos.toml` and as regexes in `.gitleaks.toml`. Nothing is pruned because one product does not use it.
- **No standing exceptions:** no scanner ignore file until a real finding must be accepted, then with id, path, statement and expiry. No inline scanner knobs.
- **Secrets never enter the tree:** parts read ignored `.env*`/`.secret*`; examples carry names and neutral defaults; gitleaks scans the tree and the history.
- **Supply chain:** every action hash-pinned and allowlisted in `.zizmor.yml`; every image by digest; every dependency locked; Dependabot weekly, one entry per manifest root that exists today (`<area>(deps)` prefix; a product fragment adds its entry when its manifest lands), grouped so one PR per ecosystem.
- **Public surface:** every engine records its exported names and refuses a silent change: Rust through `cargo semver-checks` against the newest `v*` tag, Python through `__all__` snapshots in `tests/test_api.py` and `griffe check` against the tag, Go through `tests/api_test.go` (the exported identifiers of every package, parsed from the source), Bun through `tests/api.json`, Bash through the command and flag tables in `tests/api.sh`; a visibility narrower than `pub` is the default, so a change to the surface is a decision, never an accident.
- **Docs tell the truth:** every engine and fragment has its own README (it ships as its tool's README; `tutor/index.md` is `skillx`'s); the root README is the owner's and names the parts, gates and measured numbers with date and machine.
- **Changelog:** `## Unreleased` with one `### <part>` block per touched part (`rust python go bun infra tutor`, `<project>-<fragment>`), past-tense facts; a release moves them under `## vX.Y.Z — date`; the release refuses a tag without its section; extraction cuts each tool's block.
- **Commits:** `<area>(<feature>): <sentence>`, areas `rust python go bun infra tutor` for the engines and this folder, `<project>-<fragment>` for products, `global`; explicit paths, one area per commit.

## Workflows

Six files, thin. `ci.yml` is the one gate workflow: a `changes` job (`infra changes`, `CI_BASE` from the event, `CI_ALL` from the `all` input) prints one matrix of `{ part, product, os }` rows and a `gate` job runs `infra gate --part --product --type --timeout` for each row (`macos-latest` joins for `infra` and `global`; the toolchain actions are steps guarded by `if: matrix.part == …`, never code). It is callable with `all`, `type` and `timeout`: `release.yml` calls it with `all: true` on a `v*` tag, then `sync --gates --timeout 1800`; `bench.yml` (every morning) and `fuzz.yml` (every night) call it with `all: true`, `type: deps,bench` or `deps,fuzz`, `timeout: 3600`, one job at a time and `--pass` (a slow or failing target is reported, the run stays green); `labels.yml` and `labeler.yml` keep the labels. No `paths:` filters: `changes` decides, and it knows what a path filter cannot (which product an engine serves).

- **No code in YAML:** a job starts with `uses: $/engine/infra/src/module/gate/template` (the engine's composite action installs `infra` onto the runner PATH), then every step is `uses:` of a hash-pinned, allowlisted action or `run: infra <command>` (`gate`, `changes`, `sync`) ; never a shell line, never a `${{ }}` inside `run:` (values travel through `env:`). The logic lives in the `gate` module and is tested offline. The same workflow text runs inside an extracted tool: `sync` rewrites `$/engine/infra/src/module/gate/template` to the pinned `infrax` action and `changes`/`gate` treat a tool root as the product `.`.
- The matrix comes from `changes`: an engine row when its folder moved; `tutor` when `tutor/` moved; `global` when a root file or `engine/infra` moved; a product fragment row when the fragment was touched, when `engine/infra` moved, or when the engine its manifest names moved (a Python api stays out when only Rust moved); `--all`/`CI_ALL=true` lists everything.
- A product's own repository receives the same six files unchanged; a tool receives them with `$/engine/infra/src/module/gate/template` rewritten to the pinned `infrax` action and the `sync` job pruned; in a tool's root `changes` names the part from the manifest (`pyproject.toml` python, `Cargo.toml` rust, `go.work` go, `package.json` bun or `web` when it has a `gate` script, `infra.toml` + `src/main.sh` infra, `index.md` tutor) plus `global`.
- Shared shape: `concurrency` with cancel, `permissions: contents: read` widened per job only where it writes, `timeout-minutes` on every job, `persist-credentials: false` on every checkout, `fetch-depth: 0` only where a diff or a history scan needs it, no publication secret in a verification job. CI checks, typechecks, tests and builds; it never starts an app, runs a browser flow or measures performance outside the daily bench.

## Release and distribution

- One version for the whole repository: a `vX.Y.Z` tag on `main` covers engines and products together; no tag per product or per tool. The tag runs `plan` (one version across every manifest, a changelog section) → every gate → native builds of every binary part on the six targets → `seal` (SBOM, installers, `SHA256SUMS`, provenance attestation) → the GitHub release → `verify` on three systems → `sync`.
- A tag distributes the tools and the client products together: every engine advance reaches every client. What is distributed, to where and at which tag is `[deps]` of `infra.toml` (`name = { type, path, repo, tag?, deps }`; `tag` is `inherit` unless a semver pins it), never a constant in code and never an `.env*` key.
- Extraction is one-way packaging, never a rewrite: a tool receives the root files, its tree, its workflows and its changelog block; path dependencies on an engine become tag references; the monorepo's name, every product's name and a path out of the tree are refused in the prepared tree; the tool repository gets `Track <tag>` and the same tag; binaries and installers are copies of the attested release assets, source tools get a source archive. The fragment tools come from the house product whole, `specs/` included, minus `infra/`; `skillx` is `tutor/` minus every `stack/product/*`, Markdown only, with the root gate as its gate. A tool repository is read-only; no development happens there.
- Extraction and product sync are one DSL, the `sync` kit of `engine/infra` (`stack/engine/infra`): a tool and a product differ only in variables, declared as data (`[deps]` in the engine's `infra.toml`: `name = { type, path, repo, tag?, deps }`; a product's `repo` in its own `[meta]`). Steps, not a script: `extract` (prepare + verify, `--gates --timeout` optional), `place` into a local folder, `push` (`Track <tag>`, `--dry-run` stops before the push), `sync`. Locally the flags are a choice; CI passes them all.

## Root gate

```bash
infra gate --part global --type deps     # gitleaks trivy syft zizmor typos taplo at the pins and digests of engine/infra/infra.toml
infra gate --part global --type security # gitleaks dir, trivy fs, syft sbom (.infra/sbom.spdx.json), zizmor pedantic/low
infra gate --part global --type quality  # typos, taplo fmt --check + lint, prettier --check
infra gate --part global                 # all three
actionlint .github/workflows/<file>.yml  # by hand until it learns the $/ syntax
```

The same commands are the CI; the only thing a runner adds is `setup-bun` for Prettier.

The release, bench and fuzz workflows call `ci.yml` with GitHub's same-repository syntax (`$/.github/workflows/ci.yml`), which zizmor requires; a local actionlint that does not know it yet reports those lines and nothing else.

When CI is red: read the failing job to its first error, reproduce with the step's exact command, fix the cause in the part, never by loosening a gate, run the part's full gate, push only under the order's scope and watch every triggered run to green. An external failure (registry, index, runner) is re-run once after its cause is read; a second failure is reported.
