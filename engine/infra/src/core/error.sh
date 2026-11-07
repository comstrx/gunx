core:error:fail () {

    core:error:raise 1 "$*"

}
core:error:raise () {

    local code="${1}" where=""

    shift

    [[ "${code}" =~ ^[0-9]+$ && "${code}" -ge 1 && "${code}" -le 255 ]] || code=1

    where="${FUNCNAME[2]:-main}"
    [[ "${where}" != core:error:fail ]] || where="${FUNCNAME[3]:-main}"
    [[ "${where}" != "@err" ]] || where="${FUNCNAME[4]:-main}"

    core:log:fail "$*"
    core:log:debug "raised ${code} in ${where}"

    return "${code}"

}
core:error:usage () {

    core:error:raise 2 "$*; see ${MANIFEST[meta.name]:-infra} help"

}
core:error:cleanup () {

    [[ "${TOOL_KEEP:-false}" != true ]] || return 0
    [[ -z "${TOOL_TEMP:-}" || ! -d "${TOOL_TEMP}" ]] || rm -rf -- "${TOOL_TEMP}"

}
core:error:traps () {

    trap core:error:cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

}
