module:gate:bash:lock () {

    @info "bash keeps no lock file; nothing to bring in line"

}
module:gate:bash:fetch () {

    bash src/main.sh self fetch "${GATE_ARGS[@]}"

}
module:gate:bash:check () {

    bash src/main.sh self check "${GATE_ARGS[@]}"

}
module:gate:bash:lint () {

    bash src/main.sh self lint "${GATE_ARGS[@]}"

}
module:gate:bash:test () {

    bash src/main.sh self test "${GATE_ARGS[@]}"

}
module:gate:bash:safety () {

    ! module:gate:safety:alone || return 0

    bash src/main.sh self test --shuffle

}
module:gate:bash:audit () {

    bash src/main.sh self audit

}
module:gate:bash:build () {

    local dev="${1}"

    shift

    if (( dev == 1 )); then bash src/main.sh self build --dev "$@"
    else bash src/main.sh self build "$@"
    fi

}
module:gate:bash:install () {

    shift

    bash src/main.sh self install "$@"

}
module:gate:bash:update () {

    shift

    bash src/main.sh self update "$@"

}
module:gate:bash:remove () {

    shift

    bash src/main.sh self remove "$@"

}
module:gate:bash:run () {

    local dev="${1}" bundle=""

    shift

    (( dev == 0 )) || { bash src/main.sh "$@"; return; }

    bundle="$(bash src/main.sh self build | tail -n 1)" || return

    bash "${bundle}" "$@"

}
module:gate:bash:surface () {

    bash -c "INFRA_ENTRY=library source \"\${1}\" && { compgen -A function | grep -E '^(core:|@)'; module:bundle:usage:names | sed 's/^/command /'; }" _ "${1}"

}
module:gate:bash:semver () {

    local baseline="" old="" now="" was="" version="" file=""
    local -A table=()

    baseline="$(module:gate:semver:baseline)" || return 0

    file="$(config:manifest:file "${PWD}")" || return
    core:parse:toml table "${file}" || return
    version="${table[meta.version]:-}"

    ! module:gate:semver:bumped "${baseline}" "${version}" || return 0

    old="$(module:gate:semver:tree "${baseline}")" || return

    now="$(module:gate:bash:surface "${PWD}/src/main.sh")" || return
    was="$(module:gate:bash:surface "${old}/src/main.sh")" || return

    module:gate:semver:judge "${baseline}" "$(module:gate:semver:lost "${was}" "${now}")"

}
module:gate:bash:bench () {

    bash src/main.sh self bench

}
module:gate:bash:fuzz () {

    bash src/main.sh self fuzz "$(( GATE_FUZZ / 2 ))"

}
