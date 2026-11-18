module:bundle:tool:home () {

    config:paths:tools

}
module:bundle:tool:binary () {

    local name="${1}" home=""

    config:tools:has "${name}" || { core:error:fail "Unknown tool: ${name}; see [tools]"; return; }

    home="$(module:bundle:tool:home)" || return

    if [[ -x "${home}/${name}" ]]; then core:log:print "${home}/${name}"; return 0; fi

    core:sys:need "${name}" || return

    core:log:print "${name}"

}
module:bundle:tool:version () {

    local binary="${1}" line="" word=""

    while IFS= read -r line; do

        for word in ${line}; do
            [[ ! "${word#v}" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || { core:log:print "${BASH_REMATCH[0]}"; return 0; }
        done

    done < <("${binary}" --version 2>/dev/null)

    core:error:fail "Version unreadable: ${binary}"

}
module:bundle:tool:pinned () {

    local name="${1}" binary="" version=""

    binary="$(module:bundle:tool:binary "${name}")" || return
    version="$(module:bundle:tool:version "${binary}")" || return

    [[ "${version}" == "$(config:tools:version "${name}")" ]] || { core:error:fail "${name} ${version} is not the pinned $(config:tools:version "${name}"); run fetch"; return; }

}
module:bundle:tool:run () {

    local name="${1}" binary="" version="" runner=""

    shift

    runner="$(config:tools:get "${name}" runner)" || return

    if [[ -n "${runner}" ]]; then

        core:sys:need "${runner}" || return

        core:proc:timeout "${CONFIG[RUN_TIMEOUT]:-${CONFIG_BASE[RUN_TIMEOUT]}}" "${runner}" "${name}@$(config:tools:version "${name}")" "$@"
        return

    fi

    binary="$(module:bundle:tool:binary "${name}")" || return
    version="$(module:bundle:tool:version "${binary}")" || return

    [[ "${version}" == "$(config:tools:version "${name}")" ]] \
        || core:log:warn "${name} ${version} differs from the pinned $(config:tools:version "${name}"); run fetch"

    "${binary}" "$@"

}
module:bundle:tool:ready () {

    local name="${1}" runner=""

    runner="$(config:tools:get "${name}" runner 2>/dev/null)" || return 1

    if [[ -n "${runner}" ]]; then core:sys:has "${runner}"
    else module:bundle:tool:binary "${name}" >/dev/null 2>&1
    fi

}
