module:extract:gates () {

    local tree="${1}" name="${2}" types="${3}" seconds="" row="" chain="" dir="" failed=0
    local -a rows=()

    seconds="$(config:settings:timeout)" || return

    mapfile -t rows < <(module:gate:within "${tree}")

    @info "${types// /, } of ${name} in ${tree}, ${seconds}s each"

    GATE_RESULTS=()

    for row in "${rows[@]}"; do

        IFS=$'\t' read -r chain dir <<< "${row}"

        module:gate:one "${chain}" "${dir}" "${types}" "${seconds}" false || failed=1

    done

    module:gate:summary

    (( failed == 0 ))

}
module:extract:lock () {

    module:extract:gates "${1}" "${2}" "${GATE_WRITERS[*]}" \
        || { @err "the lock files of ${2} could not be brought in line with its manifests"; return; }

}
module:extract:gate () {

    module:extract:gates "${1}" "${2}" "${GATE_DEFAULT[*]}" \
        || { @err "gates failed for ${2}"; return; }

}
