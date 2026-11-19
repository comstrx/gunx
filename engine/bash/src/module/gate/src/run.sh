module:gate:run () {

    local type=""

    (( $# == 0 )) || { core:error:usage "gate takes no argument; the directories go in --path"; return; }

    type="$(core:cli:value --type)" || type=default

    module:gate:each "${type}"

}
module:gate:kind () {

    local type=""

    type="$(core:cli:command)"

    GATE_KIND="${type}"
    GATE_REST=( "$@" )

    module:gate:each "${type}"

}
module:gate:each () {

    local wanted="${1}" seconds="" pass=false list="" row="" chain="" dir="" explicit=1
    local -a types=() rows=() failed=()

    ! core:cli:flag --pass || pass=true
    [[ "${wanted}" != default && "${wanted}" != all ]] || explicit=0

    seconds="$(config:settings:timeout)" || return
    list="$(module:gate:types "${wanted}")" || return
    mapfile -t types <<< "${list}"

    ! core:list:has safety "${types[@]}" || module:gate:safety:check || return

    list="$(module:gate:plan "${explicit}" "$(core:cli:value --path)" "${types[@]}")" || return
    [[ -z "${list}" ]] || mapfile -t rows <<< "${list}"

    if core:cli:flag --only-changed && (( ${#rows[@]} > 0 )); then

        list="$(module:gate:keep "${rows[@]}")" || return
        rows=()

        [[ -z "${list}" ]] || mapfile -t rows <<< "${list}"

    fi

    (( ${#rows[@]} > 0 )) || { @succ "Nothing to gate"; return 0; }

    for row in "${rows[@]}"; do

        IFS=$'\t' read -r chain dir <<< "${row}"

        module:gate:one "${chain}" "${dir}" "${types[*]}" "${seconds}" "${pass}" || failed+=( "${chain} $(module:gate:shown "${dir}")" )

    done

    (( ${#GATE_RESULTS[@]} > 0 )) || { @warn "Nothing of ${wanted} applies here"; return 0; }

    module:gate:summary

    (( ${#failed[@]} == 0 )) || { @err "A gate failed: $(core:str:join ', ' "${failed[@]}")"; return; }

}
module:gate:types () {

    local wanted="${1}" type=""
    local -a types=()

    case "${wanted}" in
        default) types=( "${GATE_DEFAULT[@]}" ) ;;
        all)
            for type in "${GATE_TYPES[@]}"; do
                core:list:has "${type}" "${GATE_WRITERS[@]}" || types+=( "${type}" )
            done
        ;;
        *)       read -r -a types <<< "${wanted//,/ }" ;;
    esac

    (( ${#types[@]} > 0 )) || types=( "${wanted}" )

    for type in "${types[@]}"; do

        core:list:has "${type}" "${GATE_TYPES[@]}" \
            || { @err "Unknown type: ${type}; one of default, all, ${GATE_TYPES[*]}"; return; }

    done

    @print "${types[@]}"

}
module:gate:fits () {

    declare -F "module:gate:${1}:${2}" >/dev/null || { @debug "no ${2} for ${1}"; return 1; }

}
module:gate:owes () {

    local chain="${1}" type="${2}"

    if core:list:has "${type}" "${GATE_GOVERNANCE[@]}"; then [[ "${chain}" == root ]]
    else [[ "${chain}" != root ]]
    fi

}
module:gate:one () {

    local chain="${1}" dir="${2}" wanted="${3}" seconds="${4}" pass="${5}" shown="" type="" state="" ran="" status=0 started=0 index=0
    local -a types=() writers=() broken=()

    [[ -d "${dir}" ]] || { @err "Not a directory: ${dir}"; return; }

    shown="$(module:gate:shown "${dir}")"

    for type in ${wanted}; do

        [[ "${type}" != "${GATE_LEAD}" ]] || continue

        if ! module:gate:fits "${chain}" "${type}"; then

            ! module:gate:owes "${chain}" "${type}" || { @err "${chain} does not support the ${type} gate"; return; }

            continue

        fi

        if core:list:has "${type}" "${GATE_WRITERS[@]}"; then writers+=( "${type}" )
        else types+=( "${type}" )
        fi

    done

    if [[ " ${wanted} " == *" ${GATE_LEAD} "* || ${#types[@]} -gt 0 ]] && module:gate:fits "${chain}" "${GATE_LEAD}"; then types=( "${GATE_LEAD}" "${types[@]}" ); fi

    types=( "${writers[@]}" "${types[@]}" )

    (( ${#types[@]} > 0 )) || { @debug "nothing of ${wanted} for ${chain} ${shown}"; return 0; }

    for (( index = 0; index < ${#types[@]}; index++ )); do

        type="${types[index]}"

        @info "gate ${chain} ${shown}:${type} (${seconds}s)"

        GATE_ARGS=()
        [[ "${type}" != "${GATE_KIND}" ]] || GATE_ARGS=( "${GATE_REST[@]}" )

        status=0
        started="${EPOCHSECONDS}"

        module:gate:budget "${dir}" "${seconds}" "module:gate:${chain}:${type}" || status=$?

        if (( status == 0 )); then

            module:gate:record "${chain}" "${shown}" "${type}" passed "${started}"
            ran+="${ran:+ }${type}"

            continue

        fi

        state=failed
        (( status != 124 )) || { state=timed-out; @warn "gate ${chain} ${shown}:${type} ran out of its ${seconds}s timeout"; }

        module:gate:record "${chain}" "${shown}" "${type}" "${state}" "${started}"

        if [[ "${pass}" == true ]]; then

            @warn "gate ${chain} ${shown}:${type} ${state} with ${status}; going on as asked"

            broken+=( "${type}" )
            continue

        fi

        for type in "${types[@]:index + 1}"; do
            module:gate:record "${chain}" "${shown}" "${type}" not-run "${EPOCHSECONDS}"
        done

        @err "gate ${chain} ${shown} failed at ${types[index]}"
        return

    done

    (( ${#broken[@]} == 0 )) || { @warn "gate ${chain} ${shown} failed at ${broken[*]}; passing as asked"; return 0; }

    @succ "gate ${chain} ${shown} passed: ${ran:-nothing to run}"

}
module:gate:record () {

    local chain="${1}" shown="${2}" type="${3}" state="${4}" started="${5}"

    GATE_RESULTS+=( "${chain}"$'\t'"${shown}"$'\t'"${type}"$'\t'"${state}"$'\t'"$(( EPOCHSECONDS - started ))" )

}
module:gate:summary () {

    local row="" chain="" shown="" type="" state="" seconds="" counts=""
    local -A tally=()

    (( ${#GATE_RESULTS[@]} > 0 )) || return 0

    core:ui:section "Gates"

    for row in "${GATE_RESULTS[@]}"; do

        IFS=$'\t' read -r chain shown type state seconds <<< "${row}"

        printf '%s\t%s\t%s\t%s\t%ss\n' "${chain}" "${shown}" "${type}" "${state}" "${seconds}"

    done | core:ui:grid

    for state in passed failed timed-out not-run; do

        for row in "${GATE_RESULTS[@]}"; do
            [[ "${row}" != *$'\t'"${state}"$'\t'* ]] || tally["${state}"]=$(( ${tally[${state}]:-0} + 1 ))
        done

        counts+="${counts:+ }${state}=${tally[${state}]:-0}"

    done

    printf '\n  %s\n' "${counts}"

    module:gate:report

}
module:gate:report () {

    local row="" chain="" shown="" type="" state="" seconds=""

    {
        printf '| Chain | Path | Gate | Result | Seconds |\n| --- | --- | --- | --- | ---: |\n'

        for row in "${GATE_RESULTS[@]}"; do
            IFS=$'\t' read -r chain shown type state seconds <<< "${row}"
            printf '| %s | %s | %s | %s | %s |\n' "${chain}" "${shown}" "${type}" "${state}" "${seconds}"
        done
    } | core:gh:summary 2>/dev/null || @warn "Cannot write the step summary"

}
module:gate:scripts () {

    local none="${1}" file="" found=0
    local -a runner=()

    shift

    while (( $# > 0 )) && [[ "${1}" != -- ]]; do
        runner+=( "${1}" )
        shift
    done

    (( $# == 0 )) || shift

    for file in "$@"; do

        [[ -f "${file}" ]] || continue

        found=1
        "${runner[@]}" "${file}" || return

    done

    (( found )) || @info "${none}"

}
module:gate:budget () {

    local home="${1}" seconds="${2}" verb="${3}"

    core:proc:timeout "${seconds}" core:proc:within "${home}" "${verb}"

}
