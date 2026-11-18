module:extract:changelog () {

    local root="${1}" tree="${2}" line="" text="# Changelog" block=0 name="" spec="" shown="" LC_ALL=C

    shift 2

    [[ -f "${root}/CHANGELOG.md" ]] || return 0

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

    done < "${root}/CHANGELOG.md"

    printf '%s\n' "${text}" | core:fs:file:write "${tree}/CHANGELOG.md" 644

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
module:extract:shallow () {

    local tree="${1}" kind="${2}" part="${3}" home="" name="" file=""

    [[ "${kind}" == product ]] || return 0

    home="${part%/*}"
    name="${part##*/}"
    name="${name//./[.]}"

    while IFS= read -r file; do

        [[ "${file}" == *.@(json|jsonc|toml|yml|yaml|mod|work) ]] || continue

        core:fs:file:edit "${file}" -E "s#[.][.]/(([.][.]/)*(${EXTRACT_HOMES})/)#\\1#g" || { @err "Cannot shorten the paths of ${file#"${tree}/"}"; return; }

    done < <(grep -rIlE --exclude-dir=.git "[.][.]/([.][.]/)*(${EXTRACT_HOMES})/" -- "${tree}/${home}" 2>/dev/null || true)

    while IFS= read -r file; do

        [[ "${file}" == "${tree}"/.github/* || "${file}" == *.@(md|yml|yaml|toml) ]] || continue

        core:fs:file:edit "${file}" -E "s#${home}/(${name}|[*])/#${home}/#g" || { @err "Cannot shorten the paths of ${file#"${tree}/"}"; return; }

    done < <(grep -rIlE --exclude-dir=.git "${home}/(${name}|[*])/" -- "${tree}" 2>/dev/null || true)

}
module:extract:logo () {

    local tree="${1}" name="${2}" file="${1}/README.md" logo="" line="" text="" placed=0

    logo="$(config:targets:get "${name}" logo)" || return

    [[ -n "${logo}" ]] || return 0
    [[ "${logo}" == https://* && "${logo}" != *[[:space:]\"\<\>]* ]] || { @err "[deps] ${name}: logo is an https address, not ${logo}"; return; }

    [[ -f "${file}" ]] || return 0

    while IFS= read -r line || [[ -n "${line}" ]]; do

        text+="${line}"$'\n'

        (( placed == 0 )) && [[ "${line}" == '# '* ]] || continue

        text+=$'\n<div align="center">\n  <br/>\n  <img height="'"${EXTRACT_LOGO}"'" src="'"${logo}"$'"/>\n  <br/>\n  <br/>\n</div>\n'
        placed=1

    done < "${file}"

    printf '%s' "${text}" | core:fs:file:write "${file}" 644

}
module:extract:strip () {

    local tree="${1}" file="" name=""

    while IFS= read -r -d '' file; do

        name="${file##*/}"

        core:list:has "${name,,}" "${MANIFEST_NAMES[@]}" || continue

        core:parse:toml:drop "${file}" deps || { @err "Strip failed: ${file#"${tree}/"}"; return; }

    done < <(core:fs:tree:files "${tree}" .toml)

}
module:extract:blocks () {

    local name="${1}" kind="${2}" part="${3}" short=""

    case "${kind}" in
        engine|tutor) @print "${part##*/}" ;;
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
    module:extract:deps "${tree}" "${name}" "${kind}" || return
    module:extract:rename "${tree}" "${name}" || return
    module:extract:flows:seal "${tree}" "${part}" "${name}" || return
    module:extract:logo "${tree}" "${name}" || return
    module:extract:strip "${tree}" || return

    @info "prepared ${name}: ${count} files from ${part} into ${tree}"

}
