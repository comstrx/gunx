declare -gA TARGETS=()

config:targets:load () {

    local file="" key=""
    local -A table=()

    TARGETS=()

    if [[ -f "${TOOL_ROOT}/infra.toml" && ( "${TOOL_BUNDLED:-false}" == true || "${TOOL_ROOT}" != "${TOOL_ENGINE}" ) ]]; then
        core:parse:toml table "${TOOL_ROOT}/infra.toml" || return
    fi

    for key in "${!table[@]}"; do
        [[ "${key}" != deps.* ]] || TARGETS["${key#deps.}"]="${table[${key}]}"
    done

    (( ${#TARGETS[@]} == 0 )) || return 0

    for key in "${!MANIFEST[@]}"; do
        [[ "${key}" != deps.* ]] || TARGETS["${key#deps.}"]="${MANIFEST[${key}]}"
    done

}
config:targets:list () {

    local key=""

    for key in "${!TARGETS[@]}"; do
        [[ "${key}" == *.* ]] || core:log:print "${key}"
    done | sort

}
config:targets:title () {

    local name="${1}" title=""

    title="${name^}"
    [[ "${title}" != *x ]] || title="${title%x}X"

    core:log:print "${title}"

}
config:targets:get () {

    local name="${1:-}" key="${2:-}"

    [[ -n "${TARGETS[${name}]+x}" ]] || { core:error:fail "Unknown target: ${name}; see targets"; return; }

    case "${key}" in
        tag)   core:log:print "${TARGETS[${name}.tag]:-inherit}"; return 0 ;;
        title) [[ -n "${TARGETS[${name}.title]+x}" ]] || { config:targets:title "${name}"; return; } ;;
    esac

    [[ -n "${TARGETS[${name}.${key}]+x}" ]] || { core:error:fail "Target ${name} has no ${key}"; return; }

    core:log:print "${TARGETS[${name}.${key}]}"

}
config:targets:deps () {

    local name="${1}" count=0 index=0

    count="${TARGETS[${name}.deps]:-0}"

    while (( index < count )); do

        printf '%s\t%s\t%s\n' "${TARGETS[${name}.deps.${index}.name]:-}" \
            "${TARGETS[${name}.deps.${index}.repo]:-}" "${TARGETS[${name}.deps.${index}.tag]:-inherit}"

        index=$(( index + 1 ))

    done

}
config:targets:product () {

    local root="${1}" project="${2}" file=""
    local -A table=()

    file="$(config:manifest:file "${root}/product/${project}/infra")" || return
    core:parse:toml table "${file}" || return

    [[ -n "${table[meta.repo]+x}" ]] || { core:error:fail "product/${project}/infra has no [meta] repo"; return; }

    core:log:print "${table[meta.repo]}"

}
