fuzz:core:fs:path () {

    local path=""

    path="$(tr -d '\0\n' < "${1}" | head -c 200)"

    core:fs:path:parent "${path}" >/dev/null

    core:fs:path:relative "${path}" || return 0

    [[ "${path}" != /* && "/${path}/" != */../* ]] || return 3

}
fuzz:core:fs:file () {

    local copy=""

    copy="$(core:fs:temp:file)" || return 0

    core:fs:file:write "${copy}" 600 cat "${1}" || return 3

    cmp -s -- "${1}" "${copy}" || return 3

    [[ "$(core:fs:file:hash "${1}")" == "$(core:fs:file:hash "${copy}")" ]] || return 3

}
