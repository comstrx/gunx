declare -gA TARGETS=()

config:targets:load () {

    local key="" name=""

    TARGETS=()

    for key in "${!MANIFEST[@]}"; do
        [[ "${key}" != deps.* || "${key}" == deps. ]] || TARGETS["${key#deps.}"]="${MANIFEST[${key}]}"
    done

    for key in "${!TARGETS[@]}"; do

        name="${key%%.*}"

        config:targets:named "${name}" || return

        TARGETS["${name}"]="${TARGETS[${name}]:-1}"

    done

    for key in "${!TARGETS[@]}"; do

        [[ "${key}" != *.*.* && "${key}" == *.path ]] || continue

        config:targets:inside "${key%.path}" "${TARGETS[${key}]}" || return

    done

}
config:targets:named () {

    [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || { core:error:fail "[deps] not a target name: ${1:-}"; return; }

}
config:targets:inside () {

    core:fs:path:relative "${2:-}" || { core:error:fail "[deps] ${1:-} must name a path inside the root: ${2:-}"; return; }

}
config:targets:has () {

    [[ -n "${1:-}" && -n "${TARGETS[${1}]+x}" ]]

}
config:targets:set () {

    local name="${1:-}" key="${2:-}" value="${3-}"

    config:targets:named "${name}" || return

    [[ "${key}" =~ ^[a-z]+$ ]] || { core:error:fail "[deps] ${name}: not a key: ${key}"; return; }
    [[ "${value}" != *[[:cntrl:]]* ]] || { core:error:fail "[deps] ${name}: ${key} holds a control character"; return; }

    [[ "${key}" != path ]] || config:targets:inside "${name}" "${value}" || return

    TARGETS["${name}"]="${TARGETS[${name}]:-1}"
    TARGETS["${name}.${key}"]="${value}"

}
config:targets:fill () {

    local name="${1:-}" key="${2:-}" old="" index=0

    (( $# >= 2 )) || { core:error:fail "A target and a key are required"; return; }

    shift 2

    for old in "$@"; do
        [[ -n "${old}" && "${old}" != *[[:space:][:cntrl:]]* ]] || { core:error:fail "[deps] ${name}: ${key} holds an empty or spaced word"; return; }
    done

    config:targets:set "${name}" "${key}" "$#" || return

    for old in "${!TARGETS[@]}"; do
        [[ "${old}" != "${name}.${key}."* ]] || unset "TARGETS[${old}]"
    done

    for old in "$@"; do
        TARGETS["${name}.${key}.${index}"]="${old}"
        index=$(( index + 1 ))
    done

}
config:targets:link () {

    local name="${1:-}" index=0

    (( $# >= 1 && ( $# - 1 ) % 2 == 0 )) || { core:error:fail "[deps] a target, then a name and a repository for every dependency"; return; }

    shift

    for index in "$@"; do
        [[ -n "${index}" && "${index}" != *[[:space:][:cntrl:]]* ]] || { core:error:fail "[deps] ${name}: a dependency is a name and a repository, each one word"; return; }
    done

    index=0

    config:targets:fill "${name}" deps || return

    TARGETS["${name}.deps"]=$(( $# / 2 ))

    while (( $# > 0 )); do

        TARGETS["${name}.deps.${index}.name"]="${1}"
        TARGETS["${name}.deps.${index}.repo"]="${2}"

        index=$(( index + 1 ))
        shift 2

    done

}
config:targets:address () {

    local spec="${1:-}" address=""

    address="$(core:git:resolve "${spec}" "${TOOL_ROOT:-}" 2>/dev/null)" || { core:log:print "${spec}"; return 0; }

    [[ "${address}" != /* ]] || { core:log:print "${address}"; return 0; }

    address="$(core:git:address "https://${address}" 2>/dev/null)" || { core:log:print "${spec}"; return 0; }

    core:log:print "https://${address}"

}
config:targets:settle () {

    local name="" key="" spec=""
    local -A known=()

    while IFS= read -r name; do

        spec="${TARGETS[${name}.repo]:-}"

        [[ -n "${spec}" || -z "${TARGETS[${name}.owner]:-}" ]] || spec="${TARGETS[${name}.owner]%/}/${TARGETS[${name}.name]:-${name}}"
        [[ -n "${spec}" ]] || continue

        [[ -n "${known[${spec}]+x}" ]] || known["${spec}"]="$(config:targets:address "${spec}")"

        TARGETS["${name}.repo"]="${known[${spec}]}"

    done < <(config:targets:list)

    for key in "${!TARGETS[@]}"; do

        [[ "${key}" == *.deps.*.repo ]] || continue

        spec="${TARGETS[${key}]}"
        [[ -n "${spec}" ]] || continue

        [[ -n "${known[${spec}]+x}" ]] || known["${spec}"]="$(config:targets:address "${spec}")"

        TARGETS["${key}"]="${known[${spec}]}"

    done

}
config:targets:list () {

    local key=""

    for key in "${!TARGETS[@]}"; do
        [[ "${key}" == *.* ]] || core:log:print "${key}"
    done | sort

}
config:targets:get () {

    local name="${1:-}" key="${2:-}"

    [[ -n "${name}" && -n "${TARGETS[${name}]+x}" ]] || { core:error:fail "Unknown target: ${name}; see targets"; return; }

    case "${key}" in
        tag|logo|owner) core:log:print "${TARGETS[${name}.${key}]:-}"; return 0 ;;
        branch) core:log:print "${TARGETS[${name}.branch]:-$(core:git:trunk "${TOOL_ROOT:-}")}"; return 0 ;;
    esac

    [[ -n "${TARGETS[${name}.${key}]+x}" ]] || { core:error:fail "Target ${name} has no ${key}"; return; }

    core:log:print "${TARGETS[${name}.${key}]}"

}
config:targets:deps () {

    local name="${1}" count=0 index=0 repo="" label=""

    count="${TARGETS[${name}.deps]:-0}"
    core:num:natural "${count}" || return 0

    while (( index < count )); do

        repo="${TARGETS[${name}.deps.${index}.repo]:-}"
        label="${TARGETS[${name}.deps.${index}.name]:-}"

        if [[ -z "${label}" ]]; then

            label="${repo%/}"
            label="${label%.git}"
            label="${label##*/}"

        fi

        printf '%s\t%s\t%s\n' "${label:--}" "${repo:--}" "${TARGETS[${name}.deps.${index}.tag]:-}"

        index=$(( index + 1 ))

    done

}
config:targets:engines () {

    local name="${1}" count=0 index=0

    count="${TARGETS[${name}.engines]:-0}"
    core:num:natural "${count}" || return 0

    while (( index < count )); do

        core:log:print "${TARGETS[${name}.engines.${index}]:-}"

        index=$(( index + 1 ))

    done

}
