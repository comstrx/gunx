declare -ga NOTIFY_CHANNELS=( telegram slack discord webhook email )

module:notify:run () {

    local status="" title="" link="" seconds=""

    (( $# > 0 )) || { core:error:usage "notify TEXT"; return; }

    status="$(core:cli:value --status)" || status=info
    title="$(core:cli:value --title)" || title=""
    link="$(core:cli:value --link)" || link=""
    seconds="$(core:cli:value --seconds)" || seconds=""

    module:notify:send "${status}" "${title}" "$*" "${link}" "${seconds}"

}
module:notify:send () {

    local channel="" faulty=0 any=0 row=""
    local -A event=( [status]="${1:-info}" [title]="${2:-}" [text]="${3:-}" [link]="${4:-}" [seconds]="${5:-}" )
    local -a rows=()

    event[message]="$(module:notify:event "${event[status]}" "${event[title]}" "${event[text]}" "${event[link]}" "${event[seconds]}")" || return

    for channel in "${NOTIFY_CHANNELS[@]}"; do
        ! "module:notify:${channel}:ready" || "module:notify:${channel}:check" || faulty=1
    done

    (( faulty == 0 )) || { @err "The notify settings were refused; nothing was sent"; return; }

    for channel in "${NOTIFY_CHANNELS[@]}"; do

        "module:notify:${channel}:ready" || { rows+=( "${channel}"$'\t'off ); continue; }

        any=1

        if "module:notify:${channel}:send" event; then rows+=( "${channel}"$'\t'sent )
        else rows+=( "${channel}"$'\t'failed ); faulty=1
        fi

    done

    (( any == 1 )) || { @warn "No notify channel is configured; see the NOTIFY_ settings"; return 0; }

    for row in "${rows[@]}"; do
        @print "${row}"
    done | core:ui:table

    (( faulty == 0 )) || { @err "A notify channel failed; the others above stand as reported"; return; }

}
