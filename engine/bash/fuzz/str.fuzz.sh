fuzz:core:str:shape () {

    local text="" once="" twice="" out=""

    text="$(tr -d '\0' < "${1}" | head -c 300)"

    once="$(core:str:trim "${text}")x"
    twice="$(core:str:trim "${once%x}")x"
    [[ "${once}" == "${twice}" ]] || return 3

    out="$(core:str:repeat ab 7)"
    [[ "${out}" == ababababababab ]] || return 3

    out="$(core:str:pad "${text%%$'\n'*}" 40)x"
    (( ${#out} >= 41 )) || return 3

    core:str:pad "${text}" "${text:0:6}" >/dev/null

    core:str:lower "${text}" >/dev/null
    core:str:upper "${text}" >/dev/null

    core:str:starts "${text}" "${text:0:3}" || return 3
    core:str:ends "${text}" "${text: -3}" || return 3
    core:str:contains "${text}" "${text:1:4}" || return 3

}
fuzz:core:str:parts () {

    local text="" joined=""
    local -a parts=()

    text="$(tr -d '\0\n' < "${1}" | head -c 200)"

    core:str:split parts "${text}" ,
    joined="$(core:str:join , "${parts[@]}")"

    [[ "${joined//,/}" == "${text//,/}" ]] || return 3

    joined="$(core:str:replace "${text}" , ';')"
    [[ "${joined}" != *,* ]] || return 3

}
