core:net:fetch () {

    local url="${1}" file="${2}"

    core:validate:url "${url}" || { core:error:fail "Only an https URL is fetched: ${url}"; return; }
    core:sys:need curl || return

    core:process:io curl -fsSL --proto '=https' --tlsv1.2 -o "${file}" -- "${url}" || { core:error:fail "Fetch failed: ${url}"; return; }

}
core:net:json () {

    local method="${1}" url="${2}" body="${3:-}" token="${4:-}" file=""

    core:validate:url "${url}" || { core:error:fail "Only an https URL is called: ${url}"; return; }
    core:sys:need curl || return

    file="$(core:fs:temp:file)" || return

    {
        printf 'url = "%s"\nrequest = "%s"\nfail\nsilent\nshow-error\nlocation\nproto = "=https"\ntlsv1.2\n' "${url}" "${method}"
        printf 'header = "Accept: application/vnd.github+json"\nheader = "Content-Type: application/json"\n'
        [[ -z "${token}" ]] || printf 'header = "Authorization: Bearer %s"\n' "${token}"
        [[ -z "${body}" ]] || printf 'data = "%s"\n' "${body//\"/\\\"}"
    } > "${file}"

    core:process:io curl --disable --config "${file}" || { rm -f -- "${file}"; core:error:fail "${method} ${url} failed"; return; }

    rm -f -- "${file}"

}
