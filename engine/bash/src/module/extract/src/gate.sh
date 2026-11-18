module:extract:gate () {

    local tree="${1}" name="${2}" seconds="" row="" chain="" dir="" failed=0
    local -a rows=()

    seconds="$(module:extract:timeout)" || return

    mapfile -t rows < <(module:gate:within "${tree}")

    @info "gates of ${name} in ${tree}, ${seconds}s each"

    GATE_RESULTS=()

    for row in "${rows[@]}"; do

        IFS=$'\t' read -r chain dir <<< "${row}"
        module:gate:one "${chain}" "${dir}" "${GATE_DEFAULT[*]}" "${seconds}" false || failed=1

    done

    module:gate:summary

    (( failed == 0 )) || { @err "gates failed for ${name}"; return; }

}
