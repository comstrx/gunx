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

    local text=""

    core:log:scrub text "${1-}"

    printf '%s' "${text}"

}
core:log:scrub () {

    local -n _clean="${1}"
    local _line="${2-}" _key="" _secret=""

    if declare -p CONFIG >/dev/null 2>&1; then

        for _key in "${!CONFIG[@]}"; do

            core:log:secret "${_key}" || continue

            _secret="${CONFIG[${_key}]}"
            [[ -z "${_secret}" ]] || _line="${_line//"${_secret}"/[redacted]}"

        done

    fi

    _line="${_line//$'\e'/^[}"
    _line="${_line//$'\r'/^M}"

    _clean="${_line}"

}
core:log:color () {

    [[ -z "${NO_COLOR:-}" ]] || return 1
    [[ -z "${FORCE_COLOR:-}" ]] || return 0

    [[ -t 2 && "${TERM:-dumb}" != dumb ]]

}
core:log:level () {

    local -n _rank="${1}"

    case "${LOG_LEVEL:-${CONFIG[LOG_LEVEL]:-${CONFIG_BASE[LOG_LEVEL]}}}" in
        debug) _rank=0 ;;
        info)  _rank=1 ;;
        warn)  _rank=2 ;;
        error) _rank=3 ;;
        *)     _rank=1 ;;
    esac

}
core:log:emit () {

    local color="${1}" tag="${2}" rank="${3}" text="" icon="" floor=1

    shift 3
    core:log:level floor
    (( rank >= floor )) || return 0

    core:log:scrub text "$*"

    if ! core:log:color; then printf '%s %s\n' "${tag}" "${text}" >&2
    elif [[ "${tag}" == '[.]' ]]; then printf '  \033[%sm%s\033[0m\n' "${color}" "${text}" >&2
    else core:log:glyph icon "${tag}"; printf '  \033[1;%sm%s\033[0m  %s\n' "${color}" "${icon}" "${text}" >&2
    fi

    return 0

}
core:log:icon () {

    local icon=""

    core:log:glyph icon "${1}"

    core:log:print "${icon}"

}
core:log:glyph () {

    local -n _icon="${1}"

    _icon="${2}"

    [[ "${LANG:-}${LC_ALL:-}" == *[Uu][Tt][Ff]-8* || "${LANG:-}${LC_ALL:-}" == *[Uu][Tt][Ff]8* ]] || return 0

    case "${2}" in
        '[+]') _icon='✓' ;;
        '[-]') _icon='✗' ;;
        '[!]') _icon='▲' ;;
        '[*]') _icon='●' ;;
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
