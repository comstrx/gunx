fuzz:core:yaml:edits () {

    local copy=""

    copy="$(core:fs:temp:file)" || return 0
    tr -d '\0' < "${1}" > "${copy}"

    core:parse:yaml:keys "${copy}" >/dev/null
    core:parse:yaml:prune "${copy}" '^ *- run: tool sync' 2
    core:parse:yaml:erase "${copy}" paths
    core:parse:yaml:hollow "${copy}"

    ! grep -qE '^ *paths:( |$)' -- "${copy}" || return 3

}
fuzz:core:yaml:set () {

    local copy="" value=""

    copy="$(core:fs:temp:file)" || return 0
    value="$(tr -cd 'a-zA-Z0-9 ._/\\&|[]-' < "${1}" | head -c 40)"

    printf 'top:\n  path:\n    - one\n    - two\n  keep: yes\n' > "${copy}"

    core:parse:yaml:set "${copy}" path "${value}" || return 3

    [[ "$(sed -n 2p -- "${copy}")" == "  path: ${value}" && "$(sed -n 3p -- "${copy}")" == '  keep: yes' ]] || return 3

}
