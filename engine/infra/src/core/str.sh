core:str:trim () {

    local text="${1-}"

    text="${text#"${text%%[![:space:]]*}"}"
    text="${text%"${text##*[![:space:]]}"}"

    core:log:print "${text}"

}
core:str:lower () {

    local text="${1-}"

    core:log:print "${text,,}"

}
core:str:upper () {

    local text="${1-}"

    core:log:print "${text^^}"

}
core:str:repeat () {

    local text="${1-}" count="${2:-0}" result=""

    while (( count-- > 0 )); do result+="${text}"; done

    core:log:print "${result}"

}
core:str:pad () {

    local text="${1-}" width="${2:-0}"

    printf '%-*s\n' "${width}" "${text}"

}
core:str:contains () {

    [[ "${1-}" == *"${2-}"* ]]

}
core:str:starts () {

    [[ "${1-}" == "${2-}"* ]]

}
core:str:ends () {

    [[ "${1-}" == *"${2-}" ]]

}
core:str:replace () {

    local text="${1-}" from="${2-}" to="${3-}"

    [[ -n "${from}" ]] || { core:log:print "${text}"; return 0; }

    core:log:print "${text//"${from}"/${to}}"

}
core:str:split () {

    local -n _parts="${1}"
    local text="${2-}" separator="${3:-,}"

    _parts=()

    [[ -n "${text}" ]] || return 0

    while [[ "${text}" == *"${separator}"* ]]; do
        _parts+=( "${text%%"${separator}"*}" )
        text="${text#*"${separator}"}"
    done

    _parts+=( "${text}" )

}
core:str:join () {

    local separator="${1-}" result="" item=""

    shift

    for item in "$@"; do result+="${result:+${separator}}${item}"; done

    core:log:print "${result}"

}
