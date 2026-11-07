module:gate:go:modules () {

    go list -m -f '{{.Dir}}'

}
module:gate:go:deps () {

    local module=""

    core:process:io go install "github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v$(config:tools:version golangci)" || return
    core:process:io go install "golang.org/x/vuln/cmd/govulncheck@v$(config:tools:version govulncheck)" || return

    for module in $(module:gate:go:modules); do
        ( cd -- "${module}" && core:process:io go mod download ) || return
    done

}
module:gate:go:check () {

    local module=""
    local -a modules=()

    mapfile -t modules < <(module:gate:go:modules)

    for module in "${modules[@]}"; do
        ( cd -- "${module}" && go mod tidy -diff ) || return
    done

    go vet "${modules[@]/%//...}"

}
module:gate:go:lint () {

    local -a modules=()

    mapfile -t modules < <(module:gate:go:modules)

    golangci-lint run "${modules[@]/%//...}"

}
module:gate:go:test () {

    local -a modules=()

    mapfile -t modules < <(module:gate:go:modules)

    go test -race -shuffle=on -count=1 "${modules[@]/%//...}"

}
module:gate:go:safety () {

    local -a modules=()

    [[ "$(core:sys:os)" == linux ]] || { @info "asan: linux only; skipped"; return 0; }
    core:sys:has gcc || core:sys:has clang || { @info "asan: no C compiler; skipped"; return 0; }

    mapfile -t modules < <(module:gate:go:modules)

    CGO_ENABLED=1 go test -asan -count=1 "${modules[@]/%//...}"

}
module:gate:go:audit () {

    local module=""

    for module in $(module:gate:go:modules); do
        govulncheck -C "${module}" ./... || return
    done

}
module:gate:go:bench () {

    local -a modules=()

    mapfile -t modules < <(module:gate:go:modules)

    go test -run '^$' -bench . -benchmem "${modules[@]/%//...}"

}
module:gate:go:fuzz () {

    local module="" target="" share=0
    local -a targets=()

    for module in $(module:gate:go:modules); do

        mapfile -t targets < <(cd -- "${module}" && go test -list 'Fuzz.*' ./... 2>/dev/null | grep '^Fuzz')

        (( ${#targets[@]} > 0 )) || continue

        share=$(( GATE_SECONDS * 9 / 10 / ${#targets[@]} ))

        for target in "${targets[@]}"; do

            ( cd -- "${module}" && go test -run '^$' -fuzz "^${target}\$" -fuzztime "${share}s" ./... ) || return

        done

    done

}
