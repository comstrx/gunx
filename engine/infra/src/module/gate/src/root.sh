module:gate:prettier () {

    core:process:timeout "${CONFIG[RUN_TIMEOUT]:-300}" bunx "prettier@$(config:tools:version prettier)" "$@"

}
module:gate:tutor:deps () {

    @fetch typos

}
module:gate:tutor:quality () {

    @tool typos . && module:gate:prettier --check '**/*.md'

}
module:gate:global:deps () {

    @fetch gitleaks trivy syft zizmor typos taplo

}
module:gate:global:security () {

    local sbom=""

    sbom="$(config:paths:sbom)" || return

    @tool gitleaks dir . --config .gitleaks.toml --redact --no-banner --exit-code 1 || return
    @tool trivy fs . --config .trivy.yml --exit-code 1 || return

    core:fs:dir:new "${sbom%/*}" 755 || return

    @tool syft scan dir:. --config .syft.yml --output "spdx-json=${sbom}" --quiet || return

    [[ ! -d .github/workflows ]] \
        || @tool zizmor --offline --persona pedantic --min-severity low --config .zizmor.yml .github/workflows/ || return

    @info "sbom written to ${sbom}"

}
module:gate:global:quality () {

    @tool typos . \
        && @tool taplo fmt --check \
        && @tool taplo lint \
        && module:gate:prettier --config .prettierrc.yml \
            --ignore-path .gitignore --no-error-on-unmatched-pattern --check '**/*.{md,mdx,yml,yaml,json,jsonc}'

}
