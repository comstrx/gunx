fuzz:core:validate:shapes () {

    local text=""

    text="$(tr -d '\0\n' < "${1}" | head -c 120)"

    core:validate:url "${text}" || true
    core:validate:identifier "${text}" || true
    core:validate:key "${text}" || true
    core:validate:number "${text}" || true
    core:validate:sha256 "${text}" || true
    core:validate:branch "${text}" || true
    core:validate:email "${text}" || true
    core:validate:breaking "${text}" "${text}" || true

    ! core:validate:name "${text}" || [[ "${text}" =~ ^[a-z][a-z0-9-]*$ ]] || return 3
    ! core:validate:semver "${text}" || core:validate:tag "v${text}" || return 3
    ! core:validate:tag "${text}" || core:validate:semver "${text#v}" || return 3

}
