module:extract:flags () {

    local name="${1:-}" key="" value="" target=""
    local -a names=()

    names=( "${name}" )
    [[ -n "${name}" ]] || mapfile -t names < <(config:targets:list)

    [[ -z "${name}" ]] || config:targets:open "${name}" || return

    for key in "${EXTRACT_OWN[@]}"; do

        value="$(core:cli:value "--${key}")" || continue

        [[ -n "${name}" ]] || { core:error:usage "--${key} describes one target; name the target it belongs to"; return; }

        case "${key}" in
            engines) module:extract:flags:engines "${name}" "${value}" ;;
            refs)    module:extract:flags:refs "${name}" "${value}" ;;
            *)       config:targets:set "${name}" "${key}" "${value}" ;;
        esac || return

    done

    for key in "${EXTRACT_SHARED[@]}"; do

        value="$(core:cli:value "--${key}")" || continue

        for target in "${names[@]}"; do
            ! config:targets:has "${target}" || config:targets:set "${target}" "${key}" "${value}" || return
        done

    done

}
module:extract:flags:items () {

    local -n _items="${1}"
    local text="${2-}" item=""
    local -a parts=()

    _items=()

    core:str:split parts "${text}" ,

    for item in "${parts[@]}"; do

        item="$(core:str:trim "${item}")"

        [[ -z "${item}" ]] || _items+=( "${item}" )

    done

}
module:extract:flags:engines () {

    local name="${1}"
    local -a engines=()

    module:extract:flags:items engines "${2-}"

    config:targets:fill "${name}" engines "${engines[@]}"

}
module:extract:flags:refs () {

    local name="${1}" item=""
    local -a items=() pairs=()

    module:extract:flags:items items "${2-}"

    for item in "${items[@]}"; do

        if [[ "${item}" != ?*:?* || "${item#*:}" == //* ]] || ! core:fs:path:relative "${item%%:*}"; then

            core:error:usage "--refs takes src:repo, a folder of the root then the repository that replaces it, not ${item}"
            return

        fi

        pairs+=( "${item%%:*}" "${item#*:}" )

    done

    config:targets:link "${name}" "${pairs[@]}"

}
