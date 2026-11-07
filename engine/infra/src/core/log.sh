core:log:print () {

    printf '%s\n' "$@"

}
core:log:secret () {

    case "${1-}" in
        *PASSWORD*|*SECRET*|*TOKEN*|*CREDENTIAL*|*WEBHOOK_URL|*_KEY|*_KEYS) return 0 ;;
    esac

    return 1

}
core:log:redact () {

    local text="${1-}" key="" value=""

    declare -p CONFIG >/dev/null 2>&1 || { printf '%s' "${text}"; return 0; }

    for key in "${!CONFIG[@]}"; do

        core:log:secret "${key}" || continue

        value="${CONFIG[${key}]}"
        [[ -z "${value}" ]] || text="${text//"${value}"/[redacted]}"

    done

    printf '%s' "${text}"

}
core:log:color () {

    [[ -z "${NO_COLOR:-}" ]] || return 1
    [[ -z "${FORCE_COLOR:-}" ]] || return 0

    [[ -t 2 && "${TERM:-dumb}" != dumb ]]

}
core:log:level () {

    local -n _rank="${1}"

    case "${LOG_LEVEL:-${CONFIG[LOG_LEVEL]:-info}}" in
        debug) _rank=0 ;;
        info)  _rank=1 ;;
        warn)  _rank=2 ;;
        error) _rank=3 ;;
        *)     _rank=1 ;;
    esac

}
core:log:emit () {

    local color="${1}" tag="${2}" rank="${3}" text="" floor=1

    shift 3
    core:log:level floor
    (( rank >= floor )) || return 0

    text="$(core:log:redact "$*")"

    if ! core:log:color; then printf '%s %s\n' "${tag}" "${text}" >&2
    elif [[ "${tag}" == '[.]' ]]; then printf '  \033[%sm%s\033[0m\n' "${color}" "${text}" >&2
    else printf '  \033[1;%sm%s\033[0m  %s\n' "${color}" "$(core:log:icon "${tag}")" "${text}" >&2
    fi

    return 0

}
core:log:icon () {

    [[ "${LANG:-}${LC_ALL:-}" == *[Uu][Tt][Ff]-8* || "${LANG:-}${LC_ALL:-}" == *[Uu][Tt][Ff]8* ]] || { core:log:print "${1}"; return 0; }

    case "${1}" in
        '[+]') core:log:print '✓' ;;
        '[-]') core:log:print '✗' ;;
        '[!]') core:log:print '▲' ;;
        '[*]') core:log:print '●' ;;
        *)     core:log:print "${1}" ;;
    esac

}
core:log:fail () {

    core:log:emit '38;5;196' '[-]' 3 "$*"

}
core:log:debug () {

    core:log:emit '38;5;245' '[.]' 0 "$*"

}
core:log:info () {

    core:log:emit '38;5;33' '[*]' 1 "$*"

}
core:log:succ () {

    core:log:emit '38;5;40' '[+]' 1 "$*"

}
core:log:warn () {

    core:log:emit '38;5;220' '[!]' 2 "$*"

}
