fuzz:core:git:address () {

    local text=""

    text="$(tr -d '\0' < "${1}" | head -c 128)"

    core:git:address "${text}" >/dev/null

}
fuzz:core:git:resolve () {

    local text=""

    text="$(tr -d '\0\n' < "${1}" | head -c 96)"

    core:git:resolve "${text}" "${TOOL_ENGINE}" >/dev/null

}
fuzz:core:git:named () {

    local text=""

    text="$(tr -d '\0\n' < "${1}" | head -c 96)"

    core:git:named "${text}" || return 0

    [[ -n "${text}" && "${text}" != -* && "${text}" != *' '* && "${text}" != *..* ]] || return 3

}
fuzz:core:git:policy () {

    local path=""

    path="/nowhere/$(tr -cd 'a-z0-9/' < "${1}" | head -c 40)"

    [[ "$(core:git:host "${path}")" == "${GIT_HOST}" && "$(core:git:trunk "${path}")" == "${GIT_BRANCH}" ]] || return 3

    ! core:git:owner "${path}" || return 3

}
fuzz:core:git:deep () {

    local spec="" out=""

    spec="$(tr -cd 'A-Za-z0-9._/:@-' < "${1}" | head -c 100)"
    out="$(core:git:address "${spec}" 2>/dev/null)" || return 0

    [[ "${out}" == /* || ( "${out}" != *://* && "${out}" != *@* && "${out}" != */ && "${out}" == */*/* ) ]] || return 3

}
