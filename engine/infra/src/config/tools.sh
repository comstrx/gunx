config:tools:names () {

    local key=""

    for key in "${!MANIFEST[@]}"; do

        [[ "${key}" != tools.* || "${key#tools.}" == *.* ]] || core:log:print "${key#tools.}"

    done | sort

}
config:tools:has () {

    [[ -n "${MANIFEST[tools.${1:-}]+x}" ]]

}
config:tools:version () {

    local name="${1}"

    config:tools:has "${name}" || { core:error:fail "Unknown tool: ${name}; see [tools]"; return; }

    if [[ -n "${MANIFEST[tools.${name}.version]+x}" ]]; then core:log:print "${MANIFEST[tools.${name}.version]}"
    else core:log:print "${MANIFEST[tools.${name}]}"
    fi

}
config:tools:get () {

    local name="${1}" key="${2}" fallback="${3-}"

    config:tools:has "${name}" || { core:error:fail "Unknown tool: ${name}; see [tools]"; return; }

    core:log:print "${MANIFEST[tools.${name}.${key}]:-${fallback}}"

}
config:tools:fetchable () {

    local name="" kernel="" arch=""

    kernel="$(core:sys:kernel)" || return
    arch="$(core:sys:arch)" || return

    while IFS= read -r name; do

        [[ -z "${MANIFEST[archive.${name}_${kernel}_${arch}]+x}" ]] || core:log:print "${name}"

    done < <(config:tools:names)

}
