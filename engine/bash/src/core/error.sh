declare -g ERROR_TRAPS="" ERROR_TOOL=""

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

    core:error:raise 2 "$*; see ${ERROR_TOOL:+${ERROR_TOOL} }help"

}
core:error:cleanup () {

    core:fs:release

    if [[ "${TOOL_KEEP:-false}" == true ]]; then

        [[ -z "${TOOL_TEMP:-}" || ! -d "${TOOL_TEMP}" ]] || : > "${TOOL_TEMP}/keep"

        return 0

    fi
    [[ -z "${TOOL_TEMP:-}" || ! -d "${TOOL_TEMP}" ]] || rm -rf -- "${TOOL_TEMP}"

}
core:error:traps () {

    trap core:error:cleanup EXIT
    core:error:guard

    ERROR_TRAPS="${BASHPID}"

}
core:error:guard () {

    trap 'core:error:halt 130' INT
    trap 'core:error:halt 143' TERM

}
core:error:halt () {

    core:proc:halt
    exit "${1:-1}"

}
