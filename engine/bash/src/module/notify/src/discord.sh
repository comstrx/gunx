module:notify:discord:ready () {

    [[ -n "${CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]:-}" ]]

}
module:notify:discord:check () {

    core:validate:url "${CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]}" || { @err "NOTIFY_DISCORD_WEBHOOK_URL must be an https URL"; return; }

}
module:notify:discord:send () {

    local -n _event="${1}"
    local text="" body=""

    text="$(module:notify:clip "${_event[message]}" 2000)"

    body="$(core:json:object \
        content "$(core:json:string "${text}")" \
        allowed_mentions "$(core:json:object parse "$(core:json:array)")" \
        flags 4)" || return

    core:net:json POST "${CONFIG[NOTIFY_DISCORD_WEBHOOK_URL]}" "${body}" >/dev/null

}
