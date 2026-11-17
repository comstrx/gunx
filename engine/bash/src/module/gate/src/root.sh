module:gate:root:has () {

    case "${1}" in
        gitleaks) [[ -f .gitleaks.toml ]] ;;
        trivy)    [[ -f .trivy.yml ]] ;;
        syft)     [[ -f .syft.yml ]] ;;
        zizmor)   [[ -d .github/workflows ]] ;;
        typos)    [[ -f .typos.toml || -f typos.toml || -f _typos.toml ]] ;;
        taplo)    [[ -f .taplo.toml || -f taplo.toml ]] ;;
        prettier) compgen -G '.prettierrc*' >/dev/null ;;
        *)        return 1 ;;
    esac

}
module:gate:root:run () {

    local sbom=""
    local -a zizmor=( --offline --persona pedantic --min-severity low )

    case "${1}" in
        gitleaks) @tool gitleaks dir . --config .gitleaks.toml --redact --no-banner --exit-code 1 ;;
        trivy)    @tool trivy fs . --config .trivy.yml --exit-code 1 ;;
        syft)
            sbom="$(config:paths:sbom)" || return
            core:fs:dir:new "${sbom%/*}" 755 || return
            @tool syft scan dir:. --config .syft.yml --output "spdx-json=${sbom}" --quiet || return
            @info "sbom written to ${sbom}"
        ;;
        zizmor)
            [[ ! -f .zizmor.yml ]] || zizmor+=( --config .zizmor.yml )
            @tool zizmor "${zizmor[@]}" .github/workflows/
        ;;
        typos)    @tool typos . ;;
        taplo)    @tool taplo fmt --check && @tool taplo lint ;;
        prettier) @tool prettier --ignore-path .gitignore --no-error-on-unmatched-pattern --check '**/*.{md,mdx,yml,yaml,json,jsonc}' ;;
    esac

}
module:gate:root:each () {

    local tool="" ran=0

    for tool in "$@"; do

        module:gate:root:has "${tool}" || continue

        ran=1
        module:gate:root:run "${tool}" || return

    done

    (( ran )) || @info "no configuration for ${*}"

}
module:gate:root:deps () {

    module:gate:install:root

}
module:gate:root:security () {

    module:gate:root:each "${GATE_SECURITY[@]}"

}
module:gate:root:quality () {

    module:gate:root:each "${GATE_QUALITY[@]}"

}
