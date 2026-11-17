fuzz:config:tools:get () {

    local name="" value=""

    name="$(tr -cd 'a-z0-9-' < "${1}" | head -c 24)"
    value="$(tr -d '\0\n' < "${1}" | head -c 60)"

    config:tools:has "${name}" || true
    config:tools:version "${name}" >/dev/null || true
    config:tools:get "${name}" binary fallback >/dev/null || true

    [[ -n "${name}" ]] || return 0

    MANIFEST["tools.${name}"]="${value}"

    [[ -z "${value}" || "$(config:tools:version "${name}")" == "${value}" ]] || return 3

}
