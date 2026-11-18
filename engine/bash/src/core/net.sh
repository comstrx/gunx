declare -g NET_STATUS=0 NET_SENT="" NET_CODE="" NET_TRIES="" NET_SECONDS=""

core:net:host () {

    local url="${1:-}" host=""

    host="${url#*://}"
    host="${host%%[/?#]*}"
    host="${host##*@}"

    core:log:print "${url%%://*}://${host}"

}
core:net:line () {

    local name="${1}" text="${2-}"

    text="${text//\\/\\\\}"
    text="${text//\"/\\\"}"
    text="${text//$'\n'/\\n}"
    text="${text//$'\r'/\\r}"
    text="${text//$'\t'/\\t}"

    printf '%s = "%s"\n' "${name}" "${text}"

}
core:net:config () {

    local method="${1}" url="${2}" output="${3}" payload="${4}" header=""

    shift 4

    core:net:line url "${url}"
    core:net:line request "${method}"
    core:net:line output "${output}"
    core:net:line proto =https
    core:net:line proto-redir =https
    core:net:line write-out '%{size_request} %{http_code}'

    printf 'location\n'
    core:net:common

    for header in "$@"; do
        core:net:line header "${header}"
    done

    [[ -z "${payload}" ]] || core:net:line data-binary "@${payload}"

}
core:net:common () {

    local seconds="${NET_SECONDS:-${CONFIG[RUN_TIMEOUT]:-${CONFIG_BASE[RUN_TIMEOUT]}}}"

    printf 'silent\nshow-error\ntlsv1.2\nmax-time = %s\nconnect-timeout = %s\n' "${seconds}" "$(( seconds < 30 ? seconds : 30 ))"

}
core:net:try () {

    local config="${1}" errors="${2}" label="${3}" url="${4}" metrics="" attempt=1 tries="${NET_TRIES:-${CONFIG[RUN_RETRIES]:-${CONFIG_BASE[RUN_RETRIES]}}}" delay=""

    while true; do

        NET_STATUS=0
        metrics="$(curl --disable --config "${config}" 2>"${errors}")" || NET_STATUS=$?

        NET_SENT="${metrics%% *}"
        NET_CODE="${metrics##* }"

        (( NET_STATUS != 0 )) && core:net:unsent && (( attempt < tries )) || return 0

        delay="$(core:proc:backoff "${CONFIG[RUN_BACKOFF]:-${CONFIG_BASE[RUN_BACKOFF]}}" "${attempt}")" || return 0

        core:log:warn "${label}: attempt ${attempt} of ${tries} never left ($(core:net:reason "${errors}" "${url}")); retrying in ${delay}s"
        sleep "${delay}"

        attempt=$(( attempt + 1 ))

    done

}
core:net:budget () {

    core:num:between "${NET_SECONDS:-${CONFIG[RUN_TIMEOUT]:-${CONFIG_BASE[RUN_TIMEOUT]}}}" 1 || {

        core:error:fail "A request budget is whole seconds above 0: ${NET_SECONDS}"
        return

    }
    core:num:between "${NET_TRIES:-${CONFIG[RUN_RETRIES]:-${CONFIG_BASE[RUN_RETRIES]}}}" 1 10 || {

        core:error:fail "A request is tried 1 to 10 times: ${NET_TRIES}"
        return

    }

}
core:net:unsent () {

    [[ "${NET_SENT}" == 0 ]] || return 1

    case "${NET_STATUS}" in
        5|6|7|28|35) return 0 ;;
        *)           return 1 ;;
    esac

}
core:net:send () {

    local method="${1:-}" url="${2:-}" body="${3-}" output="${4:-}" host="" config="" payload="" errors="" reason="" header=""

    shift "$(( $# < 4 ? $# : 4 ))"

    host="$(core:net:host "${url}")"

    [[ "${method}" =~ ^[A-Z]+$ ]] || { core:error:fail "Not an HTTP method: ${method}"; return; }
    core:validate:url "${url}" || { core:error:fail "Only an https URL is called: ${host}"; return; }

    core:sys:need curl || return
    core:net:budget || return

    for header in "$@"; do

        [[ "${header}" =~ ^[A-Za-z0-9-]+:\ ?[^$'\r\n']*$ ]] \
            || { core:error:fail "Not a header line: ${header%%:*}"; return; }

    done

    config="$(core:fs:temp:file)" || return
    errors="$(core:fs:temp:file)" || return

    if [[ -n "${body}" ]]; then

        payload="$(core:fs:temp:file)" || return
        printf '%s' "${body}" > "${payload}" || { core:error:fail "Cannot stage the body for ${host}"; return; }

    fi

    core:net:config "${method}" "${url}" "${output}" "${payload}" "$@" > "${config}" \
        || { core:error:fail "Cannot write the request for ${host}"; return; }

    core:net:try "${config}" "${errors}" "${method} ${host}" "${url}"

    reason="$(core:net:reason "${errors}" "${url}")"
    rm -f -- "${config}" "${errors}" "${payload}"

    (( NET_STATUS != 0 )) || [[ "${NET_CODE}" != 2[0-9][0-9] ]] || return 0

    if (( NET_STATUS != 0 )) && core:net:unsent; then core:error:fail "${method} ${host} failed before sending: ${reason}"
    elif (( NET_STATUS != 0 )); then core:error:fail "${method} ${host} failed after sending, not retried: ${reason}"
    else core:error:fail "${method} ${host} answered ${NET_CODE}: $(core:net:excerpt "${output}" "${url}")"
    fi

}
core:net:mail () {

    local url="${1:-}" user="${2:-}" password="${3-}" from="${4:-}" message="${5:-}" host="" config="" errors="" reason="" rcpt=""

    shift "$(( $# < 5 ? $# : 5 ))"

    host="$(core:net:host "${url}")"

    [[ "${url}" =~ ^smtps?://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] || { core:error:fail "Not an SMTP address: ${host}"; return; }
    [[ -f "${message}" ]] || { core:error:fail "No message to send through ${host}"; return; }
    (( $# > 0 )) || { core:error:fail "A recipient is required"; return; }

    for rcpt in "${from}" "$@"; do
        core:validate:email "${rcpt}" || { core:error:fail "Not a mail address: ${rcpt}"; return; }
    done

    core:sys:need curl || return
    core:net:budget || return

    config="$(core:fs:temp:file)" || return
    errors="$(core:fs:temp:file)" || return

    {
        core:net:line url "${url}"
        core:net:line mail-from "${from}"

        for rcpt in "$@"; do
            core:net:line mail-rcpt "${rcpt}"
        done

        [[ -z "${user}" ]] || core:net:line user "${user}:${password}"

        core:net:line upload-file "${message}"
        core:net:line write-out '%{size_upload} %{response_code}'

        printf 'ssl-reqd\ncrlf\n'
        core:net:common
    } > "${config}" || { core:error:fail "Cannot write the mail for ${host}"; return; }

    core:net:try "${config}" "${errors}" "SMTP ${host}" "${url}"

    reason="$(core:net:reason "${errors}" "${url}")"
    rm -f -- "${config}" "${errors}"

    (( NET_STATUS != 0 )) || return 0

    if core:net:unsent; then core:error:fail "SMTP ${host} failed before sending: ${reason}"
    else core:error:fail "SMTP ${host} failed, not retried: ${reason}"
    fi

}
core:net:reason () {

    local file="${1}" url="${2}" line="" last=""

    while IFS= read -r line || [[ -n "${line}" ]]; do
        [[ -z "${line}" ]] || last="${line}"
    done < <(tr -d '\0' < "${file}")

    last="${last#curl: }"
    last="${last//"${url}"/"$(core:net:host "${url}")"}"

    core:log:print "${last:-no reason given}"

}
core:net:excerpt () {

    local file="${1}" url="${2}" text=""

    [[ -f "${file}" ]] || { core:log:print "no body"; return 0; }

    text="$(head -c 200 -- "${file}" | tr -d '\0' | tr -s '\r\n\t' '   ')" || text=""
    text="${text//"${url}"/"$(core:net:host "${url}")"}"

    core:log:print "${text:-no body}"

}
core:net:http () {

    local method="${1:-}" url="${2:-}" body="${3-}" output="" status=0

    shift "$(( $# < 3 ? $# : 3 ))"

    output="$(core:fs:temp:file)" || return

    core:net:send "${method}" "${url}" "${body}" "${output}" "$@" || status=$?

    (( status != 0 )) || cat -- "${output}"
    rm -f -- "${output}"

    return "${status}"

}
core:net:json () {

    local method="${1:-}" url="${2:-}" body="${3-}"

    shift "$(( $# < 3 ? $# : 3 ))"

    if [[ -n "${body}" ]]; then core:net:http "${method}" "${url}" "${body}" 'Content-Type: application/json' 'Accept: application/json' "$@"
    else core:net:http "${method}" "${url}" '' 'Accept: application/json' "$@"
    fi

}
core:net:fetch () {

    local url="${1:-}" file="${2:-}"

    [[ -n "${file}" ]] || { core:error:fail "A destination file is required"; return; }

    core:net:send GET "${url}" '' "${file}" || { core:error:fail "Fetch failed: $(core:net:host "${url}")"; return; }

}
