# Custom Bash framework

## Contract

This is the custom Bash framework, distinct from the Bash language.
It supplies a standard library, configuration, modules, application wiring,
command registration, proofs and self-contained source embedding.
The framework owns mechanism; an application supplies composition and data.
The engine owns its source coordinates, deployed composition and command availability.
Modules own extensible capabilities; bundle owns embedded source and assets. These names identify framework responsibilities.

## Structure

| Layer  | Responsibility                                                     |
| ------ | ------------------------------------------------------------------ |
| core   | General shell, filesystem, parsing, process and platform verbs     |
| config | Validated settings, manifest, identity, paths and declared targets |
| module | One capability composed over core, config and bundle               |
| app    | Application entry, boot and composition of modules                 |
| proofs | Tests, benches and fuzz consumers of the public verbs              |

Public function names are layer:domain:verb, with more verb segments if needed.
The source-derived domain is stable and each name is defined once.
Core, config and app are flat; module code is flat under its src directory.
A module has index.sh, src/ and optional template/ data.
Facades load their owned code; the existing app facade is an explicit exception.
Proof names use test:, fixture:, bench: or fuzz:.
The one macro file is the only place that defines @ names.

## Rules

- Dependencies descend from app to module, then config/core; proofs consume the public contract.
- A module calls core, config, bundle and itself.
- Cross-module application composition belongs to app.
- Preserve a source-enforced explicit bridge; do not generalize exceptions.
- Reach TOML and YAML through core:parse rather than parser internals.
- @use delegates to module:bundle:load:use, the loader the bundle owns.
- Module identifiers use ::; resolution tries file.sh then folder/index.sh.
- The loader caches loaded paths and refuses an in-progress source cycle.
- Failed loading clears that path's state so failure is not cached as success.
- Bundled resolution uses bundle:source and bundle:sources.
- A final source symlink is refused by the disk loader.
- This check is not a claim of protection against hostile ancestor races.
- @usage takes NAME HANDLER USAGE SUMMARY and registers one command.
- Command names are lowercase identifiers with optional digits or hyphens.
- Duplicate commands fail; summaries are bounded to 80 characters.
- @flag takes COMMAND, a flag/value specification and its summary.
- @global takes FLAG VALUE SUMMARY.
- The same registry supplies help, valued-flag parsing and dispatch.
- @print is data output; log macros are diagnostics; predicates stay silent.
- @err delegates to the framework failure verb; callers propagate failure.
- @eq, @contains, @absent, @fails, @errors and @status are proof helpers.
- @measure delegates to bench measurement; @tool runs and @ensure installs pinned tools.
- Macros are shorthand over callable verbs, never a second implementation.
- Core, config and bundle remain below the macro consumption boundary.
- Configuration is data: schema, file, process environment, CLI overrides.
- Unknown settings fail instead of silently becoming executable policy.
- Local and release environment selection is explicit, never a file merge.
- Identity is read from validated metadata; it is not repeated in sources.
- Network processes use the owning timeout/retry boundary and redact failures. Confirm its effective guarantees before reporting bounded execution.
- Process helpers own child identity, shutdown requests and completion observation. Distinguish a liveness check from a collected exit result and descendant cleanup; expose the guarantees actually supported.
- The filesystem writer stages beside the target, sets its mode and renames.
- Staged file visibility does not establish crash durability or writer exclusion; each stronger guarantee needs an implemented filesystem boundary.
- A lock identifies its ownership and recovery protocol. PID-only recovery cannot establish safe ownership across PID reuse or hostile replacement.
- The packer emits readable source dispatch and quoted asset payloads.
- Release packing strips attributed proofs and source whitespace.
- Asset bytes remain unchanged; release output is not compressed executable data.
- Development bundles retain proof code for their runners.
- A checksum is integrity evidence, not sender authentication.
- Loading the entry with INFRA_ENTRY=library suppresses dispatch.
- Library loading still shares shell state; it is not process isolation.
- A missing reusable verb belongs in core or its owning module once.

### Configuration and generated files

- The settings owner defines precedence, allowed keys and missing/empty semantics once. Preserve its selected-file behavior; accepting several files or merging environments requires an explicit contract change.
- Separate supplied values from derived values. Validate dependencies before deriving; reject invalid combinations before mutation. Diagnostics may explain a value's source without printing its secret content.
- Resolve only declared template bindings and fail on a missing required value. Substitute literal data once; replacement text containing template syntax must not trigger recursive interpretation.
- Serialize for the actual consumer grammar, including quotes, newlines, backslashes and interpolation characters. A dotenv file is not a shell script, and TOML, YAML, environment files and service configuration need their own encoding rules; wrapping every value in single quotes is not a universal serializer.
- Validate staged configuration with its declared format/consumer where available before exposing it. Preserve allowed permissions and failure-safe publication through the filesystem contract below.
- Required secrets follow enabled capabilities. Key-name heuristics may supplement declared secret metadata, never replace it; disabled integrations should not demand unrelated credentials.

### System and remote execution

- Discover host/runtime, executable capability and target separately. An installed package manager or existing command name does not prove it can perform the requested operation; account for privilege, noninteractive behavior and target architecture.
- Keep detection read-only and predicates silent. An install or privilege escalation is a separate explicit operation, not a side effect of a presence check.
- The SSH integration owns connection/authentication options, host verification and remote command transport. Private-key files, an authentication agent and certificates are configuration choices; PEM describes an encoding, not another transport or independent login method.
- Keep authenticated server identity separate from client credentials. Unknown or changed host identity must follow the configured trust policy; never disable verification merely to remove a prompt.
- Automation must fail clearly when authentication needs unavailable interaction. Preserve argument boundaries through the remote shell too; a safe local argv does not by itself encode the remote command safely.
- Observe remote command outcome separately from transport loss. A disconnected client cannot establish whether a remote mutation completed; reconnect and inspect through the operation's recovery contract before replay.
- A required timeout uses supported enforcement or an explicit refusal; a missing host utility cannot turn it into unbounded execution. The retry owner combines attempt policy with the caller's deadline and side-effect contract.
- Resource discovery distinguishes host totals, available headroom and deployment quotas. Preserve unknown values instead of presenting fallbacks as measured capacity.

### Filesystem guarantees

- Name normalization and a final symlink check do not prevent ancestor replacement between check and use.
- Restrict writable parents to trusted principals, or use a suitable rooted-descriptor primitive in the owning integration.
- Treat atomic visibility, exclusion and crash durability as three separate requirements and verify the promised subset.
- A transform preserves the old destination when its producer fails, including after partial output. Publish only complete validated output under the selected replacement contract; preserve mode and clean only operation-owned staging paths.
- A tree replacement declares its own visibility, exclusion and recovery guarantees. A staged file writer does not make clearing and copying a directory atomic.

### Source, bundle and platform behavior

- Source-loaded development, proof-bearing development bundles and stripped release bundles have distinct contents. Keep their public operations equivalent; compare source and embedded resolution with the same fixtures.
- The framework's platform owner is responsible for process, filesystem, executable discovery and paths across the declared targets. Modules consume that boundary instead of repeating host detection; unsupported required behavior is refused explicitly.
- Git Bash/MSYS2 behavior is not native Unix behavior. Apply the language's path/process portability rules at the framework boundary, especially when invoking native Windows tools.
- A self-contained source bundle still needs a supported Bash and any declared external executables. Embedded assets do not make an unavailable host dependency portable.
- Examine loader caching, repeated entry, rejected registration and cleanup through real source/bundle entry paths. Separate entry/parse startup from warmed verb measurements.

## Proof

Proofs pin loader cycles, duplicates, layers and allowed macro positions.
Registration tests pin flags, help, dispatch and rejected input.
Configuration tests pin precedence and atomic rejection of unknown keys.
Pack tests compare embedded assets byte for byte.
Filesystem proofs cover modes, symlinks, ordinary writes and lock ownership.
Interruption and contention need separate proof; ordinary cases imply neither.
Benches print distributions; comparison is an explicit requested operation.
Fuzz targets bound parser work and preserve failing input.
Methods and timing follow the assigned work and its relevant quality contracts.

## Sources

- Observed loader, registry, macro, settings, manifest, law and pack modules.
- Observed framework load, CLI, settings, law, filesystem and pack tests.
- [GNU Bash manual](https://www.gnu.org/software/bash/manual/).
- [Atomic rename](https://man7.org/linux/man-pages/man2/rename.2.html).
- [Advisory locking](https://man7.org/linux/man-pages/man2/flock.2.html).

The framework source and its contract proofs establish installed behavior; root architecture owns evidence levels.

[SSH identity and noninteractive connection policy](https://man.openbsd.org/ssh_config) · [Key encodings](https://man.openbsd.org/ssh-keygen) · [Environment interpolation grammar example](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation).
The environment-file reference illustrates a consumer format; it does not make that consumer mandatory.

## Routing

Read [the language hub](../../lang/index.md) and select Bash.
After language study, return to the caller; the calling dispatcher selects any additional library.
