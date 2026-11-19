# Bash

## Contract

Bash owns shell semantics, command composition and portable shell practice.
The custom framework owns its DSL; this language file does not. The owning engine/part owns product layout and application registries.
Write for the runtime supported by the owning manifest and tested platforms.
Do not adopt a new syntax merely because the newest manual describes it.
Manifests own installed versions; root architecture owns release decisions. Language syntax must match the selected supported runtime.

## Structure

Use one entry for shell options and process-wide policy.
Use named functions for operations and arrays for argument vectors.
Keep data construction separate from command execution.
Use a controlled output variable when a hot loop needs a scalar result.
Keep public parameters, output channels and exit behavior explicit.
Initialize locals before the operation that may fail.
Keep a function small enough that cleanup and failure paths remain visible.

```bash
read:line () {

    local path="${1}" line=""

    [[ -f "${path}" ]] || return 1
    IFS= read -r line < "${path}" || [[ -n "${line}" ]] || return 1

    printf '%s\n' "${line}"

}
```

The sample illustrates shell shape only, not a public framework verb.

## Rules

- Four spaces; lowercase names; a blank line inside a multiline function.
- Quote expansions and keep braces around variable names.
- Pass argv as an array; never reconstruct a command from a string.
- Shell quoting does not turn another interpreter’s program into inert data. Keep sed/awk patterns and scripts under their owning contract; in-place flags or script side effects can bypass an outer staging protocol.
- Use fixed printf formats; treat supplied text as data.
- Read with explicit IFS and read -r when backslashes are data.
- Preserve filenames with NUL-delimited traversal where necessary.
- Validate numeric syntax, range and radix before arithmetic. Bash recursively evaluates variable values as expressions and does not detect integer overflow; decimal input with leading zero must not silently become octal.
- Validate identifiers and option values before interpretation. Quoting a value does not make it safe as an arithmetic expression, array subscript or indirect variable reference.
- A nameref target satisfies the operation’s identifier and allowed-write-scope contract; never accept an arbitrary variable expression. Make aliasing and write-back explicit.
- Separate local declaration from fallible command substitution.
- Propagate failures explicitly; errexit alone is not a complete error model.
- Know the tested/list/pipeline contexts where errexit changes behavior.
- Capture a failing command's status before another command overwrites it.
- Keep cleanup idempotent and scoped to resources this process created.
- A trap does not recover SIGKILL or a host crash.
- Use the captured child PID; do not stop processes by a broad name match.
- Use builtins and parameter expansion before spawning repeated processes.
- Batch unavoidable external work outside per-record loops.
- Avoid repeated command substitutions and regex compilation in hot loops.
- A speed claim needs a workload, measured output and toolchain context.
- Bound adversarial pattern/input work; compare builtins and external tools on the actual workload.
- Ordinary command substitution strips trailing newlines.
- Shell variables are not a transport for arbitrary binary content.
- Avoid accidental state loss across pipelines and subshell boundaries.
- Do not source configuration or turn a value into code through eval.
- Keep locale assumptions local to parsing that requires them.
- Never send secrets through argv, xtrace, errors or world-readable files.
- Use private temporary directories and explicit restrictive file modes. Reserve the object securely; generating a supposedly unused name, including mktemp dry-run output, does not reserve it against another writer.
- Stage replacement files beside their destinations on the same filesystem. A move utility may copy and remove across filesystems; a successful move is not by itself proof of atomic rename.
- Atomic visibility does not establish crash durability.
- A successful append is not necessarily one complete logical record.
- Lock participants must agree on the lock object and protocol.
- Keep platform differences behind a single portability boundary.
- Noninteractive automation must not wait at a privilege prompt.
- No formatter replaces the owner's hand style.

### Empty values and record boundaries

- Distinguish an absent argument, a present empty argument and a nonempty value. A colon in default/alternate parameter expansion tests both unset and null; choose that behavior only when the contract equates them.
- Preserve argument count and order through quoted argument arrays. Joining records needs explicit position or first-item state; accumulated output can remain empty after a valid item.
- The first character of IFS used by quoted star expansion is not an arbitrary multi-character join separator. Implement the stated separator contract without reinterpreting supplied text.
- Compare exact bytes when trailing newlines matter. Command substitution removes trailing newlines, so it cannot by itself verify a line-output contract.
- A join operation does not imply CSV, shell or wire escaping. Keep serialization rules with their format owner and cover empty first, middle and final fields.

### Host portability

- Support Linux, macOS and Windows through a declared Bash environment. Check the actual Bash version and required builtins; the host's default shell is not a version guarantee.
- Git Bash/MSYS2 provides a compatibility environment; MinGW builds native Windows programs. Keep shell paths, native executable paths and argument conversion distinct.
- MSYS may convert argv/environment paths passed to native executables. Restrict conversion exceptions to the affected arguments; blanket disabling can break valid paths.
- Handle spaces, Unicode, drive letters, UNC paths, path-list separators and case differences at the owning boundary. Use arrays through process creation; do not solve quoting by adding eval.
- GNU/BSD utility options differ. Detect required behavior or use the declared portable implementation; do not assume GNU stat, sed, date, readlink or timeout on every host.
- Avoid unconditional /proc, Unix signals, executable-bit, symlink, file-lock and open-file rename assumptions. Explain unavailable guarantees rather than silently reporting success.
- Keep script line endings and interpreter selection intentional. Test bytes separately from line-oriented text, including CRLF, empty input and an unterminated final line.

### Expansion and process state

- Bash 5.3's current-environment command substitution can avoid a subshell, but side effects persist in the caller. Its REPLY form differs from stdout capture in newline handling; use only with a compatible pinned runtime and an explicit state contract.
- A sourced library executes in the caller shell; changes to options, traps, working directory and variables can persist. Save/restore state temporarily owned by the operation; sourcing is not isolation.
- Capture pipeline statuses before another command replaces them. A producer hidden behind process substitution needs its own observed outcome; success of the consumer alone is insufficient.
- pipefail reports failure after pipeline stages have run; it cannot roll back a downstream write. When publication requires successful production, finish and validate staged output before exposing it at the destination.
- Distinguish EOF from read failure and preserve partial final records only when the format permits them. A streaming parser must not accumulate an unbounded file in a scalar.
- Ambient BASH_ENV, exported functions and executable search paths can affect noninteractive startup. Define the trusted process environment at the entry boundary; ordinary data must not choose code to source.

### Literal replacement

- Parameter substitution has separate pattern and replacement interpretation. With patsub_replacement enabled, unquoted ampersands in the replacement expand to the matched text; quoting the enclosing result is insufficient. Preserve literal replacement data at that inner boundary without changing caller shell options.

- Quoted pattern data disables pattern metacharacters, but nocasematch still changes substitution case matching. State the required matching policy; preserving literal syntax alone does not establish case sensitivity. Keep any temporary shell-state change scoped and restored.

### Function and child ownership

- Bash locals are dynamically scoped: a called function can read or change a caller's visible local. Declare implementation temporaries locally, avoid collisions with output-reference names, and make intentional write-back explicit. A helper call is not a variable-isolation boundary.
- Starting an asynchronous command establishes neither completion nor success. Collect each owned child's status; an argument-free wait returns zero after waiting and cannot summarize failures. When using wait -n/-p, retain the completed child identity with its result.
- A trapped signal can interrupt wait before the child exits. Distinguish interrupted observation from child completion, then continue the operation's shutdown/join policy; a signal-shaped status alone does not prove the child was reaped.

## Proof

ShellCheck findings are errors under the owning project's configuration.
Inline lint suppressions do not substitute for correcting the design.
Exercise success, exact output, failure status and resource cleanup.
Test hostile input as data, including spaces, newlines and option prefixes.
Test interruption, timeout and repeated invocation at real process boundaries.
Parser fuzzing must bound work and preserve a failing input.
Performance evidence records distributions and the actual environment.
Execution scope and timing follow root/work and the current assignment.
Source reading is evidence of implementation, not a passed execution.

## Sources

- [GNU Bash manual](https://www.gnu.org/software/bash/manual/).
- [Bash 5.3 release](https://lists.gnu.org/archive/html/bug-bash/2025-07/msg00005.html).
- [Linux write semantics](https://man7.org/linux/man-pages/man2/write.2.html).
- [Linux durability semantics](https://man7.org/linux/man-pages/man2/fsync.2.html).

[MSYS2 path conversion](https://www.msys2.org/docs/filesystem-paths/) · [MSYS2 portability](https://www.msys2.org/wiki/Porting/).

[Bash substitution forms](https://www.gnu.org/s/bash/manual/html_node/Command-Substitution.html) · [Execution environment](https://www.gnu.org/software/bash/manual/html_node/Command-Execution-Environment.html) · [Bash invocation](https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html) · [Arithmetic evaluation](https://www.gnu.org/software/bash/manual/html_node/Shell-Arithmetic.html).

[Parameter expansion](https://www.gnu.org/s/bash/manual/html_node/Shell-Parameter-Expansion.html) · [Special parameters](https://www.gnu.org/s/bash/manual/html_node/Special-Parameters.html).

[Temporary object creation](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html) · [Move and copy fallback](https://www.gnu.org/s/coreutils/manual/html_node/mv-invocation.html).

[Dynamic function scope](https://www.gnu.org/s/bash/manual/html_node/Shell-Functions.html).

[Child completion](https://www.gnu.org/s/bash/manual/html_node/Job-Control-Builtins.html).

## Routing

This is the language leaf reached through the language hub.
Root learning is already complete. Return to the caller after study; do not re-enter the library dispatcher from this leaf.
