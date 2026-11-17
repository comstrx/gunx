fuzz:config:meta:get () {

    local key=""

    key="$(tr -d '\0\n' < "${1}" | head -c 80)"

    config:meta:get "${key}" >/dev/null || true

    MANIFEST[meta.alias]="${key}"

    [[ "$(config:meta:alias)" == "${key:-${MANIFEST[meta.name]}}" ]] || return 3

}
fuzz:config:meta:msrv () {

    local value=""

    value="$(tr -d '\0\n' < "${1}" | head -c 40)"

    MANIFEST[meta.bash_version]="${value}"

    [[ "$(config:meta:msrv)" == "${value}" ]] || return 3

}
