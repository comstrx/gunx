fuzz:config:manifest:merge () {

    local name="${MANIFEST[meta.name]}"

    config:manifest:merge "${1}" || return 0

    [[ "${MANIFEST[meta.name]}" == "${name}" ]] || return 3

}
fuzz:config:manifest:get () {

    local key=""

    key="$(tr -d '\0\n' < "${1}" | head -c 80)"

    config:manifest:get "${key}" >/dev/null || true
    config:manifest:counted "${key}" || true
    config:manifest:list "${key}" >/dev/null

}
fuzz:config:manifest:check () {

    local key=""
    local -a words=()

    mapfile -t words < <(tr -d '\0' < "${1}" | head -n 4)

    MANIFEST[meta.name]="${words[0]:-}"
    MANIFEST[meta.version]="${words[1]:-}"
    MANIFEST[meta.alias]="${words[2]:-}"
    MANIFEST[meta.bash_version]="${words[3]:-}"

    config:manifest:check fuzz.toml 2>/dev/null || return 0

    [[ "${MANIFEST[meta.name]}" =~ ^[a-z][a-z0-9_-]*$ && "${MANIFEST[meta.alias]}" =~ ^[a-z][a-z0-9-]*$ && "${MANIFEST[meta.bash_version]}" =~ ^[0-9]+\.[0-9]+$ ]] || return 3

}
