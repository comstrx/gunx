test:core:net:judges-urls () {

    core:validate:url https://github.com/x/y/releases/download/v1/a.tar.xz
    @fails core:validate:url http://github.com/x
    @fails core:validate:url 'https://github.com/x;rm'
    @fails core:validate:url ''

}
test:core:net:fetches-https-only () {

    CONFIG[RUN_RETRIES]=1
    CONFIG[RUN_TIMEOUT]=5

    @errors 'Only an https URL' core:net:fetch http://example.invalid/x "${TMPDIR}/x"
    @errors 'Fetch failed' core:net:fetch https://example.invalid/x "${TMPDIR}/x"

}
fixture:core:net:curl () {

    local bin="${TMPDIR}/bin"

    mkdir -p "${bin}"

    cat > "${bin}/curl" <<'CURL'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${FAKE_CURL_LOG}"
cp -- "${3}" "${FAKE_CURL_LOG}.config"
output="$(sed -n 's/^output = "\(.*\)"$/\1/p' "${3}")"
upload="$(sed -n 's/^upload-file = "\(.*\)"$/\1/p' "${3}")"
[[ -z "${upload}" ]] || cp -- "${upload}" "${FAKE_CURL_LOG}.mail"
body="$(sed -n 's/^data-binary = "@\(.*\)"$/\1/p' "${3}")"
[[ -z "${body}" ]] || cp -- "${body}" "${FAKE_CURL_LOG}.body"
[[ -n "${output}" ]] || output=/dev/null
case "${FAKE_CURL_MODE}" in
    refused) printf '0 000'; printf 'curl: (7) Failed to connect\n' >&2; exit 7 ;;
    dropped) printf '120 000'; printf 'curl: (52) Empty reply from server\n' >&2; exit 52 ;;
    server)  printf 'boom' > "${output}"; printf '120 500' ;;
    file)    cp -- "${FAKE_CURL_FILE}" "${output}"; printf '120 200' ;;
    *)       printf '{"ok":true}' > "${output}"; printf '120 200' ;;
esac
CURL

    chmod 755 "${bin}/curl"

    export FAKE_CURL_LOG="${TMPDIR}/curl.log" PATH="${bin}:${PATH}"

}
test:core:net:keeps-secrets-off-the-command-line () {

    local url="https://api.example.com/bot123:SECRET/send" answer=""

    fixture:core:net:curl
    export FAKE_CURL_MODE=ok

    answer="$(core:net:json POST "${url}" '{"a":1}' 'Authorization: Bearer TOKEN')"

    @eq "${answer}" '{"ok":true}'
    @absent "$(cat "${FAKE_CURL_LOG}")" SECRET
    @absent "$(cat "${FAKE_CURL_LOG}")" TOKEN
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'header = "Authorization: Bearer TOKEN"'
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'header = "Content-Type: application/json"'
    @contains "$(cat "${FAKE_CURL_LOG}.config")" 'data-binary = "@'
    @eq "$(find "${TMPDIR}" -name 'infra.*' -type f | wc -l | tr -d ' ')" 0 'no request file left behind'
    @errors 'Not a header line' core:net:http GET "${url}" '' $'X-Bad: a\r\nInjected: b'
    @errors 'Not an HTTP method' core:net:http get "${url}"

}
test:core:net:retries-only-what-never-left () {

    local url="https://api.example.com/bot123:SECRET/send" message=""

    fixture:core:net:curl

    CONFIG[RUN_RETRIES]=3
    CONFIG[RUN_BACKOFF]=0

    export FAKE_CURL_MODE=refused
    @errors 'failed before sending' core:net:http POST "${url}" 'x'
    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 3

    : > "${FAKE_CURL_LOG}"
    export FAKE_CURL_MODE=dropped
    @errors 'failed after sending, not retried' core:net:http POST "${url}" 'x'
    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 1

    : > "${FAKE_CURL_LOG}"
    export FAKE_CURL_MODE=server
    message="$(core:net:http POST "${url}" 'x' 2>&1 >/dev/null)" || true
    @contains "${message}" 'answered 500: boom'
    @contains "${message}" 'https://api.example.com'
    @absent "${message}" SECRET
    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 1

}
test:core:net:names-the-host-only () {

    @eq "$(core:net:host https://user@api.example.com:8443/bot1:SECRET/x?y=z)" https://api.example.com:8443
    @eq "$(core:net:host https://hooks.example.com)" https://hooks.example.com
    core:validate:url https://api.telegram.org/bot123:ABC-def_x/sendMessage
    core:validate:url 'https://example.com/hook?a=b&c=d/e:f'

}
test:core:net:reads-a-body-with-null-bytes () {

    local file="${TMPDIR}/body" out=""

    printf 'curl: first\0line\ncurl: (7) the last \0reason\n' > "${file}"

    out="$(core:net:reason "${file}" https://example.com/x 2>&1)"
    @eq "${out}" '(7) the last reason'

    out="$(core:net:excerpt "${file}" https://example.com/x 2>&1)"
    @absent "${out}" 'ignored null byte'

}
