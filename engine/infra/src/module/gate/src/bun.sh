declare -ga GATE_TWINS=(
    src/types/index.ts
    src/specs/deployment.ts
    src/specs/surface.ts
    src/specs/runtime.ts
    src/stores/box.ts
    src/stores/preferences.ts
    src/hooks/use-path.ts
    src/hooks/use-preferences.ts
    src/hooks/use-session.ts
    src/styles/tokens.ts
    src/styles/theme.ts
    src/elements/contract.ts
    src/components/confirm.tsx
    src/components/denied.tsx
    src/app/nav.tsx
    src/app/screen.tsx
    tools/analyze.ts
    tools/compile.ts
    tools/rules.ts
    tests/architecture.test.ts
    tests/spec.test.ts
    tests/states.test.tsx
    tests/stores.test.ts
)
declare -ga GATE_TWINS_DOM=(
    src/elements/block.tsx
    src/elements/button.tsx
    src/elements/dialog.tsx
    src/elements/heading.tsx
    src/elements/link.tsx
    src/elements/skeleton.tsx
    src/elements/text.tsx
    src/elements/title.tsx
    tests/components.test.tsx
    tests/elements.test.tsx
)

module:gate:bun:script () {

    bun -e "process.exit(require('./package.json').scripts?.['${1}'] ? 0 : 1)" 2>/dev/null

}
module:gate:bun:deps () {

    if module:gate:bun:script deps; then core:process:io bun run deps || return
    else core:process:io bun install --frozen-lockfile || return
    fi

    module:gate:bun:script link || return 0

    bun run link

}
module:gate:bun:check () {

    if module:gate:bun:script check; then bun run check || return
    else bunx tsc -p . || return
    fi

    module:gate:bun:script build || return 0

    bun run build

}
module:gate:bun:lint () {

    module:gate:bun:script lint && { bun run lint; return; }

    bunx biome ci .

}
module:gate:bun:test () {

    module:gate:bun:script test && { bun run test; return; }

    [[ -d tests ]] || { @info "no tests"; return 0; }

    bun test ./tests

}
module:gate:bun:safety () {

    [[ -d tests ]] || { @info "no tests"; return 0; }

    bun --smol test ./tests

}
module:gate:bun:audit () {

    module:gate:bun:script audit && { bun run audit; return; }

    bun audit --audit-level=low

}
module:gate:bun:bench () {

    local file="" found=0

    for file in benches/*.bench.ts benches/*.bench.tsx; do

        [[ -f "${file}" ]] || continue

        found=1
        bun run "${file}" || return

    done

    (( found )) || @info "no benches"

}
module:gate:bun:fuzz () {

    [[ -d fuzz ]] || { @info "no fuzz targets"; return 0; }

    bun test ./fuzz

}
module:gate:bun:twins () {

    local product="${PWD%/*}" entry="" part="" path="" digest="" first="" where="" drift=0 compared=0
    local -a parts=()

    for entry in "${GATE_TWINS[@]/#/web mobile desktop:}" "${GATE_TWINS_DOM[@]/#/web desktop:}"; do

        path="${entry#*:}"
        first=""
        where=""

        read -ra parts <<< "${entry%%:*}"

        for part in "${parts[@]}"; do

            [[ -f "${product}/${part}/${path}" ]] || continue

            digest="$(core:fs:file:hash "${product}/${part}/${path}")" || return

            if [[ -z "${first}" ]]; then

                first="${digest}"
                where="${part}"
                continue

            fi

            compared=1

            [[ "${digest}" == "${first}" ]] || { @warn "twins drift: ${path} differs between ${where} and ${part}"; drift=1; }

        done

    done

    (( compared )) || { @info "no twin surface beside ${PWD##*/}"; return 0; }
    (( drift == 0 )) || { @err "twins drift: the shared files of the surfaces differ"; return; }

    @info "twins agree on ${#GATE_TWINS[@]} shared files and ${#GATE_TWINS_DOM[@]} dom files"

}
