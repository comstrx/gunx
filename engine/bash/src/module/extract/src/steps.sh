declare -ga EXTRACT_RESULTS=()

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

    seconds="$(core:cli:value --timeout)" || seconds="${CONFIG[RUN_TIMEOUT]:-600}"

    core:proc:seconds "${seconds}" --timeout

}
module:extract:prove () {

    local tree="${1}" name="${2}"

    module:extract:verify "${tree}" "$(module:extract:kind "${name}")" "${name}" || return

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

    local name="${1:-}" root="" tree="" clone="" repository="" remote="" branch="" release="" message="" identity="" state="" dry=false

    [[ -n "${name}" ]] || { core:error:usage "push NAME"; return; }

    ! core:cli:flag --dry-run || dry=true

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    branch="$(core:cli:value --branch)" || branch=main
    repository="$(module:extract:repository "${name}")" || return
    remote="$(module:extract:git:remote "${repository}")" || return
    identity="$(module:extract:git:identity "${root}")" || return
    release="$(module:extract:tag "${name}")" || return
    message="Track ${release:-$(core:git:head "${root}")}" || return

    module:extract:clean "${root}" "${name}" "${dry}" || return

    tree="$(module:extract:build "${name}")" || return
    clone="$(core:fs:temp:dir)" || return

    state="$(module:extract:git:checkout "${remote}" "${branch}" "${clone}" "${repository}" "$([[ "${dry}" == true ]] && @print false || @print true)")" || return
    @info "cloned ${repository} on ${branch} (${state})"

    core:fs:tree:replace "${clone}" "${tree}" || return
    module:extract:prove "${clone}" "${name}" || return

    state="$(module:extract:git:commit "${clone}" "${message}" "${identity%%$'\t'*}" "${identity#*$'\t'}")" || return
    [[ -z "${release}" ]] || module:extract:git:tag "${clone}" "${release}" || return

    [[ "${dry}" == false ]] || {
        EXTRACT_RESULTS+=( "${name}"$'\t'dry-run )
        @print "dry run: ${name} → ${repository} (${branch}) \"${message}\"${release:+ +${release}} ${state}, verified, not pushed"
        return 0
    }
    [[ "${state}" == changed || -n "${release}" ]] || {
        EXTRACT_RESULTS+=( "${name}"$'\t'unchanged )
        @info "${name}: the mirror already matches ${repository} (${branch})"
        return 0
    }

    module:extract:git:push "${clone}" "${remote}" "HEAD:refs/heads/${branch}" || return
    [[ -z "${release}" ]] || module:extract:git:push "${clone}" "${remote}" "refs/tags/${release}" || return

    EXTRACT_RESULTS+=( "${name}"$'\t'pushed )
    @succ "pushed ${name} to ${repository} (${branch}) as \"${message}\"${release:+ with tag ${release}}"

}
module:extract:clean () {

    local root="${1}" name="${2}" dry="${3}" kind="" part="" entry="" path=""
    local -a dirty=()

    kind="$(module:extract:kind "${name}")" || return
    part="$(module:extract:part "${name}")" || return

    while IFS= read -r -d '' entry; do

        path="${entry:3}"
        ! module:extract:travels "${kind}" "${part}" "${path}" || dirty+=( "${path}" )

    done < <(core:git:dirty "${root}")

    (( ${#dirty[@]} > 0 )) || return 0

    if [[ "${dry}" == true ]]; then
        @warn "${name}: ${#dirty[@]} uncommitted files travel (${dirty[*]:0:5}); a real push refuses them"
        return 0
    fi

    @err "${name}: ${#dirty[@]} uncommitted files travel (${dirty[*]:0:5}); commit them first, the mirror tracks a commit"

}
module:extract:ready () {

    local root="" name="" part="" missing=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    while IFS= read -r name; do

        part="$(config:targets:get "${name}" path)" || return
        [[ -d "${root}/${part}" ]] || missing+=" ${name} (${part})"

    done < <(config:targets:list)

    [[ -n "$(config:targets:list)" ]] || {
        @err "No distribution table: no [deps] in ${root}/infra.toml nor in the engine"
        return
    }

    [[ -z "${missing}" ]] || { @err "Targets without a part under ${root}:${missing}"; return; }

}
module:extract:all () {

    local name="" self="" failed=0 row=""
    local -a names=()

    module:extract:ready || return
    self="$(module:extract:self)" || return

    EXTRACT_RESULTS=()

    while IFS= read -r name; do
        if [[ "$(config:targets:get "${name}" path)" == "${self}" ]]; then names=( "${name}" "${names[@]}" )
        else names+=( "${name}" )
        fi
    done < <(config:targets:list)

    for name in "${names[@]}"; do
        module:extract:push "${name}" || { failed=1; EXTRACT_RESULTS+=( "${name}"$'\t'failed ); }
    done

    core:ui:section "Sync"

    for row in "${EXTRACT_RESULTS[@]}"; do
        @print "${row}"
    done | core:ui:table

    (( failed == 0 )) || { @err "At least one target failed; the others above stand as reported"; return; }

}
module:extract:targets () {

    local root="" target="" part="" state=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    while IFS= read -r target; do

        part="$(config:targets:get "${target}" path)" || return
        state=present
        [[ -d "${root}/${part}" ]] || state=missing

        printf '%s\t%s\t%s\t%s\t%s\t%s\n' "${target}" "$(config:targets:get "${target}" type)" "${part}" \
            "$(module:extract:repository "${target}")" "$(config:targets:get "${target}" tag)" "${state}"

    done < <(config:targets:list) | core:ui:grid

    module:extract:ready

}
