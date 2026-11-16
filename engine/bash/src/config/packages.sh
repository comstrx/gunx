config:packages:runtime () {

    local tool=""

    for tool in ${MANIFEST[requires.runtime]:-}; do core:log:print "${tool}"; done

}
config:packages:name () {

    local manager="${1}" tool="${2}"

    core:log:print "${MANIFEST[packages.${tool}.${manager}]:-${tool}}"

}
