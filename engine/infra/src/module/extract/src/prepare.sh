module:extract:changelog () {

    local root="${1}" tree="${2}" part="${3}" shown="${4:-${3}}" line="" keep=0 block=0

    [[ -f "${root}/CHANGELOG.md" ]] || return 0

    {
        printf '# Changelog\n'

        while IFS= read -r line || [[ -n "${line}" ]]; do

            if [[ "${line}" == '## '* ]]; then keep=0; block=0; printf '\n%s\n' "${line}"; continue; fi

            if [[ "${line}" == '### '* ]]; then

                block=$([[ "${line}" == "### ${part}" ]] && printf 1 || printf 0)
                (( block == 0 )) || { printf '\n### %s\n' "${shown}"; keep=1; }

                continue

            fi

            if [[ "${line}" == '# '* ]]; then continue; fi

            (( block == 0 )) || [[ -z "${line}" && keep -eq 0 ]] || {

                printf '%s\n' "${line}"

                keep=0
                [[ -n "${line}" ]] && keep=1

            }

        done < "${root}/CHANGELOG.md"
    } | core:fs:file:write "${tree}/CHANGELOG.md" 644

}
module:extract:docs () {

    local tree="${1}" name="${2}" title="${3}" source="${4}" file="" letter="" any="" index=0
    local -a docs=()

    [[ "${source}" =~ ^[A-Za-z0-9_.-]+$ ]] || { @err "Not a source name: ${source}"; return; }

    for (( index = 0; index < ${#source}; index++ )); do
        letter="${source:index:1}"
        any+="[${letter^}${letter,}]"
    done

    while IFS= read -r -d '' file; do

        [[ "${file}" == "${tree}"/.github/* || "${file}" == "${tree}"/@(CONTRIBUTING|SECURITY|SUPPORT|CODE_OF_CONDUCT).md ]] || continue

        core:fs:file:edit "${file}" -e "s/${source,,}/${name}/g" -e "s/${any}/${title}/g" \
            || { @err "Doc rewrite failed: ${file#"${tree}/"}"; return; }

        [[ "${file}" != *.md && "${file}" != *.yml ]] || docs+=( "${file#"${tree}/"}" )

    done < <(core:fs:tree:files "${tree}")

    (( ${#docs[@]} > 0 )) || return 0
    core:sys:has bunx || { @warn "bunx is missing; the renamed files keep their old widths"; return 0; }

    (
        cd -- "${tree}" && \
        core:process:timeout "${CONFIG[RUN_TIMEOUT]:-300}" bunx "prettier@$(config:tools:version prettier)" --log-level warn --write "${docs[@]}"
    ) || { @err "Prettier failed on the renamed files"; return; }

}
module:extract:strip () {

    local tree="${1}" kind="${2}" part="${3}" file=""

    [[ "${kind}" == engine && "${part}" == engine/infra ]] || return 0

    for file in infra.toml Infra.toml; do

        [[ -f "${tree}/${file}" ]] || continue

        core:fs:file:edit "${tree}/${file}" '/^\[deps\]/,/^$/d' || { @err "Strip failed: ${file}"; return; }

    done

}
module:extract:block () {

    local kind="${1}" part="${2}"

    case "${kind}" in
        engine)   @print "${part#engine/}" ;;
        tutor)    @print tutor ;;
        fragment) part="${part#product/}"; @print "${part/\//-}" ;;
        *)        @print "" ;;
    esac

}
module:extract:prepare () {

    local name="${1}" tree="${2}" root="" kind="" part="" title="" count=0

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    kind="$(module:extract:kind "${name}")" || return
    part="$(module:extract:part "${name}")" || return
    title="$(module:extract:title "${name}")" || return

    [[ -d "${root}/${part}" ]] || { @err "Part does not exist yet: ${part}"; return; }

    core:fs:dir:new "${tree}" 755 || return
    count="$(module:extract:files "${root}" "${kind}" "${part}" | core:fs:tree:copy "${root}" "${tree}")" || return

    [[ "${kind}" == product ]] \
        || module:extract:changelog "${root}" "${tree}" "$(module:extract:block "${kind}" "${part}")" "$(module:extract:gatename "${kind}" "${part}")" \
        || return

    module:extract:flows:apply "${tree}" "${kind}" "${part}" || return
    module:extract:docs "${tree}" "${name#product/}" "${title}" "$(module:extract:source)" || return
    module:extract:strip "${tree}" "${kind}" "${part}" || return

    @info "prepared ${name}: ${count} files from ${part} into ${tree}"

}
