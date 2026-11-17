fuzz:core:json:string () {

    local text="" out=""

    text="$(tr -d '\0' < "${1}")"
    out="$(core:json:string "${text}")" || return 3

    [[ "${out}" == \"*\" && "${out}" != *$'\n'* && "${out}" != *$'\t'* && "${out}" != *$'\r'* ]] || return 3

    out="${out#\"}"
    out="${out%\"}"
    out="${out//\\\\/}"
    out="${out//\\\"/}"

    [[ "${out}" != *\"* ]] || return 3

}
fuzz:core:json:object () {

    local text="" out=""

    text="$(tr -d '\0' < "${1}" | head -c 80)"
    out="$(core:json:object key "$(core:json:string "${text}")" list "$(core:json:array 1 2 "$(core:json:string "${text}")")")" || return 3

    [[ "${out}" == '{'*'}' && "${out}" != *$'\n'* ]] || return 3

}
