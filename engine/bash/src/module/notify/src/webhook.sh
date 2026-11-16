module:notify:webhook:ready () {

    [[ -n "${CONFIG[NOTIFY_WEBHOOK_URL]:-}" ]]

}
module:notify:webhook:check () {

    core:validate:url "${CONFIG[NOTIFY_WEBHOOK_URL]}" || { @err "NOTIFY_WEBHOOK_URL must be an https URL"; return; }

}
module:notify:webhook:send () {

    local -n _event="${1}"
    local body="" field=""
    local -a fields=() headers=()

    for field in status title text link; do
        fields+=( "${field}" "$(core:json:string "${_event[${field}]}")" )
    done

    fields+=( project "$(core:json:string "${CONFIG[PROJECT]:-}")" release "$(core:json:string "${CONFIG[RELEASE]:-}")" )
    fields+=( message "$(core:json:string "${_event[message]}")" seconds "${_event[seconds]:-null}" )

    body="$(core:json:object "${fields[@]}")" || return

    [[ -z "${CONFIG[NOTIFY_WEBHOOK_TOKEN]:-}" ]] || headers+=( "Authorization: Bearer ${CONFIG[NOTIFY_WEBHOOK_TOKEN]}" )

    core:net:json POST "${CONFIG[NOTIFY_WEBHOOK_URL]}" "${body}" "${headers[@]}" >/dev/null

}
