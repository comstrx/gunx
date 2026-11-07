config:packages:runtime () {

    local tool=""

    for tool in ${MANIFEST[requires.runtime]:-}; do core:log:print "${tool}"; done

}
config:packages:name () {

    local manager="${1}" tool="${2}"

    core:log:print "${MANIFEST[packages.${tool}.${manager}]:-${tool}}"

}
config:packages:missing () {

    local manager="${1}" tool=""

    while IFS= read -r tool; do
        core:sys:has "${tool}" || config:packages:name "${manager}" "${tool}"
    done < <(config:packages:runtime)

}
