module:gate:bun:deps () {

    core:process:io bun install --frozen-lockfile

}
module:gate:bun:check () {

    bunx tsc -p .

}
module:gate:bun:lint () {

    bunx biome ci .

}
module:gate:bun:test () {

    [[ -d tests ]] || { @info "no tests"; return 0; }

    bun test tests

}
module:gate:bun:safety () {

    [[ -d tests ]] || { @info "no tests"; return 0; }

    bun --smol test tests

}
module:gate:bun:audit () {

    bun audit --audit-level=low

}
module:gate:bun:bench () {

    local file=""

    for file in benches/*.bench.ts; do

        [[ -f "${file}" ]] || { @info "no benches"; return 0; }

        bun run "${file}" || return

    done

}
module:gate:bun:fuzz () {

    [[ -d fuzz ]] || { @info "no fuzz targets"; return 0; }

    bun test fuzz

}
