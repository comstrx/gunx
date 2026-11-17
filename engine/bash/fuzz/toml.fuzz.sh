fuzz:core:toml:read () {

    local -A table=()

    core:parse:toml table "${1}"

}
fuzz:core:toml:drop () {

    local copy=""

    copy="$(core:fs:temp:file)" || return 0
    cat -- "${1}" > "${copy}"

    core:parse:toml:drop "${copy}" deps || return 0

    ! grep -qE '^\[deps\]' -- "${copy}" || return 3

}
