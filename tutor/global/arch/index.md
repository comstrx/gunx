# Arch

The toolchain policy, the contracts every part obeys, the services, the one gate, the root governance, the workflows, the release of the whole repository and its direction. Manifests and lockfiles name the numbers; each part's file names its tools and its chain; this file names what is true of all of them.

## Policy

- The newest stable release of every runtime, library, image and action on the day of the task, checked at the official source that day (the registry, the release page, the changelog), never from memory. No exception, no silent downgrade; a pin that cannot be verified is not written; a version remembered from training is a guess, and a guess is not a pin.
- Mature libraries with native cores over custom code; custom code needs a measured advantage. A library that fails on the pinned runtime is replaced after it was installed and exercised there, never on hearsay.
- One strict type checker and one linter with every rule on per language; no formatter on Rust, Python, Go, TypeScript or Bash: the hand style is the format; Prettier for Markdown, YAML and JSON, taplo for TOML, their output accepted as is.

## Contracts

- **Wire:** one envelope on every answer of every api: `data message errors code reason meta.request_id` (+ `page limit total pages` on lists); `X-Request-Id` on every answer and every log line; `Authorization: Bearer`; UTC on the wire, local in display; money as integer minor units with an explicit currency, never a float; socket frames `{event, channel?, data?, id?}`; a `429` carries `Retry-After`; `X-Forwarded-For` trusted only through configured proxies.
- **Fault:** a client reason is a fixed code that never echoes input; no traceback or 500 detail reaches a client; every reason has a message in both languages.
- **Writes:** idempotency key on every unsafe retried call; expected revision on every governed write; actor, time, reason and source on every important event; a stage never advances by itself.
- **Verbs:** one vocabulary in every domain of every engine: `setup ready use register names describe dump load has forget clear stats close`, each saying whether it waits or cancels, whether a retry is safe and what remains. A primary constructor is `create` (a runtime thing) or `define` (a declarative thing). The same verb means the same thing everywhere, in every language.

## Services

PostgreSQL, Redis and RabbitMQ run natively on localhost, never as development containers. Each engine owns an `engine_test` database and provisions it through its own stage; each product service owns `<project>_<service>` and `<project>_<service>_test`. Redis test databases are numbered per owner; RabbitMQ tests declare and purge their own queues. Products own ignored env files plus a committed `.env.example`; engines read only what their tests need.

## Gates

One tool gates every part, the same on a laptop and on a runner, run from the repository root:

```bash
infra gate    [--part <p>] [--product <x>] [--type <t>] [--timeout <s>] [--pass] # everything, or one part
infra ci      [--base <ref>] [--all] [--part <p>] [--product <x>] [--type <t>]   # what moved since the ref and everything built on it
infra changes [--base <ref>] [--all] [--part <p>] [--product <x>]                # what ci would gate, nothing run
```

The parts are the five engines, the fragments `api web mobile desktop`, `tutor` and `root`. The chains live in the infrastructure engine, inlined and tested there; no part keeps its own gate script. The default type chain is `deps check lint test safety audit quality security twins`; `safety` is the memory and soundness gate; `twins` refuses drift between the files the surfaces of one product share; `bench` and `fuzz` run by name and in the daily workflow, and print numbers nothing in code judges. `audit` and `fuzz` belong to the engines and `twins` to the fragments; the root scans every lockfile. Each part's file names its chain.

## Root governance

The root owns what every part obeys: scanners, ignore files, editor and format contracts, documents, changelog, commit grammar, labels, owners and the workflows. A part never duplicates a root rule; a root rule never carries a part's business.

- **One exclusion list, for every project:** the root ignore and scanner files cover the ecosystems of this repository and nothing else (Node, Bun, pnpm, npm, yarn, Python, Rust, Bash, Go); `.gitignore` and `.dockerignore` are one identical list; the same directories in the same order sit in `.trivy.yml`, `.syft.yml`, `.taplo.toml`, `.typos.toml` and as regexes in `.gitleaks.toml`. The list lives at the root alone: no part carries an ignore file. Nothing is pruned because one product does not use it.
- **No standing exceptions:** no scanner ignore file until a real finding must be accepted, then with id, path, statement and expiry. No inline scanner knobs.
- **Secrets never enter the tree:** parts read ignored `.env*`/`.secret*`; examples carry names and neutral defaults; gitleaks scans the tree and the history.
- **Supply chain:** every action hash-pinned and allowlisted in `.zizmor.yml`; every image by digest; every dependency locked; Dependabot weekly, one entry per manifest root that exists today (`<area>(deps)` prefix), grouped so one PR per ecosystem.
- **Public surface:** every engine records its exported names and refuses a silent change: Rust through `cargo semver-checks` against the newest `v*` tag, Python through `__all__` snapshots and `griffe check` against the tag, Go through the exported identifiers of every package parsed from the source, Bun through a recorded export list, Bash through the command and flag tables.
- **Docs tell the truth:** every engine and fragment has its own README (it ships as its tool's README; this folder's router is `skillx`'s); the root README is the owner's and names the parts, gates and measured numbers with date and machine.
- **Changelog:** `## Unreleased` with one `### <part>` block per touched part (`rust python go bun infra tutor`, `<project>-<fragment>`), past-tense facts; a release moves them under `## vX.Y.Z — date`; extraction cuts each tool's block.
- **Commits:** `<area>(<feature>): <sentence>`, areas `rust python go bun infra tutor` for the engines and this folder, `<project>-<fragment>` for products, `global`; explicit paths, one area per commit.

## Workflows

Five files, thin: `ci` (one `gate` job over a fixed matrix, one row per part, each row `infra ci --part <p>`; the infrastructure engine and the root on macOS too; callable with `all`, `type` and `timeout`), `daily` (fuzz every night and bench every morning call `ci` with `all`, `deps,fuzz` or `deps,bench`, an hour a gate and `--pass`, so a slow or failing target is reported and the run stays green), `release` (calls `ci` with `all` on a `v*` tag, then the sync with gates), `labels` and `labeler` keep the labels. No `paths:` filter on a gate and no job that computes a matrix: the command decides what its row gates, and it knows what a path filter cannot (which product an engine serves); a row with nothing to gate exits green.

- **No code in YAML:** a gate job checks out, sets up the language toolchains, installs `infra` onto the runner PATH through the infrastructure engine's composite action, then runs one `infra <command>`; every step is `uses:` of a hash-pinned, allowlisted action or `run: infra <command>`; never a shell line, never a `${{ }}` inside `run:` (values travel through `env:`). The logic lives in the gate module and is tested offline; the same workflow text runs inside a product repository and inside an extracted tool.
- **Shared shape:** `concurrency` on every workflow (a gate run is cancelled only by a newer push to its own pull request), `permissions: contents: read` widened per job only where it writes, `timeout-minutes` on every job, `persist-credentials: false` on every checkout, `fetch-depth: 0` only where a diff or a history scan needs it, no publication secret in a verification job. CI checks, typechecks, tests and builds; it never starts an app, runs a browser flow or measures performance outside the daily bench.
- **Red CI:** read the failing job to its first error, reproduce with the step's exact command, fix the cause in the part, never by loosening a gate, then run the part's full gate. An external failure (registry, index, runner) is re-run once after its cause is read; a second failure is reported.

## Release and distribution

- A `vX.Y.Z` tag on `main` is the release of the whole repository; no tag per product or per tool. The tag runs every gate of every part, then `sync`: every tool of the distribution table is prepared, verified, gated inside its own tree and pushed; a product repository is pushed by name through the same steps.
- What is distributed, to where and at which tag is data in the infrastructure engine's manifest, never a constant in code and never an env key.
- Extraction is one-way packaging, never a rewrite: a tool receives the root files, its tree, its workflows and its changelog block; the monorepo's name, every product's name and a path out of the tree are refused in the prepared tree; the tool repository gets `Track <tag>` and the same tag. `skillx` is Markdown only, with the root gate as its gate.

## Root gate

```bash
infra gate --part root --type deps      # the six scanners at the pins and digests of the infrastructure manifest
infra gate --part root --type security  # gitleaks dir, trivy fs, syft sbom, zizmor pedantic/low
infra gate --part root --type quality   # typos, taplo fmt --check + lint, prettier --check
infra gate --part root                  # all three
infra gate --part tutor                 # typos, prettier --check over this folder
actionlint .github/workflows/<file>.yml # by hand until it learns the $/ syntax
```

The same commands are the CI; a runner adds only the language toolchains. The release and daily workflows call `ci.yml` with GitHub's same-repository syntax (`$/.github/workflows/ci.yml`), which zizmor requires; a local actionlint that does not know it yet reports those lines and nothing else.

## Direction

The tag grows into the whole release: `plan` (one version across every manifest, a tag refused without its changelog section) → every gate → native builds of every binary part on the six targets → `seal` (SBOM, installers, `SHA256SUMS`, provenance attestation) → the GitHub release → `verify` on three systems → `sync`. Extraction then turns a path dependency on an engine into a reference to the engine's tool at the tag, copies the attested release assets into the binary tools and gives every source tool a source archive.
