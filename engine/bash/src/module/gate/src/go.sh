module:gate:go:modules () {

    local -n _modules="${1}"
    local list=""

    list="$(go list -m -f '{{.Dir}}')" || { @err "go cannot list the workspace modules"; return; }

    mapfile -t _modules <<< "${list}"

}
module:gate:go:deps () {

    local module=""
    local -a modules=()

    module:gate:install:go || return

    module:gate:go:modules modules || return

    for module in "${modules[@]}"; do
        core:proc:within "${module}" core:proc:io go mod download "${GATE_ARGS[@]}" || return
    done

}
module:gate:go:check () {

    local module=""
    local -a modules=()

    module:gate:go:modules modules || return

    for module in "${modules[@]}"; do
        core:proc:within "${module}" go mod tidy -diff || return
    done

    go vet "${GATE_ARGS[@]}" "${modules[@]/%//...}"

}
module:gate:go:lint () {

    local -a modules=()

    module:gate:go:modules modules || return

    golangci-lint run "${GATE_ARGS[@]}" "${modules[@]/%//...}"

}
module:gate:go:test () {

    local -a modules=()

    module:gate:go:modules modules || return

    go test -race -shuffle=on -count=1 "${GATE_ARGS[@]}" "${modules[@]/%//...}"

}
module:gate:go:safety () {

    local list="" name="" kind=""
    local -a modules=()

    list="$(module:gate:safety:kinds)" || return
    module:gate:go:modules modules || return

    while read -r name kind; do

        if [[ "${name}" == sanitizer ]]; then module:gate:go:sanitize "${kind}" "${modules[@]}" || return
        else @info "${name}: rust only; skipped"
        fi

    done <<< "${list}"

}
module:gate:go:sanitize () {

    local kind="${1}" flag="" compiler=""

    shift

    case "${kind}" in
        address) flag=-asan ;;
        memory)  flag=-msan; compiler=clang ;;
        thread)  flag=-race ;;
        *)       @info "${kind} sanitizer: rust only; skipped"; return 0 ;;
    esac

    [[ "${kind}" == thread || "$(core:sys:os)" == linux ]] || { @info "${kind} sanitizer: linux only; skipped"; return 0; }

    if [[ -n "${compiler}" ]]; then core:sys:has "${compiler}" || { @info "${kind} sanitizer: needs ${compiler}; skipped"; return 0; }
    elif [[ "${kind}" != thread ]]; then

        if core:sys:has gcc; then compiler=gcc
        elif core:sys:has clang; then compiler=clang
        else @info "${kind} sanitizer: no C compiler; skipped"; return 0
        fi

    fi

    CGO_ENABLED=1 CC="${compiler:-${CC:-cc}}" go test "${flag}" -count=1 "${@/%//...}"

}
module:gate:go:audit () {

    local module=""
    local -a modules=()

    module:gate:go:modules modules || return

    for module in "${modules[@]}"; do
        govulncheck -C "${module}" ./... || return
    done

}
module:gate:go:semver () {

    local baseline="" old="" module="" relative="" path="" export="" found="" report=""
    local -a modules=()

    baseline="$(module:gate:semver:baseline)" || return 0
    ! module:gate:semver:bumped "${baseline}" "$(core:git:release .)" || return 0

    old="$(module:gate:semver:tree "${baseline}")" || return
    export="$(core:fs:temp:file)" || return

    module:gate:go:modules modules || return

    for module in "${modules[@]}"; do

        relative="${module#"${PWD}/"}"

        [[ "${relative}" == src/* && -f "${old}/${relative}/go.mod" ]] || continue

        path="$(core:proc:within "${module}" go list -m)" || return

        core:proc:within "${old}/${relative}" apidiff -m -w "${export}" "${path}" || return
        found="$(core:proc:within "${module}" apidiff -m -incompatible "${export}" "${path}")" || return

        [[ -z "${found}" ]] || report+="${found}"$'\n'

    done

    module:gate:semver:judge "${baseline}" "${report}"

}
module:gate:go:build () {

    local dev="${1}"
    local -a modules=() flags=()

    shift

    (( dev == 1 )) || flags=( -trimpath '-ldflags=-s -w' )

    (( $# == 0 )) || { go build "${flags[@]}" "$@"; return; }

    module:gate:go:modules modules || return

    go build "${flags[@]}" "${modules[@]/%//...}"

}
module:gate:go:run () {

    local dev="${1}"
    local -a flags=()

    shift

    (( dev == 1 )) || flags=( -trimpath )

    go run "${flags[@]}" "${@:-.}"

}
module:gate:go:bench () {

    local -a modules=()

    module:gate:go:modules modules || return

    go test -run '^$' -bench . -benchmem "${modules[@]/%//...}"

}
module:gate:go:fuzz () {

    local module="" target="" found=0
    local -a modules=() targets=()

    module:gate:go:modules modules || return

    for module in "${modules[@]}"; do

        mapfile -t targets < <(core:proc:within "${module}" go test -list 'Fuzz.*' ./... 2>/dev/null | grep '^Fuzz')

        for target in "${targets[@]}"; do

            found=1
            core:proc:within "${module}" go test -run '^$' -fuzz "^${target}\$" -fuzztime "${GATE_FUZZ}s" ./... || return

        done

    done

    (( found )) || @info "no fuzz"

}
