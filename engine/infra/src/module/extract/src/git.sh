module:extract:git:identity () {

    local source="${1}" name="${GIT_CONFIG_NAME:-}" email="${GIT_CONFIG_EMAIL:-}" author=""

    if [[ -z "${name}" || -z "${email}" ]]; then

        author="$(core:git:author "${source}")" \
            || { @err "GIT_CONFIG_NAME and GIT_CONFIG_EMAIL are not set and ${source} has no author to inherit"; return; }

        [[ -n "${name}" ]] || name="${author%%$'\t'*}"
        [[ -n "${email}" ]] || email="${author#*$'\t'}"

    fi

    printf '%s\t%s\n' "${name}" "${email}"

}
module:extract:git:parse () {

    local url="${1}" path=""

    [[ "${url}" != /* ]] || { @print "${url%/}"; return 0; }

    url="${url%/}"
    url="${url%.git}"

    case "${url}" in
        https://*|http://*|ssh://*|git://*) path="${url#*://}"; path="${path#*@}" ;;
        *@*:*)                              path="${url#*@}"; path="${path/://}" ;;
        *)                                  path="${url}" ;;
    esac

    [[ "${path}" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
        || { @err "Not a repository address: ${1}"; return; }

    @print "${path}"

}
module:extract:git:origin () {

    local url=""

    url="$(core:git:origin "${1}")" || return

    module:extract:git:parse "${url}"

}
module:extract:git:resolve () {

    local spec="${1}" root="${2:-}" origin="" host="" owner=""

    [[ -n "${spec}" ]] || { @err "An empty repository address"; return; }

    case "${spec}" in
        /*|*://*|*@*:*|*.*/*/*) module:extract:git:parse "${spec}"; return ;;
    esac

    [[ "${spec}" =~ ^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$ ]] || { @err "Not a repository address: ${spec}"; return; }

    if origin="$(module:extract:git:origin "${root}" 2>/dev/null)" && [[ "${origin}" != /* ]]; then
        host="${origin%%/*}"
        owner="${origin#*/}"
        owner="${owner%%/*}"
    else
        host=github.com
        owner=""
    fi

    [[ "${spec}" == */* ]] || [[ -n "${owner}" ]] \
        || { @err "Cannot resolve ${spec}: no owner; ${root:-the tree} has no origin to inherit from"; return; }

    [[ "${spec}" == */* ]] || spec="${owner}/${spec}"

    @print "${host}/${spec}"

}
module:extract:git:remote () {

    local path="${1}"

    if [[ "${path}" == /* ]]; then @print "${path}"
    else @print "https://x-access-token@${path}.git"
    fi

}
module:extract:git:token () {

    if [[ -n "${GIT_TOKEN:-}" ]]; then printf '%s' "${GIT_TOKEN}"; return 0; fi

    core:sys:has gh || { @err "GIT_TOKEN is not set and gh is not installed"; return; }

    gh auth token 2>/dev/null || { @err "GIT_TOKEN is not set and gh is not logged in"; return; }

}
module:extract:git:exists () {

    local remote="${1}"

    module:extract:git:call ls-remote -q -- "${remote}" >/dev/null 2>&1

}
module:extract:git:ref () {

    local remote="${1}" ref="${2}" line=""

    [[ -n "${ref}" ]] || return 1

    line="$(module:extract:git:call ls-remote -q -- "${remote}" "${ref}" 2>/dev/null)" || return 1
    [[ -n "${line}" ]] || return 1

    @print "${line%%[[:space:]]*}"

}
module:extract:git:create () {

    local path="${1}" host="" owner="" name="" token="" login="" api=""

    if [[ "${path}" == /* ]]; then

        git init -q --bare -- "${path}" || { @err "Cannot create the repository ${path}"; return; }
        return 0

    fi

    host="${path%%/*}"
    owner="${path#*/}"
    owner="${owner%%/*}"
    name="${path##*/}"

    if [[ -z "${GIT_TOKEN:-}" ]] && core:sys:has gh; then

        core:process:io gh repo create "${owner}/${name}" --private >/dev/null \
            || { @err "gh could not create ${path}"; return; }

        return 0

    fi

    token="$(module:extract:git:token)" || return

    if [[ "${host}" == github.com ]]; then api="https://api.github.com"
    else api="https://${host}/api/v3"
    fi

    login="$(core:net:json GET "${api}/user" '' "${token}" | grep -oE '"login": *"[^"]+"' | head -1 | cut -d'"' -f4)" || login=""

    if [[ "${login}" == "${owner}" ]]; then api+="/user/repos"
    else api+="/orgs/${owner}/repos"
    fi

    core:net:json POST "${api}" "{\"name\":\"${name}\",\"private\":true}" "${token}" >/dev/null \
        || { @err "Cannot create the repository ${path}"; return; }

}
module:extract:git:ensure () {

    local remote="${1}" path="${2}"

    ! module:extract:git:exists "${remote}" || return 0

    @info "creating the private repository ${path}"
    module:extract:git:create "${path}" || return

    module:extract:git:exists "${remote}" || { @err "The repository ${path} is still unreachable"; return; }

}
module:extract:git:askpass () {

    local file=""

    file="$(core:fs:temp:file)" || return
    printf '#!/usr/bin/env bash\nprintf %%s "%s"\n' "\${GIT_TOKEN}" | core:fs:file:write "${file}" 700 || return

    @print "${file}"

}
module:extract:git:call () {

    local askpass="" token="" status=0

    askpass="$(module:extract:git:askpass)" || return
    token="$(module:extract:git:token 2>/dev/null)" || token=""

    GIT_TOKEN="${token}" GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="${askpass}" core:process:io git "$@" || status=$?

    rm -f -- "${askpass}"

    return "${status}"

}
module:extract:git:checkout () {

    local remote="${1}" branch="${2}" clone="${3}" path="${4:-${1}}"

    core:validate:branch "${branch}" || { @err "Not a branch name: ${branch}"; return; }

    module:extract:git:ensure "${remote}" "${path}" || return

    if module:extract:git:call clone -q --branch "${branch}" --single-branch -- "${remote}" "${clone}" 2>/dev/null; then
        @print existing
        return 0
    fi

    rm -rf -- "${clone}"

    module:extract:git:call clone -q -- "${remote}" "${clone}" 2>/dev/null || { @err "git clone failed: ${remote}"; return; }
    git -C "${clone}" switch -q --orphan "${branch}" || { @err "Cannot open the branch ${branch}"; return; }

    @print new

}
module:extract:git:commit () {

    local clone="${1}" message="${2}" name="${3}" email="${4}"

    git -C "${clone}" add -A -- . ":(exclude)$(config:paths:cache)" || { @err "git add failed"; return; }

    if git -C "${clone}" diff --cached --quiet && git -C "${clone}" rev-parse -q --verify HEAD >/dev/null; then
        @print same
        return 0
    fi

    git -C "${clone}" -c "user.name=${name}" -c "user.email=${email}" commit -q -m "${message}" \
        || { @err "git commit failed"; return; }

    @print changed

}
module:extract:git:tag () {

    local clone="${1}" tag="${2}"

    core:validate:tag "${tag}" || { @err "Not a release tag: ${tag}"; return; }

    ! git -C "${clone}" rev-parse -q --verify "refs/tags/${tag}" >/dev/null \
        || { @err "The tag ${tag} already exists on the mirror"; return; }

    git -C "${clone}" tag "${tag}" || { @err "git tag failed: ${tag}"; return; }

}
module:extract:git:push () {

    local clone="${1}" remote="${2}" ref="${3}"

    module:extract:git:call -C "${clone}" push -q -- "${remote}" "${ref}" \
        || { @err "git push failed: ${ref}"; return; }

}
#cfg[fuzz]
module:extract:git:parse:fuzz () {

    local text=""

    text="$(tr -d '\0' < "${1}" | head -c 128)"

    module:extract:git:parse "${text}" >/dev/null

}
