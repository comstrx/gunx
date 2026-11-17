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
module:extract:anycase () {

    local text="${1}" letter="" out="" index=0

    for (( index = 0; index < ${#text}; index++ )); do

        letter="${text:index:1}"

        case "${letter}" in
            [A-Za-z]) out+="[${letter^}${letter,}]" ;;
            [0-9/_:-]) out+="${letter}" ;;
            *)        out+="[${letter}]" ;;
        esac

    done

    @print "${out}"

}
module:extract:shapes () {

    local word="${1,,}" head="" last=""

    head="${word%?}"
    last="${word: -1}"

    @print "${word}" "${word^^}" "${word^}" "${head^}${last^^}" "${head}${last^^}"

}
module:extract:rename () {

    local tree="${1}" name="${2}" word="" from="" to="" tool="" owner="" other="" file="" index=0
    local -a program=() docs=() olds=() news=() seek=()

    word="$(module:extract:source)" || return
    tool="$(module:extract:name "${name}")" || return
    to="$(module:extract:repository "${name}" 2>/dev/null)" || to=""

    [[ "${word}" =~ ^[A-Za-z0-9_.-]+$ ]] || { @err "Not a source name: ${word}"; return; }

    from="$(core:git:origin "${TOOL_ROOT}" 2>/dev/null)" && from="$(core:git:address "${from}" 2>/dev/null)" || from=""

    seek=( -e "${word}" )

    if [[ -n "${from}" && "${from}" != /* && -n "${to}" && "${to}" != /* ]]; then

        owner="${from#*/}"
        owner="${owner%%/*}"
        other="${to#*/}"
        other="${other%%/*}"

        program+=( -e "s|$(module:extract:anycase "https://${from}")|https://${to}|g" )
        program+=( -e "s|$(module:extract:anycase "${from}")|${to}|g" )
        program+=( -e "s|$(module:extract:anycase "${from#*/}")|${to#*/}|g" )

        if [[ "${owner,,}" != "${other,,}" ]]; then

            program+=( -e "s#(^|[^A-Za-z0-9_-])$(module:extract:anycase "${owner}")([^A-Za-z0-9_/-]|\$)#\\1${other}\\2#g" )
            program+=( "${program[@]: -2}" )
            seek+=( -e "${owner}" )

        fi

    fi

    mapfile -t olds < <(module:extract:shapes "${word}")
    mapfile -t news < <(module:extract:shapes "${tool}")

    for (( index = 0; index < ${#olds[@]}; index++ )); do
        program+=( -e "s|${olds[index]//./[.]}|${news[index]}|g" )
    done

    program+=( -e "s|$(module:extract:anycase "${word}")|${tool}|g" )

    while IFS= read -r file; do

        [[ "${file}" == "${tree}"/.github/* || "${file}" == *.@(md|yml|yaml|toml) ]] || continue

        core:fs:file:edit "${file}" -E "${program[@]}" || { @err "Rename failed: ${file#"${tree}/"}"; return; }

        [[ "${file}" != *.@(md|yml|yaml) ]] || docs+=( "${file#"${tree}/"}" )

    done < <(grep -rIilF --exclude-dir=.git "${seek[@]}" -- "${tree}" || true)

    while IFS= read -r -d '' file; do

        [[ "${file}" == *.@(yml|yaml) ]] || continue

        core:list:has "${file#"${tree}/"}" "${docs[@]}" || docs+=( "${file#"${tree}/"}" )

    done < <(core:fs:tree:files "${tree}/.github")

    (( ${#docs[@]} > 0 )) || return 0
    module:bundle:tool:ready prettier || { @warn "prettier cannot run here; the renamed files keep their old widths"; return 0; }

    core:proc:within "${tree}" @tool prettier --log-level warn --write "${docs[@]}" || { @err "Prettier failed on the renamed files"; return; }

}
module:extract:strip () {

    local tree="${1}" kind="${2}" part="${3}" file=""

    [[ "${kind}" == engine && "${part}" == "$(module:extract:self)" ]] || return 0

    file="$(config:manifest:file "${tree}")" || return

    core:parse:toml:drop "${file}" deps || { @err "Strip failed: ${file##*/}"; return; }

}
module:extract:block () {

    local kind="${1}" part="${2}"

    case "${kind}" in
        engine|tutor) @print "${part##*/}" ;;
        fragment)     part="${part#"${EXTRACT_PRODUCTS}/"}"; @print "${part/\//-}" ;;
        *)            @print "" ;;
    esac

}
module:extract:prepare () {

    local name="${1}" tree="${2}" root="${TOOL_ROOT}" kind="" part="" left="" count=0

    module:extract:install || return

    kind="$(config:targets:get "${name}" type)" || return
    part="$(config:targets:get "${name}" path)" || return
    left="$(module:extract:left "${name}")" || return

    [[ -d "${root}/${part}" ]] || { @err "Part does not exist yet: ${part}"; return; }

    core:fs:dir:new "${tree}" 755 || return
    count="$(module:extract:files "${root}" "${kind}" "${part}" "${left}" | core:fs:tree:copy "${root}" "${tree}")" || return

    [[ "${kind}" == product ]] \
        || module:extract:changelog "${root}" "${tree}" "$(module:extract:block "${kind}" "${part}")" "${part##*/}" \
        || return

    module:extract:flows:apply "${tree}" "${kind}" "${part}" "${name}" || return
    module:extract:deps "${tree}" "${name}" "${kind}" || return
    module:extract:rename "${tree}" "${name}" || return
    module:extract:flows:seal "${tree}" "${part}" "${name}" || return
    module:extract:strip "${tree}" "${kind}" "${part}" || return

    @info "prepared ${name}: ${count} files from ${part} into ${tree}"

}
