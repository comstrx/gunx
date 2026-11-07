module:extract:session () {

    local name="${1}" tree=""

    tree="${TOOL_TEMP}/sync/${name//\//-}"

    rm -rf -- "${tree}"
    core:fs:dir:new "${tree}" 755 || return

    @print "${tree}"

}
module:extract:tag () {

    local name="${1}" root="" wanted=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    if [[ "${name}" == product/* ]]; then wanted=inherit
    else wanted="$(config:targets:get "${name}" tag)" || return
    fi

    [[ "${wanted}" != inherit ]] || { core:git:release "${root}" || true; return 0; }

    core:validate:tag "${wanted}" || core:validate:semver "${wanted}" \
        || { @err "${name}: tag must be inherit or a semver: ${wanted}"; return; }

    @print "${wanted}"

}
module:extract:timeout () {

    local seconds=""

    seconds="$(core:cli:value --timeout)" || seconds=1800

    core:process:seconds "${seconds}" --timeout

}
module:extract:prove () {

    local tree="${1}" name="${2}"

    module:extract:verify "${tree}" "$(module:extract:kind "${name}")" || return

    ! core:cli:flag --gates || module:extract:gate "${tree}" "${name}" || return

}
module:extract:build () {

    local name="${1:-}" tree=""

    [[ -n "${name}" ]] || { core:error:usage "NAME is required"; return; }

    tree="$(module:extract:session "${name}")" || return

    module:extract:prepare "${name}" "${tree}" || return

    @print "${tree}"

}
module:extract:extract () {

    local name="${1:-}" into="" tree=""

    [[ -n "${name}" ]] || { core:error:usage "extract NAME [--into DIR] [--gates] [--timeout S]"; return; }

    into="$(core:cli:value --into)" || into=""

    tree="$(module:extract:build "${name}")" || return

    if [[ -n "${into}" ]]; then
        core:fs:tree:replace "${into}" "${tree}" || return
        tree="$(cd -- "${into}" && pwd -P)" || return
    else
        TOOL_KEEP=true
    fi

    module:extract:prove "${tree}" "${name}" || return

    @print "${tree}"

}
module:extract:place () {

    local name="${1:-}" target="${2:-}" tree=""

    [[ -n "${name}" && -n "${target}" ]] || { core:error:usage "place NAME DIR"; return; }

    tree="$(module:extract:build "${name}")" || return

    core:fs:tree:replace "${target}" "${tree}" || return
    target="$(cd -- "${target}" && pwd -P)" || return

    module:extract:prove "${target}" "${name}" || return

    @succ "placed ${name} into ${target}"

}
module:extract:push () {

    local name="${1:-}" root="" tree="" clone="" repository="" remote="" branch="" release="" message="" identity="" state=""

    [[ -n "${name}" ]] || { core:error:usage "push NAME"; return; }

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    branch="$(core:cli:value --branch)" || branch=main
    repository="$(module:extract:repository "${name}")" || return
    remote="$(module:extract:git:remote "${repository}")" || return
    identity="$(module:extract:git:identity "${root}")" || return
    release="$(module:extract:tag "${name}")" || return
    message="Track ${release:-$(core:git:head "${root}")}" || return

    tree="$(module:extract:build "${name}")" || return
    clone="$(core:fs:temp:dir)" || return

    state="$(module:extract:git:checkout "${remote}" "${branch}" "${clone}" "${repository}")" || return
    @info "cloned ${repository} on ${branch} (${state})"

    core:fs:tree:replace "${clone}" "${tree}" || return
    module:extract:prove "${clone}" "${name}" || return

    state="$(module:extract:git:commit "${clone}" "${message}" "${identity%%$'\t'*}" "${identity#*$'\t'}")" || return
    [[ -z "${release}" ]] || module:extract:git:tag "${clone}" "${release}" || return

    ! core:cli:flag --dry-run || {
        @print "dry run: ${name} → ${repository} (${branch}) \"${message}\"${release:+ +${release}} ${state}, verified, not pushed"
        return 0
    }
    [[ "${state}" == changed || -n "${release}" ]] || {
        @info "${name}: the mirror already matches ${repository} (${branch})"
        return 0
    }

    module:extract:git:push "${clone}" "${remote}" "HEAD:refs/heads/${branch}" || return
    [[ -z "${release}" ]] || module:extract:git:push "${clone}" "${remote}" "refs/tags/${release}" || return

    @succ "pushed ${name} to ${repository} (${branch}) as \"${message}\"${release:+ with tag ${release}}"

}
module:extract:ready () {

    local root="" name="" part="" missing=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    while IFS= read -r name; do

        part="$(config:targets:get "${name}" path)" || return
        [[ -d "${root}/${part}" ]] || missing+=" ${name} (${part})"

    done < <(config:targets:list)

    [[ -n "$(config:targets:list)" ]] || {
        @err "No distribution table: no [tool.*] in ${root}/infra.toml nor in the engine"
        return
    }

    [[ -z "${missing}" ]] || { @err "Targets without a part under ${root}:${missing}"; return; }

}
module:extract:all () {

    local name="" failed=0
    local -a names=()

    module:extract:ready || return

    while IFS= read -r name; do
        if [[ "$(config:targets:get "${name}" path)" == engine/infra ]]; then names=( "${name}" "${names[@]}" )
        else names+=( "${name}" )
        fi
    done < <(config:targets:list)

    for name in "${names[@]}"; do
        module:extract:push "${name}" || failed=1
    done

    (( failed == 0 )) || { @err "At least one target failed"; return; }

}
module:extract:targets () {

    local root="" target="" part="" state=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    while IFS= read -r target; do

        part="$(config:targets:get "${target}" path)" || return
        state=present
        [[ -d "${root}/${part}" ]] || state=missing

        printf '%s\t%s  %s  %s  (%s)  %s\n' "${target}" "$(config:targets:get "${target}" type)" "${part}" \
            "$(module:extract:repository "${target}")" "$(config:targets:get "${target}" tag)" "${state}"

    done < <(config:targets:list) | core:ui:table

    module:extract:ready

}
