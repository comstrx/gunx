module:bundle:boot:root () {

    local root=""

    core:cli:given --root || return 0
    root="$(core:cli:value --root)" || return 0

    [[ -d "${root}" ]] || { core:error:fail "Not a directory: ${root}"; return; }

    TOOL_ROOT="$(cd -- "${root}" && pwd -P)" || { core:error:fail "Cannot enter: ${root}"; return; }

}
module:bundle:boot:engine () {

    [[ "${TOOL_BUNDLED:-false}" == true ]] || return 0

    TOOL_ENGINE="${INFRA_ENGINE:-${TOOL_ROOT}}"

}
module:bundle:boot:breathe () {

    if [[ -t 1 ]]; then printf '\n'
    elif [[ -t 2 ]]; then printf '\n' >&2
    fi

}
module:bundle:boot:flags () {

    local command="${1}" flag=""
    local -a switches=()

    module:bundle:usage:command "${command}" >/dev/null || { module:bundle:help:unknown "${command}"; return; }

    core:cli:collect switches

    for flag in "${switches[@]}"; do

        module:bundle:usage:allowed "${command}" "${flag}" \
            || { core:error:usage "${command} does not take ${flag}"; return; }

    done

}
module:bundle:boot:dispatch () {

    local command="${1}" handler=""

    shift

    handler="$(module:bundle:usage:handler "${command}")" || { module:bundle:help:unknown "${command}"; return; }

    "${handler}" "$@"

}
module:bundle:boot:main () {

    local command=""

    (( BASH_VERSINFO[0] >= 5 )) || { printf '%s\n' '[-] Bash 5 or newer required' >&2; return 1; }

    set +x
    umask 077

    core:error:traps

    module:bundle:usage:valued
    module:bundle:boot:breathe

    core:cli:parse "$@" || return

    module:bundle:boot:root || return
    module:bundle:boot:engine || return

    config:settings:manifest || return
    config:targets:load || return

    TOOL_LAB="$(config:paths:lab)" || return

    core:fs:dir:own "${TOOL_LAB}" 700 || return

    TOOL_TEMP="$(core:sys:session "${TOOL_LAB}")" || return

    ! core:cli:flag --version || { module:bundle:view:version; return; }

    command="${CLI_ARGS[0]:-help}"
    set -- "${CLI_ARGS[@]:1}"

    if core:cli:flag --help; then

        [[ "${command}" != help ]] || command="${1:-}"

        module:bundle:help:show "${command}"

        return

    fi

    config:settings:load || return

    case "${command}" in
        __tests) module:bundle:test:list; return ;;
        __test)  module:bundle:test:isolate "$@"; return ;;
    esac

    module:bundle:boot:flags "${command}" || return
    module:bundle:boot:dispatch "${command}" "$@"

}
