declare -ga GATE_PARTS=( rust python go bun infra api web mobile desktop tutor global )
declare -ga GATE_TYPES=( deps check lint test safety audit quality security bench fuzz )
declare -ga GATE_DEFAULT=( deps check lint test safety audit quality security )

module:gate:run () {

    local root="" part="" product="" type="" seconds="" pass=false failed=0
    local -a parts=() types=()

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    part="$(core:cli:value --part)" || part=""
    product="$(core:cli:value --product)" || product=""
    type="$(core:cli:value --type)" || type=default
    seconds="$(core:cli:value --timeout)" || seconds=1800

    ! core:cli:flag --pass || pass=true

    seconds="$(core:process:seconds "${seconds}" --timeout)" || return
    mapfile -t types < <(module:gate:types "${type}") || return
    (( ${#types[@]} > 0 )) || return 1

    if [[ -n "${part}" ]]; then
        core:list:has "${part}" "${GATE_PARTS[@]}" || { @err "Unknown part: ${part}; one of ${GATE_PARTS[*]}"; return; }
        parts=( "${part}" )
    else
        mapfile -t parts < <(module:gate:present "${root}")
    fi

    (( ${#parts[@]} > 0 )) || { @err "Nothing to gate under ${root}"; return; }

    for part in "${parts[@]}"; do
        module:gate:one "${root}" "${part}" "${product}" "${types[*]}" "${seconds}" "${pass}" || failed=1
    done

    (( failed == 0 )) || { @err "A gate failed"; return; }

}
module:gate:types () {

    local wanted="${1}" type=""

    case "${wanted}" in
        default)
            printf '%s\n' "${GATE_DEFAULT[@]}"
        ;;
        all)
            printf '%s\n' "${GATE_TYPES[@]}"
        ;;
        *)
            for type in ${wanted//,/ }; do

                core:list:has "${type}" "${GATE_TYPES[@]}" \
                    || { @err "Unknown type: ${type}; one of default, all, ${GATE_TYPES[*]}"; return; }

                @print "${type}"

            done
        ;;
    esac

}
module:gate:present () {

    local root="${1}" part="" product=""

    if [[ ! -d "${root}/engine" && ! -d "${root}/product" ]]; then module:gate:self "${root}"; return 0; fi

    for part in rust python go bun infra; do
        [[ ! -d "${root}/engine/${part}" ]] || @print "${part}"
    done

    [[ ! -d "${root}/tutor" ]] || @print tutor

    @print global

    product="$(module:gate:product "${root}" "")" || return 0

    for part in api web mobile desktop; do
        [[ ! -d "${root}/product/${product}/${part}" ]] || @print "${part}"
    done

}
module:gate:product () {

    local root="${1}" wanted="${2:-}" directory=""

    if [[ -n "${wanted}" ]]; then

        [[ "${wanted}" == . || -d "${root}/product/${wanted}" ]] \
            || { @err "Unknown product: ${wanted}; see ${root}/product"; return; }

        @print "${wanted}"
        return 0

    fi

    for directory in "${root}"/product/*/; do

        [[ -d "${directory}" ]] || continue
        directory="${directory%/}"

        @print "${directory##*/}"
        return 0

    done

    [[ -d "${root}/product" ]] && { @err "No product under ${root}/product"; return; }

    @print .

}
module:gate:home () {

    local root="${1}" part="${2}" product="${3:-}" home="${1}"

    case "${part}" in
        rust|python|go|bun|infra)
            home="${root}/engine/${part}"
        ;;
        tutor)
            home="${root}/tutor"
        ;;
        global)
            home="${root}"
        ;;
        api|web|mobile|desktop)
            product="$(module:gate:product "${root}" "${product}")" || return
            [[ "${product}" == . ]] || home="${root}/product/${product}/${part}"
        ;;
        *)
            @err "Unknown part: ${part}"
            return
        ;;
    esac

    [[ -d "${home}" ]] || home="${root}"

    @print "${home}"

}
module:gate:chain () {

    local home="${1}" part="${2}" engine=""

    case "${part}" in
        api)
            engine="$(module:gate:engine "${home}")" || { @err "No manifest for an api under ${home}"; return; }
            [[ "${engine}" != bun ]] || { @err "An api is never a Bun package: ${home}"; return; }

            @print "${engine}"
        ;;
        web|mobile|desktop)
            @print bun
        ;;
        *)
            @print "${part}"
        ;;
    esac

}
module:gate:one () {

    local root="${1}" part="${2}" product="${3}" wanted="${4}" seconds="${5}" pass="${6}" home="" chain="" type="" verb="" status=0 ran=""

    home="$(module:gate:home "${root}" "${part}" "${product}")" || return
    [[ -d "${home}" ]] || { @err "Not a directory: ${home}"; return; }

    chain="$(module:gate:chain "${home}" "${part}")" || return

    for type in ${wanted}; do

        verb="module:gate:${chain}:${type}"
        declare -F "${verb}" >/dev/null || { @debug "no ${type} for ${part}"; continue; }

        @info "gate ${part}:${type} in ${home} (${seconds}s)"

        status=0
        module:gate:budget "${home}" "${seconds}" "${verb}" || status=$?

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
