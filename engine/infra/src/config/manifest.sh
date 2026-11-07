declare -gA MANIFEST=()

config:manifest:file () {

    local root="${1}" name=""

    for name in infra.toml Infra.toml; do
        [[ ! -f "${root}/${name}" ]] || { core:log:print "${root}/${name}"; return 0; }
    done

    core:error:fail "No infra.toml or Infra.toml in ${root}"

}
config:manifest:load () {

    local file="${1}" name=""

    if [[ -n "${file}" ]]; then core:parse:toml MANIFEST "${file}" || return
    else config:manifest:embedded || return; file=infra.toml
    fi

    core:validate:identifier "${MANIFEST[meta.name]:-}" || { core:error:fail "${file}: [meta] name must be an identifier"; return; }
    core:validate:semver "${MANIFEST[meta.version]:-}" || { core:error:fail "${file}: [meta] version must be MAJOR.MINOR.PATCH"; return; }

    [[ -n "${MANIFEST[meta.license]:-}" ]] || { core:error:fail "${file}: [meta] license is required"; return; }
    [[ "${MANIFEST[meta.authors]:-0}" -ge 1 ]] || { core:error:fail "${file}: [meta] authors needs one name at least"; return; }

    for name in entrypoint source build cache tests benches fuzz; do
        core:fs:path:relative "${MANIFEST[paths.${name}]:-}" || { core:error:fail "${file}: paths.${name} must be a relative path"; return; }
    done

}
config:manifest:get () {

    local key="${1:-}"

    [[ -n "${MANIFEST[${key}]+x}" ]] || { core:error:fail "Missing manifest key: ${key}"; return; }

    core:log:print "${MANIFEST[${key}]}"

}
config:manifest:list () {

    local key="${1}" count=0 index=0

    count="${MANIFEST[${key}]:-0}"

    while (( index < count )); do
        core:log:print "${MANIFEST[${key}.${index}]}"
        index=$(( index + 1 ))
    done

}
config:manifest:embedded () {

    declare -F bundle:asset >/dev/null || return 1

    core:parse:toml MANIFEST <(bundle:asset infra.toml)

}
