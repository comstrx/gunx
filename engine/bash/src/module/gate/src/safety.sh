declare -ga GATE_MIRI=( stacked tree )
declare -ga GATE_SANITIZERS=( address thread memory leak )

module:gate:safety:picked () {

    [[ "$(core:cli:command)" == safety ]] && core:cli:given --type

}
module:gate:safety:kinds () {

    local list="sanitizer" item="" name="" kind=""
    local -a items=()

    ! module:gate:safety:picked || list="$(core:cli:value --type)" || list=""

    core:str:split items "${list//[[:space:]]/}" ,

    for item in "${items[@]}"; do

        [[ -n "${item}" ]] || continue

        name="${item%%:*}"
        kind=""
        [[ "${item}" != *:* ]] || kind="${item#*:}"

        case "${name}" in
            sanitizer)
                kind="${kind:-address}"
                core:list:has "${kind}" "${GATE_SANITIZERS[@]}" || { @err "A sanitizer is one of ${GATE_SANITIZERS[*]}: ${kind}"; return; }
            ;;
            miri)
                kind="${kind:-stacked}"
                core:list:has "${kind}" "${GATE_MIRI[@]}" || { @err "A miri mode is one of ${GATE_MIRI[*]}: ${kind}"; return; }
            ;;
            udeps)
                [[ -z "${kind}" ]] || { @err "udeps has no kind: ${item}"; return; }
            ;;
            *)
                @err "Unknown safety type: ${name}; one of sanitizer, miri, udeps"
                return
            ;;
        esac

        @print "${name} ${kind}"

    done

}
module:gate:safety:check () {

    module:gate:safety:kinds >/dev/null

}
module:gate:safety:alone () {

    module:gate:safety:picked || return 1

    @info "safety: --type picks the sanitizer, miri and udeps checks of rust and go; skipped"

}
