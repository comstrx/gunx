module:notify:slack:ready () {

    [[ -n "${CONFIG[NOTIFY_SLACK_WEBHOOK_URL]:-}" ]]

}
module:notify:slack:check () {

    core:validate:url "${CONFIG[NOTIFY_SLACK_WEBHOOK_URL]}" || { @err "NOTIFY_SLACK_WEBHOOK_URL must be an https URL"; return; }

}
module:notify:slack:send () {

    local -n _event="${1}"
    local text="" body=""

    text="$(module:notify:clip "${_event[message]}" 3900)"
    text="${text//&/"&amp;"}"
    text="${text//</"&lt;"}"
    text="${text//>/"&gt;"}"

    body="$(core:json:object text "$(core:json:string "${text}")")" || return

    core:net:json POST "${CONFIG[NOTIFY_SLACK_WEBHOOK_URL]}" "${body}" >/dev/null

}
