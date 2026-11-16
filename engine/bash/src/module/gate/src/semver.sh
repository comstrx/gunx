module:gate:semver:baseline () {

    local baseline="" prefix=""

    baseline="$(core:git:baseline .)" || { @info "semver: no earlier release tag; skipped"; return 1; }
    core:validate:semver "${baseline#v}" || { @info "semver: ${baseline} is not a release tag; skipped"; return 1; }

    prefix="$(core:git:prefix .)" || return 1
    core:git:holds . "${baseline}" "${prefix}" || { @info "semver: new since ${baseline}; skipped"; return 1; }

    @print "${baseline}"

}
module:gate:semver:bumped () {

    local baseline="${1}" version="${2:-}"

    core:validate:breaking "${baseline}" "${version}" || return 1

    @info "semver: ${baseline} to ${version} may break; skipped"

}
module:gate:semver:tree () {

    local baseline="${1}" root="" prefix="" dir=""

    root="$(core:git:root .)" || return
    prefix="$(core:git:prefix .)" || return
    dir="$(core:fs:temp:dir)" || return

    core:git:export "${root}" "${baseline}" "${prefix:-.}" "${dir}" || return

    @print "${dir}/${prefix}"

}
module:gate:semver:judge () {

    local baseline="${1}" report="${2-}"

    [[ -n "${report}" ]] || { @succ "semver: the surface keeps every promise of ${baseline}"; return 0; }

    @print "${report}"
    @err "semver: the surface breaks ${baseline}; raise the version to allow it"

}
module:gate:semver:lost () {

    LC_ALL=C comm -23 <(LC_ALL=C sort -u <<< "${1-}") <(LC_ALL=C sort -u <<< "${2-}")

}
