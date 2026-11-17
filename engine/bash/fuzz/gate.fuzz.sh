fuzz:module:gate:types () {

    local wanted="" out="" type=""

    wanted="$(tr -d '\0\n' < "${1}" | head -c 80)"
    out="$(module:gate:types "${wanted}" 2>/dev/null)" || return 0

    for type in ${out}; do
        core:list:has "${type}" "${GATE_TYPES[@]}" || return 3
    done

}
fuzz:module:gate:semver () {

    local now="" was="" lost="" line=""

    now="$(tr -d '\0' < "${1}" | head -n 20)"
    was="$(tr -d '\0' < "${1}" | tail -n 20)"
    lost="$(module:gate:semver:lost "${was}" "${now}")" || return 0

    while IFS= read -r line; do
        [[ -z "${line}" || $'\n'"${was}"$'\n' == *$'\n'"${line}"$'\n'* ]] || return 3
    done <<< "${lost}"

}
