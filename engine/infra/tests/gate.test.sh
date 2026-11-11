fixture:module:gate:repo () {

    local root="${TMPDIR}/repo"

    mkdir -p "${root}/engine/rust" "${root}/engine/infra" "${root}/product/demo/web" "${root}/product/demo/api" "${root}/product/other/api" "${root}/tutor"
    printf '{}' > "${root}/product/demo/web/package.json"
    printf '' > "${root}/product/demo/api/pyproject.toml"
    printf '' > "${root}/product/other/api/Cargo.toml"

    @print "${root}"

}
test:module:gate:lists-the-types () {

    @eq "$(module:gate:types default | tr '\n' ' ')" 'deps check lint test safety audit quality security twins '
    @eq "$(module:gate:types all | tr '\n' ' ')" 'deps check lint test safety audit quality security twins bench fuzz '
    @eq "$(module:gate:types deps,fuzz | tr '\n' ' ')" 'deps fuzz '
    @errors 'Unknown type: nope' module:gate:types nope
    @errors 'Unknown type: nope' module:gate:types check,nope

}
test:module:gate:homes-every-part () {

    local root=""

    root="$(fixture:module:gate:repo)"

    @eq "$(module:gate:product "${root}" '')" demo
    @eq "$(module:gate:product "${root}" other)" other
    @errors 'Unknown product: nope' module:gate:product "${root}" nope
    @eq "$(module:gate:home "${root}" rust)" "${root}/engine/rust"
    @eq "$(module:gate:home "${root}" global)" "${root}"
    @eq "$(module:gate:home "${root}" tutor)" "${root}/tutor"
    @eq "$(module:gate:home "${root}" web)" "${root}/product/demo/web"
    @eq "$(module:gate:home "${root}" api other)" "${root}/product/other/api"
    @errors 'Unknown part: x' module:gate:home "${root}" x
    @eq "$(module:gate:present "${root}" | tr '\n' ' ')" 'rust infra tutor global api web '

}
test:module:gate:picks-the-chain () {

    local root=""

    root="$(fixture:module:gate:repo)"

    @eq "$(module:gate:chain "${root}/product/demo/api" api)" python
    @eq "$(module:gate:chain "${root}/product/other/api" api)" rust
    @eq "$(module:gate:chain "${root}/product/demo/web" web)" bun
    @eq "$(module:gate:chain "${root}" rust)" rust
    @errors 'No manifest for an api' module:gate:chain "${root}/tutor" api
    printf '{}' > "${root}/product/demo/api/package.json"
    rm -f -- "${root}/product/demo/api/pyproject.toml"
    @errors 'never a Bun package' module:gate:chain "${root}/product/demo/api" api

}
test:module:gate:refuses-bad-flags () {

    local root=""

    root="$(fixture:module:gate:repo)"
    git -C "${root}" init -q -b main

    CLI_VALUED=( [--part]=true [--product]=true [--type]=true [--timeout]=true )

    CLI_FLAGS=( [--part]=nope )
    TOOL_ENGINE="${root}" @errors 'Unknown part: nope' module:gate:run

    CLI_FLAGS=( [--type]=nope )
    TOOL_ENGINE="${root}" @errors 'Unknown type: nope' module:gate:run

    CLI_FLAGS=( [--timeout]=0 )
    TOOL_ENGINE="${root}" @errors '--timeout must be a positive number' module:gate:run

    CLI_FLAGS=( [--part]=web [--product]=nope )
    TOOL_ENGINE="${root}" @errors 'Unknown product: nope' module:gate:run

}
test:module:gate:runs-one-part-within-its-budget () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}/src"
    printf '' > "${root}/infra.toml"
    cat > "${root}/src/main.sh" <<'TOOL'
case "$1" in
    check) echo "checked in $(basename "$PWD") with ${GATE_SECONDS}s" ;;
    test)  exit 3 ;;
    bench) sleep 5 ;;
    fuzz)  echo "fuzz $2" ;;
esac
TOOL

    @eq "$(module:gate:one "${root}" infra '' 'check' 7 false 2>&1 | grep -c 'checked in tool with 7s')" 1
    @eq "$(module:gate:one "${root}" infra '' 'fuzz' 100 false 2>&1 | grep -c 'fuzz 9')" 1
    @errors 'gate infra failed at test' module:gate:one "${root}" infra '' 'check test' 7 false
    @contains "$(module:gate:one "${root}" infra '' 'check test' 7 true 2>&1)" 'passing as asked'
    @contains "$(module:gate:one "${root}" infra '' 'check test' 7 true 2>&1)" 'gate infra passed: check test!'
    @errors 'ran out of its 1s budget' module:gate:one "${root}" infra '' 'bench' 1 false
    @contains "$(module:gate:one "${root}" infra '' 'lint' 7 false 2>&1)" 'nothing to run'

}

test:module:gate:twins-compare-the-shared-files-of-a-product () {

    local root=""

    root="$(fixture:module:gate:repo)"
    mkdir -p "${root}/product/demo/web/src/types" "${root}/product/demo/mobile/src/types" "${root}/product/demo/desktop/src/types"
    printf 'export type A = 1;\n' > "${root}/product/demo/web/src/types/index.ts"
    printf 'export type A = 1;\n' > "${root}/product/demo/mobile/src/types/index.ts"
    cd "${root}/product/demo/web" || return

    @contains "$(module:gate:bun:twins 2>&1)" 'twins agree'
    printf 'export type A = 2;\n' > "${root}/product/demo/desktop/src/types/index.ts"
    @errors 'twins drift: src/types/index.ts differs between web and desktop' module:gate:bun:twins
    printf 'export type A = 1;\n' > "${root}/product/demo/desktop/src/types/index.ts"
    mkdir -p "${root}/product/demo/web/src/elements" "${root}/product/demo/mobile/src/elements" "${root}/product/demo/desktop/src/elements"
    printf 'dom\n' > "${root}/product/demo/web/src/elements/block.tsx"
    printf 'native\n' > "${root}/product/demo/mobile/src/elements/block.tsx"
    printf 'dom\n' > "${root}/product/demo/desktop/src/elements/block.tsx"
    @contains "$(module:gate:bun:twins 2>&1)" 'twins agree'
    printf 'drift\n' > "${root}/product/demo/desktop/src/elements/block.tsx"
    @errors 'twins drift: src/elements/block.tsx differs between web and desktop' module:gate:bun:twins
    rm -f -- "${root}/product/demo/web/src/elements/block.tsx" "${root}/product/demo/mobile/src/elements/block.tsx" "${root}/product/demo/desktop/src/elements/block.tsx"
    rm -f -- "${root}/product/demo/mobile/src/types/index.ts" "${root}/product/demo/desktop/src/types/index.ts"
    @contains "$(module:gate:bun:twins 2>&1)" 'no twin surface'
    cd "${root}/product/demo/api" || return
    @contains "$(module:gate:one "${root}" api demo 'twins' 7 false 2>&1)" 'nothing to run'

}
