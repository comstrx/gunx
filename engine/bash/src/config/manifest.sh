declare -ga MANIFEST_NAMES=( bash.toml infra.toml )
declare -gA MANIFEST=()
declare -g MANIFEST_FILE=""

config:manifest:find () {

    local root="${1}" wanted="" file="" name=""

    for wanted in "${MANIFEST_NAMES[@]}"; do

        for file in "${root}"/*.toml; do

            name="${file##*/}"

            [[ -f "${file}" && "${name,,}" == "${wanted}" ]] || continue

            core:log:print "${file}"
            return 0

        done

    done

    return 1

}
config:manifest:file () {

    config:manifest:find "${1}" || core:error:fail "No ${MANIFEST_NAMES[0]} nor ${MANIFEST_NAMES[1]} in ${1}"

}
config:manifest:load () {

    local file="${1}"

    MANIFEST_FILE="${file}"

    if [[ -n "${file}" ]]; then

        core:parse:toml MANIFEST "${file}" || return

        MANIFEST[meta.build]="${TOOL_BUILD:-dev}"
        [[ -n "${MANIFEST[meta.src]:-}" ]] || MANIFEST[meta.src]="${TOOL_ENGINE:-}"

    else config:manifest:embedded || return
    fi

    config:manifest:check "${file:-${MANIFEST_NAMES[0]}}"

}
config:manifest:merge () {

    local file="${1}" key="" old=""
    local -A table=()

    [[ -f "${file}" ]] || { core:error:fail "No such manifest: ${file}"; return; }
    [[ -z "${MANIFEST_FILE}" || ! "${file}" -ef "${MANIFEST_FILE}" ]] || return 0

    core:parse:toml table "${file}" || return

    for key in "${!table[@]}"; do

        [[ -n "${MANIFEST[${key}.0]+x}" ]] || continue

        for old in "${!MANIFEST[@]}"; do
            [[ "${old}" != "${key}".[0-9]* ]] || unset "MANIFEST[${old}]"
        done

    done

    for key in "${!table[@]}"; do
        [[ "${key}" == meta || "${key}" == meta.* ]] || MANIFEST["${key}"]="${table[${key}]}"
    done

    config:manifest:check "${file}"

}
config:manifest:check () {

    local file="${1}" name=""

    [[ -z "${MANIFEST[meta.name]+x}" ]] || core:validate:identifier "${MANIFEST[meta.name]}" \
        || { core:error:fail "${file}: [meta] name must be an identifier"; return; }

    [[ -z "${MANIFEST[meta.version]+x}" ]] || core:validate:semver "${MANIFEST[meta.version]}" \
        || { core:error:fail "${file}: [meta] version must be MAJOR.MINOR.PATCH"; return; }

    [[ -z "${MANIFEST[meta.alias]+x}" || "${MANIFEST[meta.alias]}" =~ ^[a-z][a-z0-9-]*$ ]] \
        || { core:error:fail "${file}: [meta] alias must be a lowercase name"; return; }

    [[ -z "${MANIFEST[meta.bash_version]+x}" || "${MANIFEST[meta.bash_version]}" =~ ^[0-9]+\.[0-9]+$ ]] \
        || { core:error:fail "${file}: [meta] bash_version must be MAJOR.MINOR"; return; }

    for name in entrypoint source build cache tests benches fuzz; do
        core:fs:path:relative "${MANIFEST[paths.${name}]:-}" || { core:error:fail "${file}: paths.${name} must be a relative path"; return; }
    done

}
config:manifest:get () {

    local key="${1:-}"

    [[ -n "${key}" && -n "${MANIFEST[${key}]+x}" ]] || { core:error:fail "Missing manifest key: ${key}"; return; }

    core:log:print "${MANIFEST[${key}]}"

}
config:manifest:list () {

    core:parse:list MANIFEST "${1}"

}
config:manifest:counted () {

    local count=""

    [[ -n "${1:-}" ]] || return 1

    count="${MANIFEST[${1}]:-}"

    core:num:natural "${count}" && (( count > 0 ))

}
config:manifest:embedded () {

    declare -F bundle:manifest >/dev/null || return 1

    bundle:manifest MANIFEST

}
