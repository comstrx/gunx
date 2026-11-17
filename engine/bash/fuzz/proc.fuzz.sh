fuzz:core:proc:seconds () {

    local text="" out=""

    text="$(tr -d '\0\n' < "${1}" | head -c 40)"
    out="$(core:proc:seconds "${text}" fuzz 2>/dev/null)" || return 0

    [[ "${out}" =~ ^[0-9]+$ ]] && (( 10#${out} > 0 )) || return 3

}
fuzz:core:proc:backoff () {

    local -a words=()

    mapfile -t words < <(tr -c '0-9a-z-' '\n' < "${1}" | head -n 2)

    core:proc:backoff "${words[0]:-}" "${words[1]:-}" >/dev/null

}
