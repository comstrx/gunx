module:bundle:view:version () {

    core:log:print "${MANIFEST[meta.name]} ${MANIFEST[meta.version]} (${TOOL_BUILD} build, bash ${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]})"

}
module:bundle:view:config () {

    local key=""

    (( $# <= 1 )) || { core:error:usage "config [KEY] [--changed]"; return; }
    [[ -z "${1:-}" ]] || { core:cfg:show "${1}"; return; }

    for key in "${CONFIG_KEYS[@]}"; do

        ! core:cli:flag --changed || [[ "${CONFIG[${key}]}" != "${CONFIG_DEFAULTS[${key}]}" ]] || continue

        printf '%s\t%s  (%s)\n' "${key}" "$(core:cfg:show "${key}")" "${CONFIG_SOURCE[${key}]}"

    done | core:ui:table

}
module:bundle:view:system () {

    { core:sys:report; printf 'lab\t%s\n' "${TOOL_LAB}"; printf 'session\t%s\n' "${TOOL_TEMP}"; } | core:ui:table

}
module:bundle:view:meta () {

    {
        printf 'name\t%s\n' "$(config:meta:name)"
        printf 'version\t%s\n' "$(config:meta:version)"
        printf 'description\t%s\n' "$(config:meta:description)"
        printf 'license\t%s\n' "$(config:meta:license)"
        printf 'readme\t%s\n' "$(config:meta:readme)"
        printf 'owner\t%s\n' "$(config:meta:owner)"
        printf 'authors\t%s\n' "$(config:meta:authors | tr '\n' ' ')"
        printf 'build\t%s\n' "${TOOL_BUILD}"
        printf 'bash\t%s\n' "${BASH_VERSION}"
    } | core:ui:table

}
