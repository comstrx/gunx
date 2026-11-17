fuzz:core:pkg:plan () {

    local manager="" action=""
    local -a words=()

    mapfile -t words < <(tr -c 'a-z0-9:_.+-' '\n' < "${1}" | head -n 3)

    manager="${words[0]:-}" action="${words[1]:-}"

    core:pkg:known "${manager}" || true
    core:pkg:plan "${manager}" "${action}" "${words[2]:-}" >/dev/null

}
