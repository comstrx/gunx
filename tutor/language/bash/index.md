# Bash

How Bash is written here. Bash lives in the infrastructure engine: a product extends it only over the engine's entry and under the same laws, and a workflow step calls a command, never a script. The hand style is the format: no `shfmt`; ShellCheck and the framework's own `check` enforce rules, the hand writes the shape.

## Toolchain

- Bash 5.2+ on Linux and macOS; ShellCheck pinned, every finding an error, no inline `shellcheck disable`.
- Strict mode at the one entry (`set -euo pipefail`, `IFS` fixed, `LC_ALL=C` where parsing depends on it); never re-declared inside a file.
- Builtins before processes; a process only through a verb that quotes, times out and redacts; `sudo -n` only, never a prompt.
- Hot paths fork nothing and compile nothing: no `$( )` inside a per-line loop (a nameref or a global carries the value), no `=~` per line (bash compiles the regex on every evaluation, about 0.7 ms each; globs and parameter expansion do the work; a regex stays for the rare branch), no temp file where `<( )` serves.

## Hand style

```bash
module:docker:network () {

    local name="${1}" owner="${2}" label=""

    if docker network inspect "${name}" >/dev/null 2>&1; then

        label="$(docker network inspect --format '{{index .Labels "io.infra.owner"}}' "${name}")" || return

        [[ "${label}" == "${owner}" ]] || { @err "Network ${name} belongs to ${label:-another owner}"; return; }

        return 0

    fi

    docker network create --label "io.infra.owner=${owner}" "${name}" >/dev/null \
        || { @err "Network creation failed: ${name}"; return; }

}
```

- Four-space indent; lowercase names as layer, domain and verb joined by colons; a space before `()` and `{`; one blank line after a function opens and before it closes; initialized locals first; early guards and compact branches; `[[ ]]` always; quoted expansions always; `"${var}"` braces always; a long `||` continues on its own indented line.
- A function is defined once and named by its place; a facade file holds no function; nothing floats: loading, printing and failing go through named verbs or their `@` short hands, never a bare helper.
- Errors: a failure prints one redacted line on stderr and returns 1 (usage 2); callers write `|| return`; no manual status code outside signal traps; data through the print verb, diagnostics through the log verbs; predicates are silent.
- I/O: a process that touches the network runs under a retry with backoff inside a timeout; a budget alone is a timeout; neither runs a function, only a process.
- Nothing of the identity is spelled: the owner, the name and the version come from the manifest through verbs.
- Portable: Linux and macOS are one target; the differences (`uname`, `stat -c|-f`, `sha256sum|shasum`, `timeout|gtimeout`, `shuf|sort -R`, `kill -0 || ps -p`, a `mkdir` lock since macOS has no `flock`) are decided in one core layer and nowhere else; a package comes through one package verb over the machine's manager, never a hand-written `apt-get`.
- Files: a facade is `index.sh`, one per folder, the only file a sibling folder sources; zero comments except one owner comment per block in an env file and the proof attribute `#cfg[test|bench|fuzz]` on the line above a function, which makes that function a proof living beside the code, discovered by the runners and stripped from the release bundle, like Rust's `#[cfg(test)]`.
- Values are data: config resolves once with a fixed precedence; unknown keys fail atomically; a value never becomes executable (`eval` is refused); TOML is read by a strict subset parser.
- Safety: writes are atomic through a staging file and `mv`; temporary files in a per-run session directory; secrets never in argv (curl `--config -` on stdin with `--disable`, `--password-stdin`, HMAC with builtins); files that hold them are 600; SSH verifies host keys always.

## Tests

- Offline tests discovered by name, each in its own process and sandbox under a timeout, output shown on failure; the assertions are the framework's expect verbs; real Compose and HAProxy proofs run in bounded labs, never in CI.
- Fuzz targets take one file of random bytes and return 0 or 1, never crash: every parser has one; a budget runs each in a subshell and saves a crashing input. Benches print p50/p95/p99/min/max/mean; a saved baseline and a tolerance judge a regression on demand.
