declare -gA CONFIG=() CONFIG_SOURCE=() CONFIG_DEFAULTS=()
declare -ga CONFIG_KEYS=()

core:cfg:has () {

    core:validate:key "${1:-}" && [[ -n "${CONFIG[${1}]+x}" ]]

}
core:cfg:set () {

    local key="${1:-}" value="${2-}" origin="${3:-derived}"

    core:validate:key "${key}" || { core:error:fail "Invalid setting name: ${key}"; return; }
    [[ -n "${CONFIG[${key}]+x}" ]] || CONFIG_KEYS+=( "${key}" )

    CONFIG["${key}"]="${value}"
    CONFIG_SOURCE["${key}"]="${origin}"

}
core:cfg:default () {

    local key="${1}" value="${2-}"

    core:cfg:set "${key}" "${value}" default || return

    CONFIG_DEFAULTS["${key}"]="${value}"

}
core:cfg:show () {

    local key="${1:-}"

    core:cfg:has "${key}" || { core:error:fail "Unknown setting: ${key}"; return; }

    if [[ -n "${CONFIG[${key}]}" ]] && core:log:secret "${key}"; then core:log:print '[redacted]'
    else core:log:print "${CONFIG[${key}]}"
    fi

}
core:cfg:load () {

    local file="${1}" policy="${2:-known}" origin="${3:-file}" key=""

    local -A pairs=()
    local -a order=()

    core:parse:env pairs order "${file}" || return

    for key in "${order[@]}"; do
        [[ "${policy}" != known ]] || core:cfg:has "${key}" || { core:error:fail "Unknown setting in ${file}: ${key}"; return; }
    done

    for key in "${order[@]}"; do
        core:cfg:set "${key}" "${pairs[${key}]}" "${origin}" || return
    done

}
core:cfg:environment () {

    local key=""

    for key in "${CONFIG_KEYS[@]}"; do
        [[ -z "${!key+x}" ]] || core:cfg:set "${key}" "${!key}" process || return
    done

}
core:cfg:overrides () {

    local pair=""

    for pair in "$@"; do

        core:cfg:has "${pair%%=*}" || { core:error:fail "Unknown setting: ${pair%%=*}"; return; }
        core:cfg:set "${pair%%=*}" "${pair#*=}" cli || return

    done

}
core:cfg:require () {

    local key="" failed=0

    for key in "$@"; do
        [[ -n "${CONFIG[${key}]:-}" ]] || { core:error:fail "Missing setting: ${key}" || failed=1; }
    done

    (( failed == 0 ))

}
core:cfg:number () {

    local key="${1}" low="${2:-0}" high="${3:-}"

    if ! core:num:natural "${CONFIG[${key}]:-}" || ! core:num:between "${CONFIG[${key}]}" "${low}" "${high}"; then
        core:error:fail "${key} must be a number from ${low}${high:+ to ${high}}"
        return
    fi

}
