module:extract:changelog () {

    local root="${1}" tree="${2}" line="" text="${EXTRACT_CHANGES}" block=0 name="" spec="" shown="" LC_ALL=C

    shift 2

    [[ -f "${root}/${EXTRACT_CHANGELOG}" ]] || return 0

    while IFS= read -r line || [[ -n "${line}" ]]; do

        case "${line}" in
            '## '*) block=0; text+=$'\n\n'"${line}" ;;
            '### '*)
                block=0
                name="${line#'### '}"

                for spec in "$@"; do

                    case "${spec}" in
                        *'-*') [[ "${name}" == "${spec%'*'}"?* ]] || continue; shown="${name#"${spec%'*'}"}" ;;
                        *=*)   [[ "${name}" == "${spec%%=*}" ]] || continue; shown="${spec#*=}" ;;
                        *)     [[ "${name}" == "${spec}" ]] || continue; shown="${name}" ;;
                    esac

                    block=1
                    text+=$'\n\n'"### ${shown}"

                    break

                done
            ;;
            '# '*) ;;
            *)
                [[ "${block}" != 0 && -n "${line//[[:space:]]/}" ]] || continue
                [[ "${block}" != 1 ]] || text+=$'\n'

                block=2
                text+=$'\n'"${line}"
            ;;
        esac

    done < "${root}/${EXTRACT_CHANGELOG}"

    printf '%s\n' "${text}" | core:fs:file:write "${tree}/${EXTRACT_CHANGELOG}" 644

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
    tool="$(config:targets:get "${name}" name)" || return
    to="$(module:extract:repository "${name}" 2>/dev/null)" || to=""

    [[ "${word}" =~ ^[A-Za-z0-9_.-]+$ ]] || { @err "Not a source name: ${word}"; return; }

    from="$(core:git:home "${TOOL_ROOT}" 2>/dev/null)" || from=""

    seek=( -e "${word}" )

    if [[ -n "${from}" && "${from}" != /* && -n "${to}" && "${to}" != /* ]]; then

        owner="${from#*/}"
        owner="${owner%%/*}"
        other="${to#*/}"
        other="${other%%/*}"

        program+=( -e "s|$(module:extract:anycase "$(core:git:link "${from}")")|$(core:git:link "${to}")|g" )
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

        [[ "${file}" == "${tree}/${EXTRACT_FORGE}"/* || "${file}" =~ [.](${EXTRACT_PAPERS})$ ]] || continue

        core:fs:file:edit "${file}" -E "${program[@]}" || { @err "Rename failed: ${file#"${tree}/"}"; return; }

        [[ ! "${file}" =~ [.](${EXTRACT_PROSE})$ ]] || docs+=( "${file#"${tree}/"}" )

    done < <(grep -rIilF --exclude-dir="${EXTRACT_SKIP}" "${seek[@]}" -- "${tree}" || true)

    while IFS= read -r -d '' file; do

        [[ "${file}" =~ [.](${EXTRACT_YAML})$ ]] || continue

        core:list:has "${file#"${tree}/"}" "${docs[@]}" || docs+=( "${file#"${tree}/"}" )

    done < <(core:fs:tree:files "${tree}/${EXTRACT_FORGE}")

    (( ${#docs[@]} > 0 )) || return 0

    module:bundle:tool:ready "${EXTRACT_FORMATTER}" \
        || { @warn "${EXTRACT_FORMATTER} cannot run here; the renamed files keep their old widths"; return 0; }

    core:proc:within "${tree}" @tool "${EXTRACT_FORMATTER}" "${EXTRACT_FORMAT[@]}" "${docs[@]}" \
        || { @err "${EXTRACT_FORMATTER} failed on the renamed files"; return; }

}
module:extract:shallow () {

    local tree="${1}" kind="${2}" part="${3}" home="" name="" file=""

    [[ "${kind}" == product ]] || return 0

    home="${part%/*}"
    name="${part##*/}"
    name="${name//./[.]}"

    while IFS= read -r file; do

        [[ "${file}" =~ [.](${EXTRACT_PATHS})$ ]] || continue

        core:fs:file:edit "${file}" -E "s#[.][.]/(([.][.]/)*(${EXTRACT_HOMES})/)#\\1#g" \
            || { @err "Cannot shorten the paths of ${file#"${tree}/"}"; return; }

    done < <(grep -rIlE --exclude-dir="${EXTRACT_SKIP}" "[.][.]/([.][.]/)*(${EXTRACT_HOMES})/" -- "${tree}/${home}" 2>/dev/null || true)

    while IFS= read -r file; do

        [[ "${file}" == "${tree}/${EXTRACT_FORGE}"/* || "${file}" =~ [.](${EXTRACT_PAPERS})$ ]] || continue

        core:fs:file:edit "${file}" -E "s#${home}/(${name}|[*])/#${home}/#g" \
            || { @err "Cannot shorten the paths of ${file#"${tree}/"}"; return; }

    done < <(grep -rIlE --exclude-dir="${EXTRACT_SKIP}" "${home}/(${name}|[*])/" -- "${tree}" 2>/dev/null || true)

}
module:extract:logo () {

    local tree="${1}" name="${2}" file="${1}/${EXTRACT_README}" logo="" line="" text="" badge="" placed=0

    logo="$(config:targets:get "${name}" logo)" || return

    [[ -n "${logo}" ]] || return 0

    core:validate:url "${logo}" || { @err "[deps] ${name}: logo is an https address, not ${logo}"; return; }

    [[ -f "${file}" ]] || return 0

    while IFS= read -r line || [[ -n "${line}" ]]; do

        text+="${line}"$'\n'
        (( placed == 0 )) && [[ "${line}" == "${EXTRACT_HEADING}"* ]] || continue

        badge="${EXTRACT_BADGE//\{height\}/"${EXTRACT_LOGO}"}"

        text+="${badge//\{src\}/"${logo}"}"
        placed=1

    done < "${file}"

    printf '%s' "${text}" | core:fs:file:write "${file}" 644

}
module:extract:strip () {

    local tree="${1}" file="" name=""

    while IFS= read -r -d '' file; do

        name="${file##*/}"

        core:list:has "${name,,}" "${MANIFEST_NAMES[@]}" || continue

        core:parse:toml:drop "${file}" "${EXTRACT_TABLE}" || { @err "Strip failed: ${file#"${tree}/"}"; return; }

    done < <(core:fs:tree:files "${tree}" ".${MANIFEST_NAMES[0]##*.}")

}
module:extract:blocks () {

    local name="${1}" kind="${2}" part="${3}" short=""

    case "${kind}" in
        engine)       @print "${part##*/}" ;;
        fragment)     short="${part#"${EXTRACT_PRODUCTS}/"}"; @print "${short/\//-}=${part##*/}" ;;
        product)      config:targets:engines "${name}"; @print "${part##*/}" "${part##*/}-*" ;;
    esac

}
module:extract:prepare () {

    local name="${1}" tree="${2}" root="${TOOL_ROOT}" kind="" part="" left="" count=0
    local -a blocks=()

    module:extract:install || return

    kind="$(config:targets:get "${name}" type)" || return
    part="$(config:targets:get "${name}" path)" || return
    left="$(module:extract:left "${name}")" || return

    [[ -d "${root}/${part}" ]] || { @err "Part does not exist yet: ${part}"; return; }

    core:fs:dir:new "${tree}" 755 || return
    count="$(module:extract:files "${root}" "${kind}" "${part}" "${left}" | core:fs:tree:copy "${root}" "${tree}")" || return

    mapfile -t blocks < <(module:extract:blocks "${name}" "${kind}" "${part}")

    module:extract:changelog "${root}" "${tree}" "${blocks[@]}" || return

    module:extract:shallow "${tree}" "${kind}" "${part}" || return
    module:extract:flows:apply "${tree}" "${kind}" "${part}" "${name}" || return
    module:extract:refs "${tree}" "${name}" || return
    module:extract:rename "${tree}" "${name}" || return
    module:extract:flows:seal "${tree}" "${part}" "${name}" || return
    module:extract:logo "${tree}" "${name}" || return
    module:extract:strip "${tree}" || return

    @info "prepared ${name}: ${count} files from ${part} into ${tree}"

}
