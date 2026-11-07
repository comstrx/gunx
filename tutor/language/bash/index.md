# Bash

How Bash is written here. Every Bash script of the repository lives in `engine/infra`; a product never writes Bash, a workflow step calls a command. The hand style is the format: no `shfmt`; ShellCheck and the framework's `check` enforce rules, the hand writes the shape.

## Toolchain

- Bash 5.2+ on Linux and macOS; ShellCheck pinned, every finding an error, no inline `shellcheck disable`; `check` (the framework's law command) on every source and test file.
- Strict mode at the one entry (`set -euo pipefail`, `IFS` fixed, `LC_ALL=C` where parsing depends on it); never re-declared inside a file.
- Builtins before processes; a process only through a core verb that quotes, times out and redacts; `sudo -n` only, never a prompt.
- Hot paths fork nothing and compile nothing: no `$( )` inside a per-line loop (a nameref or a global carries the value), no `=~` per line (bash compiles the regex on every evaluation, ~0.7 ms each; globs and parameter expansion do the work; a regex stays for the rare branch), no temp file where `<( )` serves. The measure is `bench`: the release bundle starts `hello` in ~130 ms, the manifest parses in ~10 ms.

## Hand style

```bash
module:docker:network () {

    local name="${1}" owner="${2}" label=""

    if docker network inspect "${name}" >/dev/null 2>&1; then

        label="$(docker network inspect --format '{{index .Labels "io.infra.owner"}}' "${name}")" || return

        [[ "${label}" == "${owner}" ]] || { err "Network ${name} belongs to ${label:-another owner}"; return; }

        return 0

    fi

    docker network create --label "io.infra.owner=${owner}" "${name}" >/dev/null \
        || { err "Network creation failed: ${name}"; return; }

}
```

- Four-space indent; lowercase names as `{layer}:{domain}:{verb}` (`core:fs:file:read`, `app:sync:extract`, `test:app:sync:keep-selects-the-tree`); a space before `()` and `{`; one blank line after a function opens and before it closes; initialized locals first; early guards and compact branches; `[[ ]]` always; quoted expansions always; `"${var}"` braces always.
- A function is defined once and named by its path: `src/core/<domain>.sh`, `src/config/<domain>.sh` and `src/app/<domain>.sh` define `<layer>:<domain>:*` (`core`, `config` and `app` are flat; `src/app/index.sh` is the router and defines `app:*`); `src/module/<name>/src/<file>.sh` defines `module:<name>:*` (a module is `index.sh` + `src/` + `template/`); `tests/*.test.sh` defines `test:<layer>:<domain>:*` and `fixture:…`, `benches/*.bench.sh` `bench:…`, `fuzz/*.fuzz.sh` `fuzz:…`, any other file in those folders is ignored; a facade (`index.sh`, `main.sh`) holds no function. No name floats: the import is `core:load:use core::fs` (a file, else the folder's `index.sh`; `|| return` after it), the value channel is `core:log:print`, the failure channel is `core:error:fail`; above the bundle they are `@use`, `@print`, `@err`. The only unprefixed functions are the `@` macros of `module/bundle/src/macro.sh`.
- A layer calls its own layer and the layers below (`core < config < module < app < proofs`), never above; every called name must be defined; a module calls core, config, the bundle and itself, never a sibling module (`extract` reaches `gate` from `src/module/extract/src/gate.sh` only); `core:toml:*` and `core:yaml:*` are reached through `core:parse:*` only; `core` is a standard library (under 500 lines a domain, no proof inside); a command is declared in its module's `src/usage.sh` (`@usage`, `@flag`), never collected in one place; `app/router.sh` binds names to handlers through the registry.
- Macros: `@use @print @debug @info @succ @warn @err @usage @flag @global @eq @contains @absent @fails @errors @status @measure @tool @fetch`, defined only in `module/bundle/src/macro.sh` as one-line wrappers over the real verbs, called only from the modules above the bundle, from `app/` and from the proofs (`check` refuses a macro in core, config or the bundle, and a macro defined anywhere else). The real verb is always available; the macro is the short hand.
- Errors: `core:error:fail "message"` (`@err` above the bundle) prints `[-]` on stderr, redacted, and returns 1 (`core:error:usage` returns 2, `core:error:raise CODE` any code); callers write `|| return`; no manual status code outside signal traps; data through `core:log:print` (`@print`), diagnostics through `core:log:{debug,info,succ,warn}` (`@debug @info @succ @warn`); predicates are silent.
- I/O: a process that touches the network runs under `core:process:io` (retries with backoff inside a timeout, from `RUN_TIMEOUT RUN_RETRIES RUN_BACKOFF`); a budget alone is `core:process:timeout`; neither runs a function, only a process.
- Nothing of the identity is spelled: the owner, the name, the version come from `config:meta:*` (`config:meta:owner` is the first author); a proof that writes the owner's name is refused by `check`.
- Portable: Linux and macOS alike; the differences live in core (`core:sys`, `core:fs:file:edit`, `core:list:shuffle`, `core:process:timeout`, `core:sys:sudo`) and `check` refuses `sed -i`, `shuf`, `readlink -f`, `date -d`, `grep -P`, a bare `timeout` and a bare `sudo` anywhere else; a package comes through `core:pkg` (ten managers, one `plan` per action) and never through a hand-written `apt-get`.
- Files: a facade is `index.sh`, one per folder, the only file a sibling folder sources; a file is a concern of 100–300 lines; as wide as a readable line; zero comments (an env file alone allows one owner comment per block) except the attribute `#cfg[test]`, `#cfg[bench]` or `#cfg[fuzz]` on the line right above a function: that function is a proof living beside the code, discovered by `test bench fuzz` and stripped from the release bundle, like Rust's `#[cfg(test)]`.
- Values are data: config resolves once with a fixed precedence; unknown keys fail atomically; a value never becomes executable (`eval` is refused by `check`); TOML is read by the strict subset parser.
- Safety: writes are atomic through a staging file and `mv`; temporary files in a per-run session directory; secrets never in argv (curl `--config -` on stdin with `--disable`, `--password-stdin`, HMAC with builtins); files that hold them are 600; SSH verifies host keys always.

## Tests

- Offline tests discovered by name (`test:*` in `tests/*.test.sh`, plus every `#cfg[test]` function outside `core/`); the assertions are `module:bundle:expect:*`; every domain of `src/` has a `test:<layer>:<domain>:*` case or a `#cfg[test]` function (`check` refuses the tree otherwise); run by `test` (`--check --list --shuffle --fast`) each in its own process and sandbox under `TEST_TIMEOUT`, output shown on failure; a test compares each embedded bundle asset with its file; real Compose and HAProxy proofs run in bounded labs, never in CI.
- Fuzz targets `fuzz:*` under `fuzz/*.fuzz.sh` (plus `#cfg[fuzz]` functions) take one file of random bytes and return 0 or 1, never crash: every parser (`core:parse:toml`, `core:parse:env`, `core:cli:parse`, `module:extract:git:parse`) has one; `fuzz <seconds>` runs each for the budget in a subshell and saves a crashing input under `target/`. Benches `bench:*` under `benches/*.bench.sh` (plus `#cfg[bench]` functions) go through `module:bundle:bench:measure` (warmup, batches, p50/p95/p99/min/max/mean and `p50ns`); `bench --save` keeps the baseline under `target/bench`, `bench --compare` fails past `BENCH_TOLERANCE`.
- `check` builds the dev bundle and enforces the layer calls, the module reach law, the naming law, the one-definition law, the defined-call law, the test-per-domain law, the no-comment and no-`eval` laws (a test may hold either only as text inside a fixture) and ShellCheck on the bundle; nothing judges size or style.
