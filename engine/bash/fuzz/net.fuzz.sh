fuzz:core:net:host () {

    local url="" host=""

    url="$(tr -d '\0\n' < "${1}" | head -c 200)"
    host="$(core:net:host "${url}")" || return 3

    [[ "${url}" != *://* ]] || [[ "${host#*://}" != *[/?#@]* ]] || return 3

}
fuzz:core:net:reason () {

    core:net:reason "${1}" https://example.invalid/x >/dev/null
    core:net:excerpt "${1}" https://example.invalid/x >/dev/null

}
