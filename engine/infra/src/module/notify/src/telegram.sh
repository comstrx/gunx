module:notify:telegram:ready () {

    [[ -n "${CONFIG[NOTIFY_TELEGRAM_TOKEN]:-}${CONFIG[NOTIFY_TELEGRAM_CHAT]:-}" ]]

}
module:notify:telegram:check () {

    [[ "${CONFIG[NOTIFY_TELEGRAM_TOKEN]:-}" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]] \
        || { @err "NOTIFY_TELEGRAM_TOKEN must be a bot token (digits:secret)"; return; }

    [[ "${CONFIG[NOTIFY_TELEGRAM_CHAT]:-}" =~ ^(-?[0-9]+|@[A-Za-z0-9_]{5,})$ ]] \
        || { @err "NOTIFY_TELEGRAM_CHAT must be a chat id or an @channel"; return; }

}
module:notify:telegram:send () {

    local -n _event="${1}"
    local text="" body=""

    text="$(module:notify:clip "${_event[message]}" 4000)"

    body="$(core:json:object \
        chat_id "$(core:json:string "${CONFIG[NOTIFY_TELEGRAM_CHAT]}")" \
        text "$(core:json:string "${text}")" \
        link_preview_options "$(core:json:object is_disabled true)")" || return

    core:net:json POST "https://api.telegram.org/bot${CONFIG[NOTIFY_TELEGRAM_TOKEN]}/sendMessage" "${body}" >/dev/null

}
