declare -gA LOAD_STATE=() LOAD_INDEX=()
declare -g LOAD_PATH=""

core:load:use () {

    local name="${1:-}" path="" status=0

    [[ -n "${name}" && "${name}" != *[!a-z0-9_:-]* && "${name}" != :* && "${name}" != *: && "${name}" != *:::* && "${name}" != *[!:]:[!:]* ]] \
        || { printf '%s\n' "[-] Invalid module name: ${name}" >&2; return 1; }

    core:load:resolve "${name//::/\/}" || return
    path="${LOAD_PATH}"

    case "${LOAD_STATE[${path}]:-}" in
        loaded)  return 0 ;;
        loading) printf '%s\n' "[-] Source cycle: ${name}" >&2; return 1 ;;
    esac

    LOAD_STATE["${path}"]=loading

    if declare -F bundle:source >/dev/null; then bundle:source "${path}" || status=$?
    else source "${TOOL_SOURCE}/${path}" || status=$?
    fi

    if (( status == 0 )); then LOAD_STATE["${path}"]=loaded
    else unset "LOAD_STATE[${path}]"
    fi

    return "${status}"

}
core:load:index () {

    local file=""

    (( ${#LOAD_INDEX[@]} == 0 )) || return 0

    while IFS= read -r file; do
        LOAD_INDEX["${file}"]=1
    done < <(bundle:sources)

}
core:load:exists () {

    local path="${1}"

    if declare -F bundle:sources >/dev/null; then
        core:load:index
        [[ -n "${LOAD_INDEX[${path}]+x}" ]]
    else
        [[ -f "${TOOL_SOURCE}/${path}" && ! -L "${TOOL_SOURCE}/${path}" ]]
    fi

}
core:load:resolve () {

    local path="${1}"

    if core:load:exists "${path}.sh"; then LOAD_PATH="${path}.sh"
    elif core:load:exists "${path}/index.sh"; then LOAD_PATH="${path}/index.sh"
    else printf '%s\n' "[-] Nothing to use as ${path//\//::}: no ${path}.sh and no ${path}/index.sh" >&2; return 1
    fi

}
core:load:list () {

    local folder="${1:-}" file="" LC_ALL=C

    [[ -n "${folder}" && "${folder}" != *[!a-z0-9_/-]* && "${folder}" != /* && "${folder}" != */ ]] \
        || { printf '%s\n' "[-] Invalid source folder: ${folder}" >&2; return 1; }

    if declare -F bundle:sources >/dev/null; then

        while IFS= read -r file; do
            [[ "${file}" == "${folder}/"* && "${file#"${folder}/"}" != */* ]] && printf '%s\n' "${file}"
        done < <(bundle:sources)

        return 0

    fi

    for file in "${TOOL_SOURCE}/${folder}"/*.sh; do
        [[ -f "${file}" && ! -L "${file}" ]] && printf '%s\n' "${file#"${TOOL_SOURCE}/"}"
    done

    return 0

}
