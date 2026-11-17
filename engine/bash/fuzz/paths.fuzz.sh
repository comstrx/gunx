fuzz:config:paths:lab () {

    local cache="" lab=""

    cache="$(tr -d '\0\n' < "${1}" | head -c 80)"

    MANIFEST[paths.cache]="${cache}"

    lab="$(config:paths:lab 2>/dev/null)" || return 0

    [[ "${lab}" == "${TOOL_ROOT}/"* && "/${lab}/" != */../* ]] || return 3

}
