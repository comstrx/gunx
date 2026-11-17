fuzz:core:install:archive () {

    local -a words=()

    mapfile -t words < <(tr -d '\0' < "${1}" | head -n 5)

    core:install:archive "${words[0]:-}" "${words[1]:-}" "${words[2]:-}" "${words[3]:-}" "${words[4]:-}"

}
fuzz:core:install:holds () {

    local digest=""

    digest="$(tr -cd 'a-f0-9' < "${1}" | head -c 64)"

    ! core:install:holds "${1}" "${digest}" || return 3

}
