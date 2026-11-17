fuzz:core:log:emit () {

    local text=""

    text="$(tr -d '\0' < "${1}" | head -c 300)"

    core:log:print "${text}" >/dev/null
    core:log:debug "${text}"
    core:log:info "${text}"
    core:log:warn "${text}"
    core:log:succ "${text}"

}
fuzz:core:log:redact () {

    local secret="" out=""

    secret="$(tr -cd 'A-Za-z0-9' < "${1}" | head -c 24)"
    (( ${#secret} >= 12 )) || return 0

    CONFIG[FUZZ_TOKEN]="${secret}"
    out="$(core:log:redact "before ${secret} after")" || return 3

    [[ "${out}" != *"${secret}"* ]] || return 3

}
