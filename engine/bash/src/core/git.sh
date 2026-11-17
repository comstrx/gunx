declare -g GIT_HOST=github.com GIT_BRANCH=main

core:git:is () {

    git -C "${1}" rev-parse --show-toplevel >/dev/null 2>&1

}
core:git:has () {

    git -C "${1}" rev-parse --verify --quiet "${2}^{commit}" >/dev/null 2>&1

}
core:git:root () {

    local root=""

    root="$(git -C "${1}" rev-parse --show-toplevel 2>/dev/null)" || root="${1}"

    core:log:print "${root}"

}
core:git:origin () {

    git -C "${1}" remote get-url origin 2>/dev/null || { core:error:fail "No origin remote in ${1}"; return; }

}
core:git:files () {

    local root="${1}" path=""

    while IFS= read -r -d '' path; do
        [[ ! -e "${root}/${path}" && ! -L "${root}/${path}" ]] || printf '%s\0' "${path}"
    done < <(git -C "${root}" ls-files -co --exclude-standard -z)

}
core:git:ignored () {

    local path="${1}"

    git -C "${path%/*}" check-ignore -q -- "${path##*/}" 2>/dev/null

}
core:git:dirty () {

    local root="${1}"

    shift

    git -C "${root}" status --porcelain=v1 -z --untracked-files=all --no-renames -- "$@" 2>/dev/null \
        || { core:error:fail "Cannot read the state of ${root}"; return; }

}
core:git:changed () {

    local root="${1}" base="${2}"

    git -C "${root}" diff --name-only --no-renames "${base}" -- 2>/dev/null || { core:error:fail "Cannot diff against ${base}"; return; }
    git -C "${root}" ls-files --others --exclude-standard

}
core:git:head () {

    git -C "${1}" rev-parse --short=12 HEAD 2>/dev/null || { core:error:fail "No commit in ${1}"; return; }

}
core:git:branch () {

    git -C "${1}" symbolic-ref --quiet --short HEAD 2>/dev/null

}
core:git:release () {

    git -C "${1}" describe --tags --exact-match --match 'v*' HEAD 2>/dev/null

}
core:git:latest () {

    git -C "${1}" describe --tags --abbrev=0 --match 'v*' 2>/dev/null

}
core:git:baseline () {

    git -C "${1}" describe --tags --abbrev=0 --match 'v*' HEAD^ 2>/dev/null

}
core:git:prefix () {

    git -C "${1}" rev-parse --show-prefix 2>/dev/null || { core:error:fail "Not inside a git tree: ${1}"; return; }

}
core:git:holds () {

    git -C "${1}" cat-file -e "${2}:${3:-}" 2>/dev/null

}
core:git:export () {

    local root="${1}" ref="${2}" path="${3:-.}" into="${4}"

    git -C "${root}" archive --format=tar "${ref}" -- "${path}" | tar -x -C "${into}" \
        || { core:error:fail "Cannot copy ${path} at ${ref}"; return; }

}
core:git:author () {

    local root="${1}" name="" email=""

    name="$(git -C "${root}" log -1 --format='%an' 2>/dev/null)" || name=""
    email="$(git -C "${root}" log -1 --format='%ae' 2>/dev/null)" || email=""

    [[ -n "${name}" && -n "${email}" ]] || { core:error:fail "No commit in ${root} to read the author from"; return; }

    printf '%s\t%s\n' "${name}" "${email}"

}
core:git:sha () {

    git -C "${1}" rev-parse --verify --quiet "${2:-HEAD}^{commit}" 2>/dev/null || { core:error:fail "No commit ${2:-HEAD} in ${1}"; return; }

}
core:git:clean () {

    local state=""

    state="$(git -C "${1}" status --porcelain=v1 --untracked-files=all 2>/dev/null)" || { core:error:fail "Cannot read the state of ${1}"; return; }

    [[ -z "${state}" ]]

}
core:git:name () {

    local root="${1}" url=""

    if url="$(git -C "${root}" remote get-url origin 2>/dev/null)" && [[ -n "${url}" ]]; then

        url="${url%/}"
        url="${url%.git}"

        core:log:print "${url##*[/:]}"
        return 0

    fi

    root="$(core:git:root "${root}")"

    core:log:print "${root##*/}"

}
core:git:address () {

    local url="${1:-}" path=""

    [[ "${url}" != /* ]] || { core:log:print "${url%/}"; return 0; }

    url="${url%/}"
    url="${url%.git}"

    case "${url}" in
        https://*|http://*|ssh://*|git://*) path="${url#*://}"; path="${path#*@}" ;;
        *@*:*)                              path="${url#*@}"; path="${path/://}" ;;
        *)                                  path="${url}" ;;
    esac

    [[ "${path}" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9_.-]+){2,}$ ]] \
        || { core:error:fail "Not a repository address: ${1:-}"; return; }

    core:log:print "${path}"

}
core:git:home () {

    local url=""

    url="$(core:git:origin "${1}")" || return

    core:git:address "${url}"

}
core:git:host () {

    local home=""

    home="$(core:git:home "${1:-}" 2>/dev/null)" && [[ "${home}" != /* ]] || { core:log:print "${GIT_HOST}"; return 0; }

    core:log:print "${home%%/*}"

}
core:git:owner () {

    local home=""

    home="$(core:git:home "${1:-}" 2>/dev/null)" && [[ "${home}" != /* ]] || return 1

    home="${home#*/}"

    core:log:print "${home%%/*}"

}
core:git:trunk () {

    local branch=""

    branch="$(core:git:branch "${1:-}")" || branch=""

    core:log:print "${branch:-${GIT_BRANCH}}"

}
core:git:resolve () {

    local spec="${1:-}" root="${2:-}" host="" owner=""

    [[ -n "${spec}" ]] || { core:error:fail "An empty repository address"; return; }

    case "${spec}" in
        /*|*://*|*@*:*|*.*/*/*) core:git:address "${spec}"; return ;;
    esac

    [[ "${spec}" =~ ^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$ ]] || { core:error:fail "Not a repository address: ${spec}"; return; }

    host="$(core:git:host "${root}")"
    owner="$(core:git:owner "${root}")" || owner=""

    [[ "${spec}" == */* || -n "${owner}" ]] \
        || { core:error:fail "Cannot resolve ${spec}: no owner; ${root:-the tree} has no origin to inherit from"; return; }

    [[ "${spec}" == */* ]] || spec="${owner}/${spec}"

    core:log:print "${host}/${spec}"

}
core:git:url () {

    local address="${1}"

    if [[ "${address}" == /* ]]; then core:log:print "${address}"
    else core:log:print "https://x-access-token@${address}.git"
    fi

}
core:git:identity () {

    local root="${1}" name="${GIT_CONFIG_NAME:-}" email="${GIT_CONFIG_EMAIL:-}" author=""

    if [[ -z "${name}" || -z "${email}" ]]; then

        author="$(core:git:author "${root}" 2>/dev/null)" \
            || { core:error:fail "GIT_CONFIG_NAME and GIT_CONFIG_EMAIL are not set and ${root} has no author to inherit"; return; }

        [[ -n "${name}" ]] || name="${author%%$'\t'*}"
        [[ -n "${email}" ]] || email="${author#*$'\t'}"

    fi

    printf '%s\t%s\n' "${name}" "${email}"

}
core:git:token () {

    if [[ -n "${GIT_TOKEN:-}" ]]; then printf '%s' "${GIT_TOKEN}"; return 0; fi

    core:gh:token

}
core:git:askpass () {

    local file=""

    file="$(core:fs:temp:file)" || return

    printf '#!/usr/bin/env bash\nprintf %%s "%s"\n' "\${GIT_TOKEN}" | core:fs:file:write "${file}" 700 || return

    core:log:print "${file}"

}
core:git:call () {

    local askpass="" token="" status=0

    askpass="$(core:git:askpass)" || return
    token="$(core:git:token 2>/dev/null)" || token=""

    GIT_TOKEN="${token}" GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="${askpass}" core:proc:io git "$@" || status=$?

    rm -f -- "${askpass}"

    return "${status}"

}
core:git:reachable () {

    core:git:call ls-remote -q -- "${1}" >/dev/null 2>&1

}
core:git:ref () {

    local remote="${1}" ref="${2:-}" line=""

    [[ -n "${ref}" ]] || return 1

    line="$(core:git:call ls-remote -q -- "${remote}" "${ref}" 2>/dev/null)" || return 1

    [[ -n "${line}" ]] || return 1

    core:log:print "${line%%[[:space:]]*}"

}
core:git:named () {

    [[ -n "${1:-}" && "${1}" != -* ]] && git check-ref-format "refs/tags/${1}" 2>/dev/null

}
core:git:newest () {

    local remote="${1}" line=""

    line="$(core:git:call ls-remote -q --tags --refs --sort=-v:refname -- "${remote}" 2>/dev/null)" || return 1

    [[ -n "${line}" ]] || return 1

    line="${line%%$'\n'*}"

    core:log:print "${line##*refs/tags/}"

}
core:git:default () {

    local remote="${1}" line=""

    line="$(core:git:call ls-remote -q --symref -- "${remote}" HEAD 2>/dev/null)" || return 1

    [[ "${line}" == 'ref: refs/heads/'* ]] || return 1

    line="${line#ref: refs/heads/}"

    core:log:print "${line%%[[:space:]]*}"

}
core:git:empty () {

    local root="${1}"

    [[ -d "${root}/.git" ]] || { core:error:fail "Not a repository: ${root}"; return; }

    find "${root}" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf -- {} + || { core:error:fail "Cannot empty ${root}"; return; }

}
core:git:bare () {

    git init -q --bare -- "${1}" || { core:error:fail "Cannot create the repository ${1}"; return; }

}
core:git:init () {

    local into="${1}" branch="${2:-${GIT_BRANCH}}"

    core:validate:branch "${branch}" || { core:error:fail "Not a branch name: ${branch}"; return; }

    if ! git init -q -- "${into}" || ! git -C "${into}" switch -q --orphan "${branch}"; then

        core:error:fail "Cannot open an empty repository in ${into}"
        return

    fi

}
core:git:clone () {

    local remote="${1}" branch="${2}" into="${3}"

    core:validate:branch "${branch}" || { core:error:fail "Not a branch name: ${branch}"; return; }

    if core:git:call clone -q --branch "${branch}" --single-branch -- "${remote}" "${into}" 2>/dev/null; then

        core:log:print existing
        return 0

    fi

    rm -rf -- "${into}"

    core:git:call clone -q -- "${remote}" "${into}" 2>/dev/null || { core:error:fail "git clone failed: ${remote}"; return; }
    git -C "${into}" switch -q --orphan "${branch}" || { core:error:fail "Cannot open the branch ${branch}"; return; }

    core:log:print new

}
core:git:commit () {

    local root="${1}" message="${2}" name="${3}" email="${4}" path=""
    local -a specs=( . )

    shift 4

    for path in "$@"; do
        specs+=( ":(exclude)${path}" )
    done

    git -C "${root}" add -A -- "${specs[@]}" || { core:error:fail "git add failed"; return; }

    if git -C "${root}" diff --cached --quiet && git -C "${root}" rev-parse -q --verify HEAD >/dev/null; then

        core:log:print same
        return 0

    fi

    git -C "${root}" -c "user.name=${name}" -c "user.email=${email}" commit -q -m "${message}" \
        || { core:error:fail "git commit failed"; return; }

    core:log:print changed

}
core:git:tag () {

    local root="${1}" tag="${2}"

    core:git:named "${tag}" || { core:error:fail "Not a tag name: ${tag}"; return; }

    ! git -C "${root}" rev-parse -q --verify "refs/tags/${tag}" >/dev/null \
        || { core:error:fail "The tag ${tag} already exists"; return; }

    git -C "${root}" tag "${tag}" || { core:error:fail "git tag failed: ${tag}"; return; }

}
core:git:push () {

    local root="${1}" remote="${2}" ref="${3}"

    core:git:call -C "${root}" push -q -- "${remote}" "${ref}" || { core:error:fail "git push failed: ${ref}"; return; }

}
core:git:sync () {

    local from="${1}" into="${2}" path="" source="" line="" pattern="" name=""
    local -A ships=()
    local -a stale=()

    [[ -d "${from}/.git" ]] || { core:error:fail "Not a repository: ${from}"; return; }

    core:fs:dir:new "${into}" 755 || return

    while IFS= read -r -d '' path; do
        ships["${path}"]=1
    done < <(core:git:files "${from}")

    (( ${#ships[@]} > 0 )) || { core:error:fail "Nothing ships from ${from}"; return; }

    while IFS= read -r -d '' path; do

        path="${path#./}"
        [[ -n "${ships[${path}]+x}" ]] || stale+=( "${path}" )

    done < <(cd -- "${into}" && find . -path ./.git -prune -o \( -type f -o -type l \) -print0)

    if (( ${#stale[@]} > 0 )); then

        while IFS= read -r -d '' source && IFS= read -r -d '' line && IFS= read -r -d '' pattern && IFS= read -r -d '' name; do

            [[ -z "${source}" || "${pattern}" == '!'* ]] || continue

            rm -f -- "${into}/${name}" || { core:error:fail "Cannot clear ${into}/${name}"; return; }

        done < <(printf '%s\0' "${stale[@]}" | git -C "${from}" check-ignore --no-index -v -n -z --stdin)

    fi

    (
        cd -- "${into}" || exit

        while IFS= read -r -d '' path; do
            rmdir -p -- "${path}" 2>/dev/null || true
        done < <(find . -path ./.git -prune -o -type d -empty -print0)
    )

    for path in "${!ships[@]}"; do
        printf '%s\t%s\n' "${path}" "${path}"
    done | core:fs:tree:copy "${from}" "${into}" >/dev/null

}
