module:extract:session () {

    local name="${1}" tree=""

    tree="${TOOL_TEMP}/sync/${name}"

    rm -rf -- "${tree}"
    core:fs:dir:new "${tree}" 755 || return

    @print "${tree}"

}
module:extract:timeout () {

    local seconds=""

    seconds="$(core:cli:value --timeout)" || seconds="${CONFIG[RUN_TIMEOUT]:-600}"

    core:proc:seconds "${seconds}" --timeout

}
module:extract:tag () {

    local name="${1}" tag=""

    tag="$(core:cli:value --tag)" || tag="$(config:targets:get "${name}" tag)" || return

    [[ -z "${tag}" ]] || core:git:named "${tag}" || { @err "${name}: not a tag name: ${tag}"; return; }

    @print "${tag}"

}
module:extract:pushes () {

    core:cli:flag --push || core:cli:given --tag || core:cli:flag --release

}
module:extract:notes () {

    local file="${1}/CHANGELOG.md" tag="${2}" line="" inside=0

    [[ -f "${file}" ]] || return 0

    while IFS= read -r line || [[ -n "${line}" ]]; do

        if [[ "${line}" == '## '* ]]; then

            (( inside == 0 )) || break
            [[ "${line}" != "## ${tag}" && "${line}" != "## ${tag} "* ]] || inside=1

            continue

        fi

        (( inside == 0 )) || @print "${line}"

    done < "${file}"

}
module:extract:extract () {

    local name="${1:-}" into=""

    (( $# <= 1 )) || { core:error:usage "extract takes one target, or none for every target of [deps]"; return; }

    ! core:cli:flag --gates || ! core:cli:flag --no-gates || { core:error:usage "--gates and --no-gates do not meet"; return; }
    ! core:cli:flag --clean || ! core:cli:flag --no-clean || { core:error:usage "--clean and --no-clean do not meet"; return; }

    module:extract:open || return

    ! core:cli:flag --no-clean || TOOL_KEEP=true

    into="$(core:cli:value --to)" || into=""

    [[ -n "${name}" ]] || { module:extract:all "${into}"; return; }

    module:extract:one "${name}" "${into}" || { @err "extract of ${name} failed at ${EXTRACT_STAGE}"; return; }

    @succ "${name}: ${EXTRACT_DONE}"

}
module:extract:one () {

    local name="${1}" into="${2:-}" root="${TOOL_ROOT}" tree="" kind="" repository="" remote="" branch="" release="" latest="" message="" identity="" state="" result="" push=false

    EXTRACT_STAGE=extract EXTRACT_DONE=""

    kind="$(config:targets:get "${name}" type)" || return
    tree="$(module:extract:session "${name}")" || return

    ! module:extract:pushes || push=true

    if [[ "${push}" == true ]]; then

        branch="$(core:cli:value --branch)" || branch="$(config:targets:get "${name}" branch)" || return
        repository="$(module:extract:repository "${name}")" || return
        remote="$(core:git:url "${repository}")" || return
        identity="$(core:git:identity "${root}")" || return
        release="$(module:extract:tag "${name}")" || return
        message="$(core:cli:value --message)" || message="Track ${release:-$(core:git:head "${root}")}" || return

        [[ -z "${release}" ]] || ! core:git:ref "${remote}" "refs/tags/${release}" >/dev/null \
            || { @err "${name}: ${repository} already carries the tag ${release}"; return; }

        if core:cli:flag --release; then

            core:gh:hosted "${repository}" >/dev/null || return

            latest="${release}"
            [[ -n "${latest}" ]] || latest="$(core:git:newest "${remote}")" || { @err "${name}: ${repository} has no tag to release"; return; }

            ! core:gh:released "${repository}" "${latest}" || { @err "${name}: ${repository} already has the release ${latest}"; return; }

        fi

        module:extract:clean "${root}" "${name}" || return
        core:gh:ensure "${repository}" || return

        state="$(core:git:clone "${remote}" "${branch}" "${tree}")" || return
        @info "cloned ${repository} on ${branch} (${state})"

        core:git:empty "${tree}" || return

    else

        core:git:init "${tree}" || return

    fi

    module:extract:prepare "${name}" "${tree}" || return
    module:extract:verify "${tree}" "${kind}" "${name}" || return

    result=extracted

    if ! core:cli:flag --no-gates; then

        EXTRACT_STAGE=gates
        result=proved

        if ! module:extract:gate "${tree}" "${name}"; then

            core:cli:flag --force || return 1

            @warn "${name}: the gates failed; going on as --force asks"
            result="gates failed"

        fi

    fi

    if [[ -n "${into}" ]]; then

        EXTRACT_STAGE=place

        core:git:sync "${tree}" "${into}" || return
        into="$(cd -- "${into}" && pwd -P)" || return

        @info "placed ${name} into ${into}"
        result+=", placed"

    fi

    if [[ "${push}" == true ]]; then

        EXTRACT_STAGE=push

        state="$(core:git:commit "${tree}" "${message}" "${identity%%$'\t'*}" "${identity#*$'\t'}" "$(config:paths:cache)")" || return

        if [[ "${state}" == changed || -n "${release}" ]]; then

            [[ -z "${release}" ]] || core:git:tag "${tree}" "${release}" || return

            core:git:push "${tree}" "${remote}" "HEAD:refs/heads/${branch}" || return
            [[ -z "${release}" ]] || core:git:push "${tree}" "${remote}" "refs/tags/${release}" || return

            @info "pushed ${name} to ${repository} (${branch}) as \"${message}\"${release:+ with tag ${release}}"
            result+=", pushed"

        else

            @info "${name}: the mirror already matches ${repository} (${branch})"
            result+=", unchanged"

        fi

    fi

    if [[ -n "${latest}" ]]; then

        EXTRACT_STAGE=release

        core:gh:release "${repository}" "${latest}" "$(module:extract:notes "${tree}" "${latest}")" || return

        @info "released ${latest} at ${repository}"
        result+=", released"

    fi

    ! core:cli:flag --no-clean || @print "${tree}"

    EXTRACT_STAGE="" EXTRACT_DONE="${result}"

}
module:extract:all () {

    local to="${1:-}" name="" need="" blocked="" list="" row="" failed=""
    local -a names=()
    local -A fate=()

    module:extract:ready || return

    list="$(module:extract:order)" || return
    mapfile -t names <<< "${list}"

    EXTRACT_RESULTS=()

    for name in "${names[@]}"; do

        blocked=""

        while IFS= read -r need; do
            [[ -z "${need}" || "${fate[${need}]:-}" == ok ]] || blocked="${need}"
        done < <(module:extract:needs "${name}")

        if [[ -n "${blocked}" ]]; then

            fate["${name}"]=failed
            failed+="${failed:+, }${name} (waits for ${blocked})"
            EXTRACT_RESULTS+=( "${name}"$'\t'"skipped: ${blocked} failed" )

            continue

        fi

        if module:extract:one "${name}" "${to:+${to}/${name}}"; then

            fate["${name}"]=ok
            EXTRACT_RESULTS+=( "${name}"$'\t'"${EXTRACT_DONE}" )

        else

            fate["${name}"]=failed
            failed+="${failed:+, }${name} (${EXTRACT_STAGE})"
            EXTRACT_RESULTS+=( "${name}"$'\t'"failed at ${EXTRACT_STAGE}" )

        fi

    done

    core:ui:section "Extract"

    for row in "${EXTRACT_RESULTS[@]}"; do
        @print "${row}"
    done | core:ui:table

    [[ -z "${failed}" ]] || { @err "extract failed: ${failed}"; return; }

}
module:extract:clean () {

    local root="${1}" name="${2}" kind="" part="" left="" entry="" path=""
    local -a dirty=()

    kind="$(config:targets:get "${name}" type)" || return
    part="$(config:targets:get "${name}" path)" || return
    left="$(module:extract:left "${name}")" || return

    while IFS= read -r -d '' entry; do

        path="${entry:3}"
        ! module:extract:travels "${kind}" "${part}" "${path}" "${left}" || dirty+=( "${path}" )

    done < <(core:git:dirty "${root}")

    (( ${#dirty[@]} == 0 )) \
        || { @err "${name}: ${#dirty[@]} uncommitted files travel (${dirty[*]:0:5}); commit them first, the mirror tracks a commit"; return; }

}
module:extract:ready () {

    local root="${TOOL_ROOT}" name="" part="" missing=""

    while IFS= read -r name; do

        part="$(config:targets:get "${name}" path)" || return
        [[ -d "${root}/${part}" ]] || missing+=" ${name} (${part})"

    done < <(config:targets:list)

    [[ -z "${missing}" ]] || { @err "Targets without a part under ${root}:${missing}"; return; }

}
module:extract:targets () {

    local root="${TOOL_ROOT}" target="" part="" state=""

    module:extract:open || return

    while IFS= read -r target; do

        part="$(config:targets:get "${target}" path)" || return
        state=present
        [[ -d "${root}/${part}" ]] || state=missing

        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${target}" "$(config:targets:get "${target}" type)" "${part}" "$(module:extract:name "${target}")" \
            "$(module:extract:repository "${target}" 2>/dev/null || @print -)" "$(config:targets:get "${target}" branch)" "$(config:targets:get "${target}" tag)" "${state}"

    done < <(config:targets:list) | core:ui:grid

    module:extract:ready

}
