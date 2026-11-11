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

    git -C "${1}" ls-files -co --exclude-standard -z

}
core:git:changed () {

    local root="${1}" base="${2}"

    git -C "${root}" diff --name-only --no-renames "${base}" -- 2>/dev/null || { core:error:fail "Cannot diff against ${base}"; return; }
    git -C "${root}" ls-files --others --exclude-standard

}
core:git:head () {

    git -C "${1}" rev-parse --short=12 HEAD 2>/dev/null || { core:error:fail "No commit in ${1}"; return; }

}
core:git:release () {

    git -C "${1}" describe --tags --exact-match --match 'v*' HEAD 2>/dev/null

}
core:git:author () {

    local root="${1}" name="" email=""

    name="$(git -C "${root}" log -1 --format='%an' 2>/dev/null)" || name=""
    email="$(git -C "${root}" log -1 --format='%ae' 2>/dev/null)" || email=""

    [[ -n "${name}" && -n "${email}" ]] || { core:error:fail "No commit in ${root} to read the author from"; return; }

    printf '%s\t%s\n' "${name}" "${email}"

}
