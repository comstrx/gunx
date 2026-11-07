core:num:is () {

    [[ "${1:-}" =~ ^-?[0-9]+$ ]]

}
core:num:natural () {

    [[ "${1:-}" != *[!0-9]* && -n "${1:-}" && ( "${1}" == 0 || "${1}" != 0* ) ]]

}
core:num:between () {

    local value="${1:-}" low="${2:-}" high="${3:-}"

    core:num:is "${value}" && core:num:is "${low}" || return 1
    (( value >= low )) || return 1

    [[ -z "${high}" ]] || { core:num:is "${high}" && (( value <= high )); }

}
core:num:clamp () {

    local value="${1}" low="${2}" high="${3}"

    (( value < low )) && value="${low}"
    (( value > high )) && value="${high}"

    core:log:print "${value}"

}
core:num:percent () {

    local part="${1}" whole="${2}"

    (( whole != 0 )) || { core:log:print 0; return 0; }

    core:log:print $(( part * 100 / whole ))

}
core:num:max () {

    local best="${1}" item=""

    for item in "$@"; do (( item > best )) && best="${item}"; done

    core:log:print "${best}"

}
core:num:min () {

    local best="${1}" item=""

    for item in "$@"; do (( item < best )) && best="${item}"; done

    core:log:print "${best}"

}
