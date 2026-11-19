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
fuzz:module:gate:order () {

    local root="" wanted="" type="" row="" byte=0 index=0 seen=0
    local -a pool=( lock fetch check lint test bench ) order=()

    root="$(core:fs:temp:dir)" || return 0

    module:gate:demo:lock () { :; }
    module:gate:demo:fetch () { :; }
    module:gate:demo:check () { :; }
    module:gate:demo:lint () { :; }
    module:gate:demo:test () { :; }

    while IFS= read -r -n 1 -d '' row && (( index < 6 )); do

        printf -v byte '%d' "'${row}" 2>/dev/null || byte=0

        wanted+="${wanted:+ }${pool[$(( byte % ${#pool[@]} ))]}"
        index=$(( index + 1 ))

    done < <(tr -d '\0' < "${1}" | head -c 6)

    [[ -n "${wanted}" ]] || return 0

    GATE_RESULTS=()

    if ! module:gate:one demo "${root}" "${wanted}" 5 false >/dev/null 2>&1; then

        [[ " ${wanted} " == *" bench "* && ${#GATE_RESULTS[@]} -eq 0 ]] || return 3

        return 0

    fi

    for row in "${GATE_RESULTS[@]}"; do

        IFS=$'\t' read -r _ _ type _ <<< "${row}"

        order+=( "${type}" )

        [[ " ${wanted} " == *" ${type} "* || "${type}" == "${GATE_LEAD}" ]] || return 3

    done

    [[ " ${wanted} " != *" lock "* || "${order[0]}" == lock ]] || return 3

    for index in "${!order[@]}"; do
        [[ "${order[index]}" != "${GATE_LEAD}" ]] || { seen=1; continue; }
        core:list:has "${order[index]}" "${GATE_WRITERS[@]}" || [[ "${seen}" == 1 ]] || return 3
    done

}
