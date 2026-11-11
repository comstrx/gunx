declare -ga GATE_TYPES=( deps check lint test safety audit quality security twins bench fuzz )
declare -ga GATE_DEFAULT=( deps check lint test safety audit quality security twins )
declare -ga GATE_ENGINE_ONLY=( audit fuzz )
declare -ga GATE_FRAGMENT_ONLY=( twins )

module:gate:run () {

    local root=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    module:gate:since "${root}" ""

}
module:gate:ci () {

    local root="" base=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    base="$(module:gate:base "${root}")" || return

    module:gate:since "${root}" "${base}"

}
module:gate:since () {

    local root="${1}" base="${2:-}" show="${3:-}" paths="" selected=""
    local -a targets=()

    [[ -z "${base}" ]] || paths="$(core:git:changed "${root}" "${base}")" || return

    selected="$(module:gate:select "${root}" "${base}" "${paths}")" || return
    [[ -z "${selected}" ]] || mapfile -t targets <<< "${selected}"

    if [[ -n "${show}" ]]; then module:gate:view "${root}" "${base}" "${paths}" "${targets[@]}"
    else module:gate:each "${root}" "${base}" "${targets[@]}"
    fi

}
module:gate:each () {

    local root="${1}" base="${2:-}" type="" seconds="" pass=false list="" target="" part="" product=""
    local -a types=() failed=()

    shift 2

    type="$(core:cli:value --type)" || type=default
    seconds="$(core:cli:value --timeout)" || seconds=1800

    ! core:cli:flag --pass || pass=true

    seconds="$(core:process:seconds "${seconds}" --timeout)" || return
    list="$(module:gate:types "${type}")" || return
    mapfile -t types <<< "${list}"

    (( $# > 0 )) || { module:gate:idle "${root}" "${base}"; return 0; }

    @info "gates of $(core:str:join ', ' "$@")${base:+, changed since ${base}}"

    for target in "$@"; do

        read -r part product <<< "${target}"

        module:gate:one "${root}" "${part}" "${product}" "${types[*]}" "${seconds}" "${pass}" || failed+=( "${target}" )

    done

    (( ${#failed[@]} == 0 )) || { @err "A gate failed: $(core:str:join ', ' "${failed[@]}")"; return; }

}
module:gate:idle () {

    local root="${1}" base="${2:-}" part=""

    part="$(core:cli:value --part)" || part=""

    if [[ -n "${base}" ]]; then @succ "Nothing changed since ${base}${part:+ in ${part}}"
    else @warn "Nothing to gate under ${root}${part:+ as ${part}}"
    fi

}
module:gate:types () {

    local wanted="${1}" type=""
    local -a types=()

    case "${wanted}" in
        default) types=( "${GATE_DEFAULT[@]}" ) ;;
        all)     types=( "${GATE_TYPES[@]}" ) ;;
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

    local part="${1}" chain="${2}" type="${3}"

    declare -F "module:gate:${chain}:${type}" >/dev/null || { @debug "no ${type} for ${part}"; return 1; }

    if core:list:has "${part}" "${GATE_FRAGMENTS[@]}"; then
        ! core:list:has "${type}" "${GATE_ENGINE_ONLY[@]}" || { @debug "${type} belongs to the engines; ${part} skips it"; return 1; }
    else
        ! core:list:has "${type}" "${GATE_FRAGMENT_ONLY[@]}" || { @debug "${type} belongs to the fragments; ${part} skips it"; return 1; }
    fi

}
module:gate:one () {

    local root="${1}" part="${2}" product="${3}" wanted="${4}" seconds="${5}" pass="${6}" home="" chain="" type="" status=0 ran=""
    local -a types=()

    home="$(module:gate:home "${root}" "${part}" "${product}")" || return
    [[ -d "${home}" ]] || { @err "Not a directory: ${home}"; return; }

    chain="$(module:gate:chain "${home}" "${part}")" || return

    for type in ${wanted}; do
        ! module:gate:fits "${part}" "${chain}" "${type}" || types+=( "${type}" )
    done

    [[ "${types[*]}" != deps || "${wanted}" == deps ]] || { @debug "deps alone prepares nothing; ${part} skips it"; types=(); }

    for type in "${types[@]}"; do

        @info "gate ${part}:${type} in ${home} (${seconds}s)"

        status=0
        module:gate:budget "${home}" "${seconds}" "module:gate:${chain}:${type}" || status=$?

        if (( status == 0 )); then ran+="${ran:+ }${type}"; continue; fi

        (( status != 124 )) || @warn "gate ${part}:${type} ran out of its ${seconds}s budget"

        if [[ "${pass}" == true ]]; then

            @warn "gate ${part}:${type} failed with ${status}; passing as asked"

            ran+="${ran:+ }${type}!"
            continue

        fi

        @err "gate ${part} failed at ${type}"
        return

    done

    @succ "gate ${part} passed: ${ran:-nothing to run}"

}
module:gate:budget () {

    local home="${1}" seconds="${2}" verb="${3}" pid=0 status=0

    ( cd -- "${home}" && GATE_SECONDS="${seconds}" "${verb}" ) &
    pid=$!

    core:process:wait "${pid}" "${seconds}" 2>/dev/null \
        || { core:process:stop "${pid}" 5; return 124; }

    wait "${pid}" || status=$?

    return "${status}"

}
