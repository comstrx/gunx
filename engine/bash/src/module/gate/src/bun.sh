module:gate:bun:script () {

    bun -e "process.exit(require('./package.json').scripts?.['${1}'] ? 0 : 1)" 2>/dev/null

}
module:gate:bun:prefer () {

    local name="${1}"

    shift

    if module:gate:bun:script "${name}"; then bun run "${name}" "${GATE_ARGS[@]}"
    else "$@" "${GATE_ARGS[@]}"
    fi

}
module:gate:bun:suite () {

    local folder="${1}"

    shift

    [[ -d "${folder}" ]] || { @info "no ${folder}"; return 0; }

    bun "$@" test "./${folder}"

}
module:gate:bun:deps () {

    core:proc:io module:gate:bun:prefer deps bun install || return

    module:gate:bun:script link || return 0

    bun run link

}
module:gate:bun:check () {

    module:gate:bun:prefer check bunx tsc -p . || return

    module:gate:bun:script build || return 0

    bun run build

}
module:gate:bun:lint () {

    module:gate:bun:prefer lint bunx biome ci .

}
module:gate:bun:test () {

    module:gate:bun:prefer test module:gate:bun:suite tests

}
module:gate:bun:safety () {

    ! module:gate:safety:alone || return 0

    module:gate:bun:suite tests --smol

}
module:gate:bun:audit () {

    module:gate:bun:prefer audit bun audit --audit-level=low

}
module:gate:bun:surface () {

    bun -e '
        const door = require("./src/engine/package.json");
        for ( const [path, target] of Object.entries(door.exports ?? {}) ) {
            const file = typeof target === "string" ? target : target.default;
            for ( const name of Object.keys(await import("./src/engine/" + file)) ) console.log(path + " " + name);
        }
    '

}
module:gate:bun:semver () {

    local baseline="" old="" now="" was=""

    [[ -f src/engine/package.json ]] || { @info "semver: no engine door; skipped"; return 0; }

    baseline="$(module:gate:semver:baseline)" || return 0
    ! module:gate:semver:bumped "${baseline}" "$(bun -e "console.log(require('./package.json').version ?? '')")" || return 0

    old="$(module:gate:semver:tree "${baseline}")" || return

    core:proc:within "${old}" core:proc:io bun install --silent || return

    now="$(module:gate:bun:surface)" || return
    was="$(core:proc:within "${old}" module:gate:bun:surface)" || return

    module:gate:semver:judge "${baseline}" "$(module:gate:semver:lost "${was}" "${now}")"

}
module:gate:bun:build () {

    local dev="${1}" mode=production
    local -a flags=( --minify )

    shift

    (( dev == 0 )) || { mode=development; flags=(); }

    if (( dev == 1 )) && module:gate:bun:script build:dev; then bun run build:dev "$@"
    elif module:gate:bun:script build; then NODE_ENV="${mode}" bun run build "$@"
    elif (( $# > 0 )); then NODE_ENV="${mode}" bun build "${flags[@]}" "$@"
    else @err "bun: no build script in package.json; pass the entry for bun build"; return
    fi

}
module:gate:bun:run () {

    local dev="${1}"

    shift

    if (( dev == 1 )) && module:gate:bun:script dev; then bun run dev "$@"
    elif (( dev == 0 )) && module:gate:bun:script start; then NODE_ENV=production bun run start "$@"
    elif (( $# > 0 )); then bun run "$@"
    else @err "bun: no $( (( dev == 1 )) && printf dev || printf start ) script in package.json; pass what to run"; return
    fi

}
module:gate:bun:bench () {

    module:gate:scripts "no benches" bun run -- benches/*.bench.ts benches/*.bench.tsx

}
module:gate:bun:fuzz () {

    module:gate:bun:suite fuzz

}
