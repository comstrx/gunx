module:notify:email:ready () {

    [[ -n "${CONFIG[NOTIFY_EMAIL_SMTP_URL]:-}${CONFIG[NOTIFY_EMAIL_TO]:-}" ]]

}
module:notify:email:check () {

    local rcpt=""
    local -a rcpts=()

    [[ "${CONFIG[NOTIFY_EMAIL_SMTP_URL]:-}" =~ ^smtps?://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] \
        || { @err "NOTIFY_EMAIL_SMTP_URL must be smtps://host[:port] or smtp://host[:port] (STARTTLS)"; return; }

    core:validate:email "${CONFIG[NOTIFY_EMAIL_FROM]:-}" || { @err "NOTIFY_EMAIL_FROM must be a mail address"; return; }

    core:str:split rcpts "${CONFIG[NOTIFY_EMAIL_TO]:-}" ,
    (( ${#rcpts[@]} > 0 )) || { @err "NOTIFY_EMAIL_TO needs one address at least"; return; }

    for rcpt in "${rcpts[@]}"; do
        core:validate:email "$(core:str:trim "${rcpt}")" || { @err "NOTIFY_EMAIL_TO holds a bad address: ${rcpt}"; return; }
    done

    [[ -z "${CONFIG[NOTIFY_EMAIL_PASSWORD]:-}" || -n "${CONFIG[NOTIFY_EMAIL_USER]:-}" ]] \
        || { @err "NOTIFY_EMAIL_PASSWORD needs NOTIFY_EMAIL_USER"; return; }

}
module:notify:email:subject () {

    local subject="${1}" encoded=""

    subject="${subject//[$'\r\n']/ }"

    [[ "${subject}" == *[![:ascii:]]* ]] || { @print "${subject}"; return 0; }

    core:sys:need base64 || return
    encoded="$(printf '%s' "${subject}" | base64 | tr -d '\n')" || { @err "Cannot encode the subject"; return; }

    @print "=?UTF-8?B?${encoded}?="

}
module:notify:email:message () {

    local -n _event="${1}"
    local subject="" domain="${CONFIG[NOTIFY_EMAIL_FROM]##*@}" to="" stamp=""

    subject="$(module:notify:email:subject "${_event[message]%%$'\n'*}")" || return
    to="${CONFIG[NOTIFY_EMAIL_TO]//[[:space:]]/}"

    printf -v stamp '%(%a, %d %b %Y %H:%M:%S %z)T' -1

    printf 'From: %s\nTo: %s\nSubject: %s\nDate: %s\nMessage-ID: <%s.%s@%s>\n' \
        "${CONFIG[NOTIFY_EMAIL_FROM]}" "${to//,/, }" "${subject}" "${stamp}" "$(core:sys:now)" "$$" "${domain}"

    printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n\n%s\n' "${_event[message]}"

}
module:notify:email:send () {

    local name="${1}" message="" status=0 rcpt=""
    local -a rcpts=() trimmed=()

    message="$(core:fs:temp:file)" || return

    LC_ALL=C module:notify:email:message "${name}" > "${message}" || { rm -f -- "${message}"; @err "Cannot write the mail"; return; }

    core:str:split rcpts "${CONFIG[NOTIFY_EMAIL_TO]}" ,

    for rcpt in "${rcpts[@]}"; do
        trimmed+=( "$(core:str:trim "${rcpt}")" )
    done

    core:net:mail "${CONFIG[NOTIFY_EMAIL_SMTP_URL]}" "${CONFIG[NOTIFY_EMAIL_USER]:-}" "${CONFIG[NOTIFY_EMAIL_PASSWORD]:-}" \
        "${CONFIG[NOTIFY_EMAIL_FROM]}" "${message}" "${trimmed[@]}" || status=$?

    rm -f -- "${message}"

    return "${status}"

}
