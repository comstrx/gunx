if [[ "${TOOL_BUNDLED:-false}" != true ]]; then

    TOOL_SOURCE="$(cd -- "${BASH_SOURCE[0]%/*}/.." && pwd -P)"
    TOOL_ENGINE="${TOOL_SOURCE%/*}"
    TOOL_ROOT="${TOOL_ENGINE}"
    TOOL_BIN="${TOOL_SOURCE}/main.sh"
    TOOL_BUILD=dev

    source "${TOOL_SOURCE}/core/load.sh"

fi

core:load:use app::boot || return

app:root () {

    local root=""

    root="$(core:cli:value --root)" || return 0

    [[ -d "${root}" ]] || { @err "Not a directory: ${root}"; return; }

    TOOL_ROOT="$(cd -- "${root}" && pwd -P)" || { @err "Cannot enter: ${root}"; return; }

}
app:engine () {

    [[ "${TOOL_BUNDLED:-false}" == true ]] || return 0

    TOOL_ENGINE="${INFRA_ENGINE:-${TOOL_ROOT}}"

}
app:breathe () {

    if [[ -t 1 ]]; then printf '\n'
    elif [[ -t 2 ]]; then printf '\n' >&2
    fi

}
app:main () {

    local command=""

    (( BASH_VERSINFO[0] >= 5 )) || { printf '%s\n' '[-] Bash 5 or newer required' >&2; return 1; }

    set +x
    umask 077

    core:error:traps
    module:bundle:usage:valued
    app:breathe

    core:cli:parse "$@" || return
    app:root || return
    app:engine || return
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

    app:router:flags "${command}" || return
    app:router:dispatch "${command}" "$@"

}
