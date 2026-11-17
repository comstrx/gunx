fuzz:module:notify:event () {

    local -a words=()

    mapfile -t words < <(tr -d '\0' < "${1}" | head -n 5)

    module:notify:event "${words[0]:-}" "${words[1]:-}" "${words[2]:-}" "${words[3]:-}" "${words[4]:-}" >/dev/null

}
fuzz:module:notify:clip () {

    local text="" out=""

    text="$(tr -d '\0' < "${1}")"
    out="$(module:notify:clip "${text}" 100)x"

    (( ${#out} <= 104 )) || return 3

    module:notify:duration "${text%%$'\n'*}" >/dev/null

}
