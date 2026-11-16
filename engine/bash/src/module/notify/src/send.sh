declare -ga NOTIFY_CHANNELS=( telegram slack discord webhook email )

module:notify:run () {

    local status="" title="" message="" link="" seconds="" channels="" retry="" timeout=""

    (( $# == 0 )) || { core:error:usage "notify takes no argument; the text goes in --message"; return; }
    ! core:cli:given --seconds || ! core:cli:given --sec || { core:error:usage "--sec is --seconds; give one of them"; return; }

    status="$(core:cli:value --status)" || status=""
    title="$(core:cli:value --title)" || title=""
    message="$(core:cli:value --message)" || message=""
    link="$(core:cli:value --link)" || link=""
    seconds="$(core:cli:value --seconds)" || seconds="$(core:cli:value --sec)" || seconds=""
    channels="$(core:cli:value --channel)" || channels=""
    retry="$(core:cli:value --retry)" || retry=""
    timeout="$(core:cli:value --timeout)" || timeout=""

    module:notify:send "${status}" "${title}" "${message}" "${link}" "${seconds}" "${channels}" "${retry}" "${timeout}"

}
module:notify:pick () {

    local -n _picked="${1}"
    local wanted="${2//[[:space:]]/}" name=""
    local -a names=()

    _picked=()

    if [[ -z "${wanted}" ]]; then

        for name in "${NOTIFY_CHANNELS[@]}"; do
            ! "module:notify:${name}:ready" || _picked+=( "${name}" )
        done

        return 0

    fi

    core:str:split names "${wanted}" ,

    for name in "${names[@]}"; do

        [[ -n "${name}" ]] || continue

        core:list:has "${name}" "${NOTIFY_CHANNELS[@]}" || { @err "Unknown channel: ${name}; one of ${NOTIFY_CHANNELS[*]}"; return; }
        "module:notify:${name}:ready" || { @err "${name} is asked for but its NOTIFY_ settings are empty"; return; }

        core:list:has "${name}" "${_picked[@]}" || _picked+=( "${name}" )

    done

    (( ${#_picked[@]} > 0 )) || { @err "--channel names no channel"; return; }

}
module:notify:send () {

    local channel="" faulty=0 row="" NET_TRIES="${7:-}" NET_SECONDS="${8:-}"
    local -A event=() context=()
    local -a rows=() picked=()

    [[ -z "${NET_TRIES}" ]] || core:num:between "${NET_TRIES}" 1 10 || { @err "--retry is 1 to 10 tries: ${NET_TRIES}"; return; }
    [[ -z "${NET_SECONDS}" ]] || core:num:between "${NET_SECONDS}" 1 || { @err "--timeout is whole seconds above 0: ${NET_SECONDS}"; return; }

    core:sys:context context "${TOOL_ROOT}"

    event[status]="$(module:notify:status "${1:-passed}")"
    event[title]="${2:-}"
    event[text]="${3:-}"
    event[link]="${4:-${context[link]:-}}"
    event[seconds]="${5:-}"

    if [[ -z "${event[title]}" ]]; then

        event[title]="${CONFIG[PROJECT]:-${context[repo]##*/}}"
        event[title]="${event[title]:-${MANIFEST[meta.name]:-run}}${context[workflow]:+ ${context[workflow]}}"

    fi

    [[ -n "${event[text]}" ]] || event[text]="$(module:notify:story context)"

    event[message]="$(module:notify:event "${event[status]}" "${event[title]}" "${event[text]}" "${event[link]}" "${event[seconds]}")" || return

    module:notify:pick picked "${6:-}" || return

    (( ${#picked[@]} > 0 )) || { @warn "No notify channel is configured; see the NOTIFY_ settings"; return 0; }

    for channel in "${picked[@]}"; do
        "module:notify:${channel}:check" || faulty=1
    done

    (( faulty == 0 )) || { @err "The notify settings were refused; nothing was sent"; return; }

    module:notify:install || return

    for channel in "${NOTIFY_CHANNELS[@]}"; do

        core:list:has "${channel}" "${picked[@]}" || { rows+=( "${channel}"$'\t'off ); continue; }

        if "module:notify:${channel}:send" event; then rows+=( "${channel}"$'\t'sent )
        else rows+=( "${channel}"$'\t'failed ); faulty=1
        fi

    done

    for row in "${rows[@]}"; do
        @print "${row}"
    done | core:ui:table

    (( faulty == 0 )) || { @err "A notify channel failed; the others above stand as reported"; return; }

}
