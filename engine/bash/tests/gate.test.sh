fixture:module:gate:repo () {

    local root="${TMPDIR}/repo"

    mkdir -p "${root}/engine/rust" "${root}/engine/bash/src" "${root}/product/demo/web" "${root}/product/demo/api"
    printf '' > "${root}/engine/rust/Cargo.toml"
    printf '' > "${root}/engine/bash/bash.toml"
    printf '' > "${root}/engine/bash/src/main.sh"
    printf '{"dependencies":{"api":"file:../api"}}' > "${root}/product/demo/web/package.json"
    printf '' > "${root}/product/demo/api/pyproject.toml"
    printf '' > "${root}/.gitleaks.toml"

    git -C "${root}" init -q -b main
    git -C "${root}" add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m one

    cd -- "${root}" && pwd -P

}
test:module:gate:lists-the-types () {

    @eq "$(module:gate:types default | tr '\n' ' ')" 'fetch check lint test safety audit semver quality security '
    @eq "$(module:gate:types all | tr '\n' ' ')" 'fetch check lint test safety audit semver quality security bench fuzz '
    @eq "$(module:gate:types fetch,fuzz | tr '\n' ' ')" 'fetch fuzz '
    @errors 'Unknown type: deps' module:gate:types deps
    @eq "$(module:gate:types lock | tr '\n' ' ')" 'lock '
    @errors 'Unknown type: nope' module:gate:types nope
    @errors 'Unknown type: nope' module:gate:types check,nope

}
test:module:gate:finds-the-chains () {

    local root=""

    root="$(fixture:module:gate:repo)"

    @eq "$(module:gate:chains "${root}/engine/rust")" rust
    @eq "$(module:gate:chains "${root}/engine/bash")" bash
    @eq "$(module:gate:chains "${root}/product/demo/api")" python
    @eq "$(module:gate:chains "${root}/product/demo/web")" bun
    @eq "$(module:gate:chains "${root}/product/demo")" ''

    printf '{}' > "${root}/engine/rust/package.json"
    @eq "$(module:gate:chains "${root}/engine/rust" | tr '\n' ' ')" 'rust bun '

}
test:module:gate:plans-the-paths () {

    local root=""

    root="$(fixture:module:gate:repo)"

    cd -- "${root}/engine/rust" || return

    @eq "$(module:gate:plan 0 '' test | tr '\t\n' ' |')" "rust ${root}/engine/rust|"
    @eq "$(module:gate:plan 1 '' quality test | cut -f1 | tr '\n' ' ')" 'rust root '
    @eq "$(module:gate:plan 1 '' quality | tail -n 1 | cut -f2)" "${root}"
    @eq "$(module:gate:plan 0 '' quality test | cut -f1 | tr '\n' ' ')" 'rust '

    @eq "$(module:gate:plan 0 "../bash, ${root}/product/demo/api,../bash" test | cut -f1 | tr '\n' ' ')" 'bash python '

    cd -- "${root}" || return

    @eq "$(module:gate:plan 0 '' quality test | tr '\t\n' ' |')" "root ${root}|"

    @errors 'No gate target in' module:gate:plan 0 product/demo test

    @errors 'Not a directory: nope' module:gate:plan 0 nope test

    @eq "$(module:gate:within "${root}/product/demo" | cut -f1 | tr '\n' ' ')" 'python bun root '
    @eq "$(module:gate:within "${root}/engine/rust" | cut -f1 | tr '\n' ' ')" 'rust root '
    @eq "$(module:gate:within "${root}" | tr '\t' ' ' | tr '\n' '|')" "bash ${root}/engine/bash|rust ${root}/engine/rust|python ${root}/product/demo/api|bun ${root}/product/demo/web|root ${root}|"

    mkdir -p "${root}/engine/rust/crates/inner"
    printf '' > "${root}/engine/rust/crates/inner/Cargo.toml"
    @eq "$(module:gate:within "${root}" | grep -c rust)" 1

}
test:module:gate:refuses-bad-flags () {

    local root=""

    root="$(fixture:module:gate:repo)"
    cd -- "${root}/engine/rust" || return

    CLI_VALUED=( [--path]=true [--type]=true [--timeout]=true )

    CLI_FLAGS=( [--type]=nope )
    @errors 'Unknown type: nope' module:gate:run

    CLI_FLAGS=( [--timeout]=0 )
    @errors '--timeout must be a positive number' module:gate:run

    CLI_FLAGS=( [--path]=nope )
    @errors 'Not a directory: nope' module:gate:run

    CLI_FLAGS=()
    @errors 'gate takes no argument; the directories go in --path' module:gate:run extra

}
test:module:gate:runs-one-part-within-its-budget () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}/src"
    printf '' > "${root}/bash.toml"
    cat > "${root}/src/main.sh" <<'TOOL'
[[ "$1" != self ]] || shift
case "$1" in
    check) echo "checked in $(basename "$PWD")" ;;
    test)  exit 3 ;;
    bench) sleep 5 ;;
    fuzz)  echo "fuzz $2" ;;
esac
TOOL

    @eq "$(module:gate:one bash "${root}" 'check' 7 false 2>&1 | grep -c 'checked in tool')" 1
    @eq "$(module:gate:one bash "${root}" 'fuzz' 100 false 2>&1 | grep -c 'fuzz 30')" 1
    @errors 'failed at test' module:gate:one bash "${root}" 'check test' 7 false
    @contains "$(module:gate:one bash "${root}" 'check test' 7 true 2>&1)" 'failed at test; passing as asked'
    @errors 'ran out of its 1s timeout' module:gate:one bash "${root}" 'bench' 1 false
    @eq "$(module:gate:one bash "${root}" 'quality' 7 false 2>&1)" ''
    @contains "$(module:gate:one bash "${root}" 'check' 7 false 2>&1)" 'passed: fetch check'
    @errors 'Not a directory' module:gate:one bash "${root}/nope" 'check' 7 false

}
test:module:gate:keeps-the-truth-in-the-summary () {

    local root="${TMPDIR}/tool" summary="${TMPDIR}/summary.md" report=""

    mkdir -p "${root}/src"
    printf '' > "${root}/bash.toml"
    cat > "${root}/src/main.sh" <<'TOOL'
[[ "$1" != self ]] || shift
case "$1" in
    check) exit 0 ;;
    test)  exit 3 ;;
    bench) sleep 5 ;;
esac
TOOL

    GATE_RESULTS=()
    module:gate:one bash "${root}" 'check test bench' 1 true 2>/dev/null
    report="$(GITHUB_STEP_SUMMARY="${summary}" module:gate:summary)"

    @contains "${report}" 'check'
    @contains "${report}" 'bench'
    @contains "${report}" 'passed=2 failed=1 timed-out=1 not-run=0'
    @contains "$(cat "${summary}")" '| Chain | Path | Gate | Result | Seconds |'
    @contains "$(cat "${summary}")" '| test | failed |'

    GATE_RESULTS=()
    module:gate:one bash "${root}" 'check test bench' 7 false 2>/dev/null || true
    @contains "$(module:gate:summary)" 'passed=2 failed=1 timed-out=0 not-run=1'

}
test:module:gate:judges-the-surface () {

    @eq "$(module:gate:semver:lost $'a\nb\nc' $'c\na\nd')" b
    @eq "$(module:gate:semver:lost $'a' $'a\nb')" ''
    @contains "$(module:gate:semver:judge v0.1.0 '' 2>&1)" 'keeps every promise of v0.1.0'
    @errors 'the surface breaks v0.1.0' module:gate:semver:judge v0.1.0 'core:str:trim'
    @contains "$(module:gate:semver:bumped v0.1.0 0.2.0 2>&1)" 'may break; skipped'
    @fails module:gate:semver:bumped v0.1.0 0.1.1

}
test:module:gate:picks-the-safety-checks () {

    CLI_VALUED=( [--type]=true )

    CLI_ARGS=( safety ) CLI_FLAGS=()
    @eq "$(module:gate:safety:kinds)" 'sanitizer address'
    @fails module:gate:safety:alone

    CLI_FLAGS=( [--type]='miri, udeps' )
    @eq "$(module:gate:safety:kinds | tr '\n' '|')" 'miri stacked|udeps |'
    @contains "$(module:gate:safety:alone 2>&1)" 'skipped'

    CLI_FLAGS=( [--type]='miri:tree,sanitizer:thread,sanitizer:leak' )
    @eq "$(module:gate:safety:kinds | tr '\n' '|')" 'miri tree|sanitizer thread|sanitizer leak|'

    CLI_ARGS=( gate ) CLI_FLAGS=( [--type]=safety )
    @eq "$(module:gate:safety:kinds)" 'sanitizer address'

    CLI_ARGS=( safety )
    CLI_FLAGS=( [--type]=miri:bogus )
    @errors 'A miri mode is one of stacked tree' module:gate:safety:check
    CLI_FLAGS=( [--type]=sanitizer:cosmic )
    @errors 'A sanitizer is one of address thread memory leak' module:gate:safety:check
    CLI_FLAGS=( [--type]=udeps:x )
    @errors 'udeps has no kind' module:gate:safety:check
    CLI_FLAGS=( [--type]=lint )
    @errors 'Unknown safety type: lint' module:gate:safety:check

}
test:module:gate:builds-and-runs-a-path () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}/src"
    printf '' > "${root}/bash.toml"
    cat > "${root}/src/main.sh" <<'TOOL'
if [[ "${1} ${2:-}" == "self build" ]]; then printf 'built %s\n' "${*:3}"; printf '%s\n' "${BUNDLE}"; exit 0; fi
printf 'ran %s\n' "$*"
TOOL
    printf 'printf "release %%s\\n" "$*"\n' > "${TMPDIR}/bundle"
    export BUNDLE="${TMPDIR}/bundle"

    @eq "$(module:gate:life build --path "${root}" --dev -p one -- --two 2>/dev/null | head -n 1)" 'built --dev -p one -- --two'
    @eq "$(module:gate:life build --path="${root}" 2>/dev/null | head -n 1)" 'built '
    @eq "$(module:gate:life run --dev --path "${root}" hello 2>/dev/null)" 'ran hello'
    @eq "$(module:gate:life run --path "${root}" hello 2>/dev/null)" 'release hello'
    mkdir -p "${TMPDIR}/other"
    printf '' > "${TMPDIR}/other/Cargo.toml"
    @errors 'run takes one target, not 2' module:gate:life run --path "${root},${TMPDIR}/other"
    @errors '--path needs the directories' module:gate:life build --path

}
test:module:gate:names-the-toolchains () {

    local root=""

    root="$(fixture:module:gate:repo)"
    cd -- "${root}" || return

    printf 'go 1.25\n' > "${root}/engine/rust/go.mod"
    printf '{"packageManager":"bun@1.0.0"}' > "${root}/product/demo/web/package.json"
    printf 'singleQuote: true\n' > "${root}/.prettierrc.yml"

    @eq "$(bash "${TOOL_BIN}" toolchains | tr '\n' ' ')" 'rust=true python=true go=true go-file=engine/rust/go.mod bun=true bun-file=product/demo/web/package.json '
    @eq "$(bash "${TOOL_BIN}" toolchains --path product/demo/api)" python=true
    @eq "$(bash "${TOOL_BIN}" toolchains --path engine/bash)" ''

    rm -f -- "${root}/product/demo/web/package.json" "${root}/engine/rust/go.mod"
    @eq "$(bash "${TOOL_BIN}" toolchains | tr '\n' ' ')" 'rust=true python=true bun=true '

    @errors 'toolchains takes no argument' bash "${TOOL_BIN}" toolchains extra

}
test:module:gate:hands-the-rest-to-one-gate () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}/src"
    printf '' > "${root}/bash.toml"
    cat > "${root}/src/main.sh" <<'TOOL'
[[ "$1" != self ]] || shift
echo "ran $*"
TOOL

    GATE_KIND=check
    GATE_REST=( --fast one )

    @contains "$(module:gate:one bash "${root}" 'check' 7 false 2>&1)" 'ran check --fast one'
    @absent "$(module:gate:one bash "${root}" 'check' 7 false 2>&1)" 'shellcheck --fast'
    @absent "$(module:gate:one bash "${root}" 'lint' 7 false 2>&1)" '--fast'

}
test:module:gate:a-writer-runs-first-and-alone () {

    local root="${TMPDIR}/part"

    mkdir -p "${root}"

    module:gate:demo:lock () { :; }
    module:gate:demo:fetch () { :; }
    module:gate:demo:check () { :; }

    GATE_RESULTS=()
    module:gate:one demo "${root}" 'lock' 7 false >/dev/null 2>&1
    @eq "$(printf '%s\n' "${GATE_RESULTS[@]}" | cut -f3 | tr '\n' ' ')" 'lock '

    GATE_RESULTS=()
    module:gate:one demo "${root}" 'check lock' 7 false >/dev/null 2>&1
    @eq "$(printf '%s\n' "${GATE_RESULTS[@]}" | cut -f3 | tr '\n' ' ')" 'lock fetch check '

    GATE_RESULTS=()
    module:gate:one demo "${root}" 'lock fetch' 7 false >/dev/null 2>&1
    @eq "$(printf '%s\n' "${GATE_RESULTS[@]}" | cut -f3 | tr '\n' ' ')" 'lock fetch '

    @errors 'demo does not support the test gate' module:gate:one demo "${root}" 'check test' 7 false
    @eq "$(module:gate:one demo "${root}" 'quality' 7 false 2>&1)" ''
    @eq "$(module:gate:one root "${root}" 'lock' 7 false 2>&1)" ''

}
test:module:gate:every-language-speaks-every-gate () {

    local chain="" type=""

    for chain in bash rust go python bun; do

        for type in "${GATE_TYPES[@]}" build run; do

            module:gate:owes "${chain}" "${type}" || [[ "${type}" == build || "${type}" == run ]] || continue
            module:gate:fits "${chain}" "${type}" || @err "${chain} does not speak ${type}"

        done

    done

}
test:module:gate:holds-every-tool-to-its-lock () {

    uv () { printf 'uv %s\n' "$*"; }
    cargo () { printf 'cargo %s\n' "$*"; }
    module:gate:install:rust () { :; }

    GATE_ARGS=()

    @eq "$(module:gate:python:fetch 2>&1)" 'uv sync --locked'
    @eq "$(module:gate:rust:fetch 2>&1)" 'cargo fetch --locked'
    @contains "$(module:gate:rust:check 2>&1)" 'cargo check --workspace --all-targets --all-features --locked'
    @eq "$(module:gate:python:lock 2>&1)" 'uv lock'
    @eq "$(module:gate:rust:lock 2>&1)" 'cargo update --workspace'

    GATE_LOCK_UV=()
    GATE_LOCK_CARGO=()

    @eq "$(module:gate:python:fetch 2>&1)" 'uv sync'
    @eq "$(module:gate:rust:fetch 2>&1)" 'cargo fetch'

}
test:module:gate:watches-what-it-builds-on () {

    local root=""

    root="$(fixture:module:gate:repo)"

    @eq "$(module:gate:watch "${root}/product/demo/web" | tr '\n' ' ')" "${root}/product/demo/web ${root}/product/demo/api "
    @eq "$(module:gate:watch "${root}/engine/rust")" "${root}/engine/rust"
    module:gate:fresh "${root}/product/demo/web" "${root}/product/demo/api/main.py"
    @fails module:gate:fresh "${root}/product/demo/web" "${root}/product/demo/apiary/x"
    @fails module:gate:fresh "${root}/product/demo/web" ''

}
test:module:gate:keeps-the-changed-paths () {

    local root=""

    root="$(fixture:module:gate:repo)"
    CLI_VALUED=( [--path]=true [--base]=true )
    cd -- "${root}" || return

    printf 'changed\n' > "${root}/product/demo/api/main.py"

    CLI_FLAGS=( [--base]=HEAD )
    @eq "$(module:gate:keep "rust"$'\t'"${root}/engine/rust" "python"$'\t'"${root}/product/demo/api" "bun"$'\t'"${root}/product/demo/web" 2>/dev/null | cut -f1 | tr '\n' ' ')" 'python bun '
    @contains "$(module:gate:keep "rust"$'\t'"${root}/engine/rust" 2>&1)" 'nothing changed since HEAD'

    @contains "$(bash "${TOOL_BIN}" changes --base HEAD --path engine/rust,product/demo/api)" $'engine/rust       unchanged'
    @contains "$(bash "${TOOL_BIN}" changes --base HEAD --path product/demo/api)" $'product/demo/api  changed'
    @errors 'Cannot diff against nope' bash "${TOOL_BIN}" changes --base nope
    @errors 'changes takes no argument' bash "${TOOL_BIN}" changes extra

}
test:module:gate:routes-the-life-of-a-tool () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}/src" "${TMPDIR}/other"
    printf '' > "${root}/bash.toml"
    printf '' > "${TMPDIR}/other/Cargo.toml"
    cat > "${root}/src/main.sh" <<'TOOL'
echo "ran $*"
TOOL

    @eq "$(module:gate:life install --path "${root}" --alias name --yes 2>/dev/null)" 'ran self install --alias name --yes'
    @eq "$(module:gate:life update --path "${root}" --dev 2>/dev/null)" 'ran self update'
    @eq "$(module:gate:life remove --path "${root}" 2>/dev/null)" 'ran self remove'
    @errors 'rust does not support install' module:gate:life install --path "${TMPDIR}/other"
    @eq "$(module:bundle:usage:handler update)" module:gate:update

}
test:module:gate:names-the-tool-a-chain-lacks () {

    core:sys:has () { return 1; }

    GATE_ARGS=()

    @errors 'Missing tool: uv' module:gate:python:lock
    @errors 'Missing tool: uv' module:gate:python:fetch
    @errors 'Missing tool: cargo' module:gate:rust:lock
    @errors 'Missing tool: bun' module:gate:bun:lock
    @errors 'Missing tool: bun' module:gate:bun:fetch
    @errors 'Missing tool: go' module:gate:go:lock

}
test:module:gate:a-refused-gate-runs-nothing () {

    local root="${TMPDIR}/part"

    mkdir -p "${root}"

    module:gate:demo:fetch () { printf ran > fetched; }
    module:gate:demo:check () { printf ran > checked; }

    GATE_RESULTS=()

    @errors 'demo does not support the lint gate' module:gate:one demo "${root}" 'check lint' 7 false

    [[ ! -e "${root}/fetched" && ! -e "${root}/checked" && ${#GATE_RESULTS[@]} -eq 0 ]] || @err 'a refused chain still ran a gate'

    @fails module:gate:owes root lock
    @fails module:gate:owes rust quality
    module:gate:owes root security
    module:gate:owes bash lock

}
test:module:gate:all-leaves-the-writers-to-their-own-command () {

    local type=""

    for type in "${GATE_WRITERS[@]}"; do

        @absent " $(module:gate:types all | tr '\n' ' ')" " ${type} "
        @absent " $(module:gate:types default | tr '\n' ' ')" " ${type} "
        @eq "$(module:gate:types "${type}")" "${type}"

    done

    @eq "$(module:gate:types default | head -n 1)" "${GATE_LEAD}"

}
