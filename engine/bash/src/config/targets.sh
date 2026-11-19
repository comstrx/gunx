declare -gA TARGETS=()
declare -ga TARGETS_KEYS=( name type owner repo path refs engines logo branch tag )
declare -ga TARGETS_REF=( src repo tag )

config:targets:load () {

    local key="" name=""

    TARGETS=()

    for key in "${!MANIFEST[@]}"; do
        [[ "${key}" != deps.* || "${key}" == deps. ]] || TARGETS["${key#deps.}"]="${MANIFEST[${key}]}"
    done

    for key in "${!TARGETS[@]}"; do

        name="${key%%.*}"

        config:targets:named "${name}" || return
        config:targets:known "${name}" "${key#"${name}"}" || return

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
config:targets:known () {

    local name="${1}" rest="${2#.}" key="" field=""

    [[ -n "${rest}" ]] || return 0

    key="${rest%%.*}"

    core:list:has "${key}" "${TARGETS_KEYS[@]}" || { core:error:fail "[deps] ${name}: unknown key ${key}; a row holds ${TARGETS_KEYS[*]}"; return; }

    [[ "${key}" == refs && "${rest}" == refs.*.* ]] || return 0

    field="${rest##*.}"

    core:list:has "${field}" "${TARGETS_REF[@]}" || { core:error:fail "[deps] ${name}: unknown key ${field} in refs; a reference holds ${TARGETS_REF[*]}"; return; }

}
config:targets:inside () {

    core:fs:path:relative "${2:-}" || { core:error:fail "[deps] ${1:-} must name a path inside the root: ${2:-}"; return; }

}
config:targets:has () {

    [[ -n "${1:-}" && -n "${TARGETS[${1}]+x}" ]]

}
config:targets:open () {

    config:targets:named "${1:-}" || return

    TARGETS["${1}"]="${TARGETS[${1}]:-1}"

}
config:targets:set () {

    local name="${1:-}" key="${2:-}" value="${3-}"

    config:targets:named "${name}" || return

    core:list:has "${key}" "${TARGETS_KEYS[@]}" || { core:error:fail "[deps] ${name}: unknown key ${key}; a row holds ${TARGETS_KEYS[*]}"; return; }
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

    local name="${1:-}" index=0 word=""

    (( $# >= 1 && ( $# - 1 ) % 2 == 0 )) || { core:error:fail "[deps] a target, then a path and a repository for every reference"; return; }

    shift

    for word in "$@"; do
        [[ -n "${word}" && "${word}" != *[[:space:][:cntrl:]]* ]] || { core:error:fail "[deps] ${name}: a reference is a path and a repository, each one word"; return; }
    done

    for (( index = 1; index <= $#; index += 2 )); do
        config:targets:inside "${name}" "${!index}" || return
    done

    config:targets:fill "${name}" refs || return

    TARGETS["${name}.refs"]=$(( $# / 2 ))
    index=0

    while (( $# > 0 )); do

        TARGETS["${name}.refs.${index}.src"]="${1}"
        TARGETS["${name}.refs.${index}.repo"]="${2}"

        index=$(( index + 1 ))
        shift 2

    done

}
config:targets:address () {

    core:git:resolve "${1:-}" "${TOOL_ROOT:-}" 2>/dev/null || core:log:print "${1:-}"

}
config:targets:settle () {

    local name="" key="" repo="" owner="" label=""
    local -A addresses=()

    while IFS= read -r name; do

        repo="${TARGETS[${name}.repo]:-}"
        owner="${TARGETS[${name}.owner]:-}"
        owner="${owner%/}"
        label="${TARGETS[${name}.name]:-}"

        if [[ -z "${repo}" ]]; then repo="${owner:+${owner}/${label:-${name}}}"
        elif [[ -n "${owner}" && "${repo}" != */* && "${repo}" != *:* ]]; then repo="${owner}/${repo}"
        fi

        if [[ -n "${repo}" ]]; then

            [[ -n "${addresses[${repo}]+x}" ]] || addresses["${repo}"]="$(config:targets:address "${repo}")"

            repo="${addresses[${repo}]}"

            [[ -n "${label}" ]] || label="$(core:git:leaf "${repo}")"
            if [[ -z "${owner}" && "${repo%/}" == */* ]]; then

                owner="${repo%/}"
                owner="${owner%/*}"

            fi

            TARGETS["${name}.repo"]="${repo}"

        fi

        TARGETS["${name}.name"]="${label:-${name}}"

        [[ -z "${owner}" ]] || TARGETS["${name}.owner"]="${owner}"

    done < <(config:targets:list)

    for key in "${!TARGETS[@]}"; do

        if [[ "${key}" == *.refs.*.src ]]; then TARGETS["${key}"]="${TARGETS[${key}]%/}"; continue; fi

        [[ "${key}" == *.refs.*.repo ]] || continue

        repo="${TARGETS[${key}]}"
        name="${key%%.*}"

        [[ -n "${repo}" ]] || continue

        if [[ "${repo}" != */* && "${repo}" != *:* ]]; then

            owner="${TARGETS[${name}.owner]:-}"

            [[ -n "${owner}" ]] \
                || { core:error:fail "[deps] ${name}: ${repo} names no owner; give the row an owner or a repo, or write owner/${repo}"; return; }

            repo="${owner}/${repo}"

        fi

        [[ -n "${addresses[${repo}]+x}" ]] || addresses["${repo}"]="$(config:targets:address "${repo}")"

        TARGETS["${key}"]="${addresses[${repo}]}"

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
        tag|logo|owner|repo) core:log:print "${TARGETS[${name}.${key}]:-}"; return 0 ;;
        name)                core:log:print "${TARGETS[${name}.name]:-${name}}"; return 0 ;;
        branch) core:log:print "${TARGETS[${name}.branch]:-$(core:git:trunk "${TOOL_ROOT:-}")}"; return 0 ;;
    esac

    [[ -n "${TARGETS[${name}.${key}]+x}" ]] || { core:error:fail "Target ${name} has no ${key}"; return; }

    core:log:print "${TARGETS[${name}.${key}]}"

}
config:targets:refs () {

    local name="${1}" count=0 index=0

    count="${TARGETS[${name}.refs]:-0}"
    core:num:natural "${count}" || return 0

    while (( index < count )); do

        printf '%s\t%s\t%s\n' "${TARGETS[${name}.refs.${index}.src]:--}" "${TARGETS[${name}.refs.${index}.repo]:--}" "${TARGETS[${name}.refs.${index}.tag]:-}"

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
