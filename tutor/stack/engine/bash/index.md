# Bash engine

## Contract

A general Bash engine for shared infrastructure, distribution and CI-oriented DSLs. Pursue the same speed, safety, memory efficiency, capability breadth and ease of use as every other engine.

## Structure

The custom framework owns core/config/module/app structure, registration and dependency semantics.
This engine composes that framework into three capabilities: shared infrastructure, distribution, and CI-facing orchestration.

| Engine-owned composition | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| Root manifest and schema | Identity, supported settings, part definitions, dependencies and targets |
| module/bundle            | Portable packaging, embedded sources and assets                          |
| module/gate              | Shared quality workflows and affected-part selection                     |
| module/extract           | Prepared-source transformation, verification and distribution            |
| app                      | This engine's exposed operations and composition                         |
| tests, benches, fuzz     | Engine integration and capability evidence                               |

The manifest is bash.toml, then infra.toml, each matched without regard to case.
Products supply supported configuration; they do not own another copy of the shared schema.

## Rules

### Composition and lifecycle

- Place capabilities according to the framework's layer contract; this engine owns its infrastructure, distribution and CI composition.
- Register public operations through the shared framework; keep names predictable and behavior consistent.
- Modules retain directed dependencies. Explicit integration bridges stay narrow; do not turn one exception into arbitrary sibling imports.
- Workflows call this engine's DSL; shared CI orchestration belongs to its gate capability rather than copied YAML or product runners. Product-specific composition uses supported data and public operations.
- Select behavior through declared parts and their manifests, including the appropriate backend language and surface.
- Bound processes, waits, buffers, concurrency and retries; preserve child ownership, cleanup and meaningful failures.
- Configuration is data. Protect paths and secrets, preserve framework identity and distinguish unsupported options from accepted behavior.
- Make dependencies, platform capabilities and failure modes explicit rather than silently degrading guarantees.

### Distribution

- Targets, names, repositories, source selections, transformations and timing are manifest data.
- Distribution follows prepare → lock → verify → gates → place or push. Pin the source revision, bring the lock files that travel in line with the rewritten manifests, and validate the prepared tree before exposing a target.
- Engines can be extracted as independent tools; products retain their required shared capabilities while excluding unrelated products.
- Preserve the intended specifications and public contracts. Change structured configuration structurally; avoid accidental identifier replacement.
- Reject unintended identities, escaping paths, secrets and environment leakage from prepared output.
- Keep local placement and remote publication explicit. An analysis-only path performs no destination mutation, repository creation, commit, tag or publication; verify actual effects rather than trusting a dry-run label.
- Preserve one authoritative source and clear release destinations. Current configuration does not invent approval for new targets.
- Local placement may be atomic within one filesystem; multiple repository pushes are not one transaction. A supported atomic Git push covers its requested refs on one remote, not several repositories or preceding side effects. Exclusion, recovery and crash durability are separate guarantees.
- Publication and Git mutations retain the owner's explicit authorization requirements.

### Operational depth

- Infrastructure capabilities cover lifecycle, environment selection, provisioning, deployment, backup, restoration and rollback where required.
- A managed module owns its supported versions, installation/configuration and lifecycle postconditions; app composes modules through the registry. Adding a module must not require another configuration parser, help registry or command-dispatch implementation.
- Separate observation and preparation from application. Reconcile desired and observed state, validate staged changes, then verify actual postconditions; an unchanged target should not be reinstalled or restarted without a reason.
- Pin the resolved tool/artifact identity for a reproducible operation. A mutable latest URL or successful download does not identify trusted installed bytes; apply root/arch's dependency and provenance contract.
- For multi-step or non-idempotent mutations, preserve target, artifact/configuration identity, completed steps and uncertain effects without secrets. Resume from verified postconditions under the framework's remote-outcome contract.
- Implement general mechanisms once; products retain their operational choices and business policies.
- Recovery must preserve meaningful state and report uncertain outcomes. Building an artifact is not proof that a deployment succeeded.
- Where rolling replacement is selected, prepare the candidate, establish its relevant readiness, switch routing, verify the served path, then drain the old instance within a bound. Define reversal for failure at each step; a container-running check alone is insufficient.
- Artifact rollback does not reverse schema or business-data changes. Keep old/new compatibility and irreversible steps explicit; use compatible staged schema changes where overlapping versions require them.
- Backup capabilities must restore the required data and dependencies, not just create a file. Cover interruption, integrity, retention and an isolated restore path; consumer policy chooses recovery-point and recovery-time targets.
- Keep the public DSL capable, concise and unsurprising without hiding costs, destructive effects or necessary choices.

### Portable infrastructure and distribution

- Target Linux, macOS and Windows Bash environments through the custom framework's portability boundary; do not duplicate shell/OS mechanics in product configuration.
- Keep target tool assets, checksums, executable suffixes, path conventions and provider availability in validated capability/configuration data.
- Build and extract into a fresh owned destination. Verify manifests, embedded assets, executable requirements and independent startup before publication is considered ready.
- An artifact prepared on one host can carry incorrect modes, line endings, native tools or paths for another. Treat those as target properties, not accidental builder defaults.
- CI-facing operations report affected work, refusal and failure consistently. Sequential or parallel scheduling is a caller/resource decision; the DSL must not hide unbounded concurrency.

## Proof

Cover manifest interpretation, responsibility boundaries, packaging, selection, failure propagation, extraction and recovery.
Deterministic configuration/rendering proofs can avoid live infrastructure. Actual service readiness, remote permissions, traffic switching and restoration need the corresponding integration evidence; an offline proof or fake cannot establish them.
Keep portability, concurrency, performance and real operational outcomes distinct. Methods and timing follow the task; this guide prescribes no shell invocation.

## Sources

The current engine's root manifest and core, config, module, app and proof sources.

[Remote ref transaction boundary](https://git-scm.com/docs/git-push).

[Running versus ready](https://docs.docker.com/compose/how-tos/startup-order/) · [Backup strategy boundaries](https://www.postgresql.org/docs/current/backup.html).
These references illustrate operational distinctions, not mandatory deployment dependencies.

## Routing

Read [libraries](../../lib/index.md) with the custom Bash framework selected. That library continues through the language dispatcher.
Consumer infrastructure reaches this engine through the engine dispatcher.
