core:gh:actions () {

    [[ "${GITHUB_ACTIONS:-}" == true ]]

}
core:gh:summary () {

    [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] || { cat > /dev/null; return 0; }

    cat >> "${GITHUB_STEP_SUMMARY}" || { core:error:fail "Cannot write the step summary"; return; }

}
core:gh:path () {

    local directory="${1}"

    [[ -n "${GITHUB_PATH:-}" ]] || return 0

    printf '%s\n' "${directory}" >> "${GITHUB_PATH}" || { core:error:fail "Cannot extend GITHUB_PATH"; return; }

}
core:gh:token () {

    core:sys:has gh || { core:error:fail "GIT_TOKEN is not set and gh is not installed"; return; }

    gh auth token 2>/dev/null || { core:error:fail "GIT_TOKEN is not set and gh is not logged in"; return; }

}
core:gh:base () {

    local host="${1:-github.com}"

    if [[ "${host}" == github.com ]]; then core:log:print "https://api.github.com"
    else core:log:print "https://${host}/api/v3"
    fi

}
core:gh:api () {

    local method="${1}" path="${2}" body="${3-}" host="${4:-github.com}" token="" base=""

    core:install:need curl || return

    token="$(core:git:token)" || return
    base="$(core:gh:base "${host}")" || return

    core:net:json "${method}" "${base}${path}" "${body}" \
        'Accept: application/vnd.github+json' \
        'X-GitHub-Api-Version: 2022-11-28' \
        "Authorization: Bearer ${token}"

}
core:gh:login () {

    local host="${1:-github.com}" reply="" login=""

    reply="$(core:gh:api GET /user '' "${host}")" || return
    login="$(grep -oE '"login": *"[^"]+"' <<< "${reply}" | head -n 1 | cut -d'"' -f4)" || login=""

    [[ -n "${login}" ]] || { core:error:fail "Cannot read the login at ${host}"; return; }

    core:log:print "${login}"

}
core:gh:create () {

    local address="${1}" host="" owner="" name="" login="" path="" body=""

    core:gh:hosted "${address}" >/dev/null || return

    host="${address%%/*}"
    name="${address##*/}"
    owner="${address#*/}"
    owner="${owner%%/*}"

    if [[ -z "${GIT_TOKEN:-}" ]] && core:sys:has gh; then

        GH_HOST="${host}" core:proc:timeout "${CONFIG[RUN_TIMEOUT]:-${CONFIG_BASE[RUN_TIMEOUT]}}" gh repo create "${owner}/${name}" --private > /dev/null \
            || { core:error:fail "gh could not create ${address}"; return; }

        return 0

    fi

    login="$(core:gh:login "${host}" 2>/dev/null)" || login=""

    if [[ "${login}" == "${owner}" ]]; then path=/user/repos
    else path="/orgs/${owner}/repos"
    fi

    body="$(core:json:object name "$(core:json:string "${name}")" private true)" || return

    core:gh:api POST "${path}" "${body}" "${host}" > /dev/null || { core:error:fail "Cannot create the repository ${address}"; return; }

}
core:gh:ensure () {

    local address="${1}" url=""

    url="$(core:git:url "${address}")" || return

    ! core:git:reachable "${url}" || return 0

    core:log:info "creating the private repository ${address}"

    if [[ "${address}" == /* ]]; then core:git:bare "${address}" || return
    else core:gh:create "${address}" || return
    fi

    core:git:reachable "${url}" || { core:error:fail "The repository ${address} is still unreachable"; return; }

}
core:gh:hosted () {

    local address="${1}" host="" path=""

    [[ "${address}" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] \
        || { core:error:fail "Not a hosted repository: ${address}"; return; }

    host="${address%%/*}"
    path="${address#*/}"

    printf '%s\t%s\n' "${host}" "${path}"

}
core:gh:released () {

    local address="${1}" tag="${2}" host="" path=""

    IFS=$'\t' read -r host path <<< "$(core:gh:hosted "${address}" 2>/dev/null)"
    [[ -n "${path}" ]] || return 1

    core:gh:api GET "/repos/${path}/releases/tags/${tag}" '' "${host}" >/dev/null 2>&1

}
core:gh:release () {

    local address="${1}" tag="${2}" notes="${3-}" host="" path="" body=""

    core:git:named "${tag}" || { core:error:fail "Not a tag name: ${tag}"; return; }

    IFS=$'\t' read -r host path <<< "$(core:gh:hosted "${address}" 2>/dev/null)"

    [[ -n "${path}" ]] || { core:error:fail "A release needs a hosted repository, and ${address} is not one"; return; }
    ! core:gh:released "${address}" "${tag}" || { core:error:fail "${address} already has the release ${tag}"; return; }

    if [[ -n "${notes}" ]]; then
        body="$(core:json:object tag_name "$(core:json:string "${tag}")" name "$(core:json:string "${tag}")" body "$(core:json:string "${notes}")")" \
            || return
    else
        body="$(core:json:object tag_name "$(core:json:string "${tag}")" name "$(core:json:string "${tag}")" generate_release_notes true)" \
            || return
    fi

    core:gh:api POST "/repos/${path}/releases" "${body}" "${host}" > /dev/null \
        || { core:error:fail "Cannot release ${tag} at ${address}"; return; }

}
