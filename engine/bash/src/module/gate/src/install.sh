module:gate:install:rust () {

    local tool=""

    core:install:rustup stable || return
    core:install:rustup "nightly-$(config:tools:get rust nightly)" miri rust-src || return
    core:install:cargo cargo-binstall || return

    for tool in "${GATE_CARGO[@]}"; do
        core:install:cargo "${tool}" || return
    done

}
module:gate:install:go () {

    core:install:go github.com/golangci/golangci-lint/v2/cmd/golangci-lint "v$(config:tools:version golangci)" || return
    core:install:go golang.org/x/vuln/cmd/govulncheck "v$(config:tools:version govulncheck)" || return
    core:install:go golang.org/x/exp/cmd/apidiff "v$(config:tools:version apidiff)"

}
module:gate:install:root () {

    local tool=""
    local -a tools=()

    for tool in "${GATE_SECURITY[@]}" "${GATE_QUALITY[@]}"; do
        [[ "${tool}" == prettier ]] || ! module:gate:root:has "${tool}" || tools+=( "${tool}" )
    done

    (( ${#tools[@]} == 0 )) || @fetch "${tools[@]}"

}
