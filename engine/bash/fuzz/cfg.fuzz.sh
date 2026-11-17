fuzz:core:cfg:load () {

    core:cfg:load "${1}"

}
fuzz:core:cfg:set () {

    local key="" value=""

    key="$(tr -cd 'A-Za-z0-9_ -' < "${1}" | head -c 24)"
    value="$(tr -d '\0' < "${1}" | head -c 200)"

    core:cfg:set "${key}" "${value}" || return 0

    [[ "${CONFIG[${key}]}" == "${value}" ]] || return 3

    core:cfg:number "${key}" 0 100

}
