declare -gA TARGETS=()

config:targets:load () {

    local key=""

    TARGETS=()

    for key in "${!MANIFEST[@]}"; do
        [[ "${key}" != deps.* ]] || TARGETS["${key#deps.}"]="${MANIFEST[${key}]}"
    done

    for key in "${!TARGETS[@]}"; do
        [[ "${key}" != *.type || "${key}" == *.*.* ]] || TARGETS["${key%.type}"]="${TARGETS[${key%.type}]:-1}"
    done

    for key in "${!TARGETS[@]}"; do

        [[ "${key}" != *.*.* && "${key}" == *.path ]] || continue

        core:fs:path:relative "${TARGETS[${key}]}" \
            || { core:error:fail "[deps] ${key%.path} must name a path inside the root: ${TARGETS[${key}]}"; return; }

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
        tag)    core:log:print "${TARGETS[${name}.tag]:-}"; return 0 ;;
        logo)   core:log:print "${TARGETS[${name}.logo]:-}"; return 0 ;;
        branch) core:log:print "${TARGETS[${name}.branch]:-$(core:git:trunk "${TOOL_ROOT:-}")}"; return 0 ;;
    esac

    [[ -n "${TARGETS[${name}.${key}]+x}" ]] || { core:error:fail "Target ${name} has no ${key}"; return; }

    core:log:print "${TARGETS[${name}.${key}]}"

}
config:targets:deps () {

    local name="${1}" count=0 index=0

    count="${TARGETS[${name}.deps]:-0}"
    core:num:natural "${count}" || return 0

    while (( index < count )); do

        printf '%s\t%s\t%s\n' "${TARGETS[${name}.deps.${index}.name]:-}" \
            "${TARGETS[${name}.deps.${index}.repo]:-}" "${TARGETS[${name}.deps.${index}.tag]:-}"

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
