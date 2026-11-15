module:notify:event () {

    local status="${1:-info}" title="${2:-}" text="${3:-}" link="${4:-}" seconds="${5:-}" icon="" head=""

    case "${status}" in
        passed)    icon='✅' ;;
        failed)    icon='❌' ;;
        timed-out) icon='⏱️' ;;
        warn)      icon='⚠️' ;;
        info)      icon='ℹ️' ;;
        *)         @err "Unknown status: ${status}; one of passed, failed, timed-out, warn, info"; return ;;
    esac

    [[ -z "${link}" ]] || core:validate:url "${link}" || { @err "A link is an https URL: $(core:net:host "${link}")"; return; }
    [[ -z "${seconds}" ]] || core:num:natural "${seconds}" || { @err "Seconds must be a number: ${seconds}"; return; }

    head="${icon} ${title:-${CONFIG[PROJECT]:-${MANIFEST[meta.name]:-run}}} ${status}"

    [[ -z "${CONFIG[RELEASE]:-}" ]] || head+=" · ${CONFIG[RELEASE]}"
    [[ -z "${seconds}" ]] || head+=" in $(module:notify:duration "${seconds}")"

    printf '%s' "${head}"
    [[ -z "${text}" ]] || printf '\n\n%s' "${text}"
    [[ -z "${link}" ]] || printf '\n\n%s' "${link}"
    printf '\n'

}
module:notify:duration () {

    local seconds="${1:-0}" text=""

    (( seconds < 3600 )) || text+="$(( seconds / 3600 ))h"
    (( seconds < 60 )) || text+="$(( seconds % 3600 / 60 ))m"

    @print "${text}$(( seconds % 60 ))s"

}
module:notify:clip () {

    local text="${1-}" limit="${2:-4000}"

    (( ${#text} > limit )) || { @print "${text}"; return 0; }

    @print "${text:0:limit - 1}…"

}
