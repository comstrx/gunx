module:extract:gate () {

    local tree="${1}" name="${2}" kind="" part="" seconds="" failed=0
    local -a parts=()

    kind="$(module:extract:kind "${name}")" || return
    seconds="$(module:extract:timeout)" || return

    if [[ "${kind}" == product ]]; then mapfile -t parts < <(module:gate:present "${tree}")
    else part="$(module:extract:gatename "${kind}" "$(module:extract:part "${name}")")" || return; parts=( "${part}" )
    fi

    @info "gates of ${parts[*]} in ${tree}, ${seconds}s budget each"

    for part in "${parts[@]}"; do
        module:gate:one "${tree}" "${part}" . "${GATE_DEFAULT[*]}" "${seconds}" false || failed=1
    done

    (( failed == 0 )) || { @err "gates failed for ${name}"; return; }

}
