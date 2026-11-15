test:module:gate:parts-map-paths () {

    local mapped=""

    mapped="$(
        printf '%s\n' engine/rust/Cargo.toml engine/rust/src/hello/x.rs product/demo/web/package.json tutor/index.md .gitignore engine/go/go.work \
            | module:gate:parts | tr '\n' ' '
    )"

    @eq "${mapped}" 'engine=go engine=rust product=demo/web root=root tutor=tutor '

}
test:module:gate:names-a-tool-root () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}/src"
    @eq "$(module:gate:self "${root}" | tr '\n' ' ')" 'root '

    printf '' > "${root}/pyproject.toml"
    @eq "$(module:gate:self "${root}" | tr '\n' ' ')" 'python root '

    rm -f -- "${root}/pyproject.toml"
    printf '{"scripts":{"gate":"x"}}' > "${root}/package.json"
    @eq "$(module:gate:self "${root}" | tr '\n' ' ')" 'web root '

    printf '{}' > "${root}/package.json"
    @eq "$(module:gate:self "${root}" | tr '\n' ' ')" 'bun root '

    rm -f -- "${root}/package.json"
    printf '' > "${root}/infra.toml"
    printf '' > "${root}/src/main.sh"
    @eq "$(module:gate:self "${root}" | tr '\n' ' ')" 'infra root '

}
test:module:gate:serves-a-tool-root () {

    local root="${TMPDIR}/tool"

    mkdir -p "${root}"
    printf '' > "${root}/pyproject.toml"

    @eq "$(module:gate:projects "${root}" api)" .
    @eq "$(module:gate:fragment "${root}" api '' '' 1)" .
    @eq "$(module:gate:fragment "${root}" api '' '' 0)" ''
    @eq "$(module:gate:home "${root}" api .)" "${root}"
    @eq "$(module:gate:present "${root}" | tr '\n' ' ')" 'python root '

    rm -f -- "${root}/pyproject.toml"
    @eq "$(module:gate:projects "${root}" api)" ''

}
test:module:gate:maps-fragments-of-a-monorepo () {

    local root="${TMPDIR}/repo"

    mkdir -p "${root}/product/demo/web" "${root}/product/demo/api" "${root}/product/other/web" "${root}/product/other/api"
    printf '{}' > "${root}/product/demo/web/package.json"
    printf '' > "${root}/product/demo/api/pyproject.toml"
    printf '{}' > "${root}/product/other/web/package.json"
    printf '' > "${root}/product/other/api/Cargo.toml"

    @eq "$(module:gate:projects "${root}" web | tr '\n' ' ')" 'demo other '
    @eq "$(module:gate:projects "${root}" api | tr '\n' ' ')" 'demo other '
    @eq "$(module:gate:fragment "${root}" web 'demo/web' '' | tr '\n' ' ')" 'demo '
    @eq "$(module:gate:fragment "${root}" web '' 'bun' | tr '\n' ' ')" 'demo other '
    @eq "$(module:gate:fragment "${root}" api '' 'python' | tr '\n' ' ')" 'demo '
    @eq "$(module:gate:fragment "${root}" api '' 'rust' | tr '\n' ' ')" 'other '
    @eq "$(module:gate:fragment "${root}" api '' 'go' | tr '\n' ' ')" ''
    @eq "$(module:gate:fragment "${root}" api 'other/api' 'python' | tr '\n' ' ')" 'demo other '
    @eq "$(module:gate:fragment "${root}" web '' 'infra' | tr '\n' ' ')" 'demo other '
    @eq "$(module:gate:engine "${root}/product/other/api")" rust
    @eq "$(module:gate:engine "${root}/product/demo/web")" bun
    @fails module:gate:engine "${root}/product"

}
