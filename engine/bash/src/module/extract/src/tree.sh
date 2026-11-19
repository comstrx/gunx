module:extract:open () {

    core:git:is "${TOOL_ROOT}" && [[ "$(core:git:root "${TOOL_ROOT}")" -ef "${TOOL_ROOT}" ]] \
        || { @err "Extraction reads a git repository from its root, and ${TOOL_ROOT} is not one"; return; }

    config:targets:load || return
    module:extract:flags "${1:-}" || return
    config:targets:settle || return

    module:extract:table && module:extract:wired

}
module:extract:table () {

    local name="" kind="" path="" home=""
    local -A homes=()

    EXTRACT_HOMES="" EXTRACT_PRODUCTS=""

    while IFS= read -r name; do

        module:extract:whole "${name}" || return

        kind="$(config:targets:get "${name}" type)" || return
        path="$(config:targets:get "${name}" path)" || return

        homes["${path%%/*}"]=1
        home=""

        case "${kind}" in
            fragment)
                [[ "${path}" == */*/* ]] || { @err "[deps] ${name}: a fragment sits at <products>/<product>/<part>, not at ${path}"; return; }
                home="${path%/*/*}"
            ;;
            product)
                [[ "${path}" == */* ]] || { @err "[deps] ${name}: a product sits at <products>/<product>, not at ${path}"; return; }
                home="${path%/*}"
            ;;
        esac

        [[ -z "${home}" || -z "${EXTRACT_PRODUCTS}" || "${EXTRACT_PRODUCTS}" == "${home}" ]] \
            || { @err "[deps] ${name}: the products live under ${EXTRACT_PRODUCTS}, not under ${home}"; return; }

        EXTRACT_PRODUCTS="${home:-${EXTRACT_PRODUCTS}}"

    done < <(config:targets:list)

    (( ${#homes[@]} > 0 )) \
        || { @err "No distribution table: no [deps] in the tool nor in a ${MANIFEST_NAMES[0]} or ${MANIFEST_NAMES[1]} of ${TOOL_ROOT}, and no target described by flags"; return; }

    EXTRACT_PRODUCTS="${EXTRACT_PRODUCTS:-${EXTRACT_HOME}}"

    homes["${EXTRACT_ENGINES}"]=1
    homes["${EXTRACT_PRODUCTS%%/*}"]=1

    for home in "${EXTRACT_STAYS[@]}"; do
        [[ ! -d "${TOOL_ROOT}/${home}" ]] || homes["${home}"]=1
    done

    EXTRACT_HOMES="$(printf '%s\n' "${!homes[@]}" | LC_ALL=C sort | paste -sd '|' -)"
    EXTRACT_HOMES="${EXTRACT_HOMES//./[.]}"

}
module:extract:kind () {

    local path="${1:-}"

    case "${path}" in
        "${EXTRACT_ENGINES}"/*/*|"${EXTRACT_HOME}"/*/*/*) return 1 ;;
        "${EXTRACT_ENGINES}"/?*)                          @print engine ;;
        "${EXTRACT_HOME}"/?*/?*)                          @print fragment ;;
        "${EXTRACT_HOME}"/?*)                             @print product ;;
        *)                                                return 1 ;;
    esac

}
module:extract:whole () {

    local name="${1}" kind="" path="" label="" folder=""
    local -a engines=()

    kind="$(config:targets:get "${name}" type 2>/dev/null)" || kind=""
    path="$(config:targets:get "${name}" path 2>/dev/null)" || path=""
    path="${path%/}"
    label="$(config:targets:get "${name}" name)" || return

    [[ "${label}" =~ ^[A-Za-z][A-Za-z0-9_-]*$ ]] || { @err "[deps] ${name}: not a name to extract under: ${label}"; return; }

    if [[ -z "${kind}" && -n "${path}" ]]; then

        kind="$(module:extract:kind "${path}")" \
            || { @err "[deps] ${name}: ${path} tells no type; an engine sits at ${EXTRACT_ENGINES}/<name>, a product at ${EXTRACT_HOME}/<name>, its part one folder deeper, or pass --type"; return; }

    fi

    kind="${kind:-${EXTRACT_KIND}}"

    core:list:has "${kind}" "${EXTRACT_KINDS[@]}" || { @err "[deps] ${name}: type is one of ${EXTRACT_KINDS[*]}, not ${kind}"; return; }

    [[ -n "${path}" || "${kind}" != "${EXTRACT_KIND}" ]] || path="${EXTRACT_HOME}/${name}"
    [[ -n "${path}" ]] || { @err "[deps] ${name}: no path; write it in the row or pass --path"; return; }

    config:targets:set "${name}" type "${kind}" || return
    config:targets:set "${name}" path "${path%/}" || return

    if [[ "${kind}" == product ]]; then

        while IFS= read -r folder; do

            folder="${folder#"${EXTRACT_ENGINES}/"}"
            folder="${folder%/}"

            [[ -n "${folder}" && "${folder}" != */* ]] \
                || { @err "[deps] ${name}: engines takes a name or ${EXTRACT_ENGINES}/<name>, not ${folder:-an empty word}"; return; }

            engines+=( "${folder}" )

        done < <(config:targets:engines "${name}")

    fi

    config:targets:fill "${name}" engines "${engines[@]}"

}
module:extract:wired () {

    local name="" self="" folder="" src="" repo="" tag="" found=0
    local -a engines=()

    self="$(module:extract:self)" || return

    while IFS= read -r name; do

        [[ "$(config:targets:get "${name}" path)" != "${self}" ]] || continue

        mapfile -t engines < <(config:targets:engines "${name}")

        for folder in "${engines[@]}"; do

            [[ -d "${TOOL_ROOT}/${EXTRACT_ENGINES}/${folder}" ]] \
                || { @err "[deps] ${name}: engines names ${folder}, and ${EXTRACT_ENGINES}/${folder} is no folder of the root"; return; }

        done

        found=0
        ! core:list:has "${self##*/}" "${engines[@]}" || found=1

        while IFS=$'\t' read -r src repo tag; do

            [[ "${src}" != - && -d "${TOOL_ROOT}/${src}" ]] \
                || { @err "[deps] ${name}: a reference replaces a folder of the root, and ${src} is none"; return; }

            [[ "${repo}" != - ]] || { @err "[deps] ${name}: the reference of ${src} names no repository"; return; }

            [[ "${src}" != "${self}" ]] || found=1

        done < <(config:targets:refs "${name}")

        (( found == 1 )) \
            || { @err "[deps] ${name}: its workflows run the bash engine; carry it in engines or give a reference for ${self}"; return; }

    done < <(config:targets:list)

}
module:extract:source () {

    core:git:name "${TOOL_ROOT}"

}
module:extract:self () {

    local name="" path="" folder=""

    while IFS= read -r name; do

        path="$(config:targets:get "${name}" path)" || return

        ! module:extract:shell "${path}" || { @print "${path}"; return 0; }

    done < <(config:targets:list)

    for folder in "${TOOL_ROOT}/${EXTRACT_ENGINES}"/*/; do

        path="${folder#"${TOOL_ROOT}/"}"
        path="${path%/}"

        ! module:extract:shell "${path}" || { @print "${path}"; return 0; }

    done

    @err "No bash engine under ${TOOL_ROOT}: no row of [deps] nor a folder of ${EXTRACT_ENGINES}/ holds a ${MANIFEST_NAMES[0]} and ${MANIFEST[paths.entrypoint]}"

}
module:extract:shell () {

    [[ -f "${TOOL_ROOT}/${1}/${MANIFEST[paths.entrypoint]}" ]] && config:manifest:find "${TOOL_ROOT}/${1}" >/dev/null

}
module:extract:tool () {

    local name="${1}" self="${2}" src="" repo="" tag=""

    while IFS=$'\t' read -r src repo tag; do

        [[ "${src}" != "${self}" ]] || { @print "${repo}"$'\t'"${tag}"; return 0; }

    done < <(config:targets:refs "${name}")

    @err "[deps] ${name}: no reference for ${self}"

}
module:extract:row () {

    local path="${1}" name=""

    while IFS= read -r name; do

        [[ "$(config:targets:get "${name}" path)" != "${path}" ]] || { @print "${name}"; return 0; }

    done < <(config:targets:list)

    @err "No target of [deps] sits at ${path}"

}
module:extract:local () {

    local name="${1}" self="${2}"

    module:extract:carries "${name}" "${self}" && ! module:extract:tool "${name}" "${self}" >/dev/null 2>&1

}
module:extract:carries () {

    local name="${1}" path="${2}"
    local -a engines=()

    [[ "${path}" == "${EXTRACT_ENGINES}"/* ]] || return 1

    mapfile -t engines < <(config:targets:engines "${name}")

    core:list:has "${path##*/}" "${engines[@]}"

}
module:extract:left () {

    local name="${1}" target="" path="" folder="" left=""
    local -A seen=()

    [[ "$(config:targets:get "${name}" type)" == product ]] || return 0

    while IFS= read -r target; do

        [[ "$(config:targets:get "${target}" type)" != engine ]] || seen["$(config:targets:get "${target}" path)"]=1

    done < <(config:targets:list)

    for folder in "${TOOL_ROOT}/${EXTRACT_ENGINES}"/*/; do

        [[ -d "${folder}" ]] || continue

        path="${folder#"${TOOL_ROOT}/"}"
        seen["${path%/}"]=1

    done

    while IFS= read -r path; do

        [[ -n "${path}" ]] || continue

        module:extract:carries "${name}" "${path}" || left+="${left:+|}${path//./[.]}"

    done < <(printf '%s\n' "${!seen[@]}" | LC_ALL=C sort)

    @print "${left}"

}
module:extract:repository () {

    local name="${1}" spec=""

    spec="$(config:targets:get "${name}" repo)" || return

    [[ -n "${spec}" ]] || { @err "[deps] ${name}: no repo nor owner; a mirror needs one, in the row or by --repo or --owner"; return; }

    core:git:resolve "${spec}" "${TOOL_ROOT}"

}
module:extract:needs () {

    local name="${1}" src="" repo="" tag="" target=""

    while IFS=$'\t' read -r src repo tag; do

        while IFS= read -r target; do
            [[ "$(config:targets:get "${target}" repo)" != "${repo}" ]] || @print "${target}"
        done < <(config:targets:list)

    done < <(config:targets:refs "${name}")

}
module:extract:order () {

    local name="" need="" ready=0 moved=1
    local -a waiting=() later=() order=()

    mapfile -t waiting < <(config:targets:list)

    while (( ${#waiting[@]} > 0 && moved == 1 )); do

        moved=0
        later=()

        for name in "${waiting[@]}"; do

            ready=1

            while IFS= read -r need; do
                [[ -z "${need}" ]] || core:list:has "${need}" "${order[@]}" || ready=0
            done < <(module:extract:needs "${name}")

            if (( ready == 1 )); then order+=( "${name}" ); moved=1
            else later+=( "${name}" )
            fi

        done

        waiting=( "${later[@]}" )

    done

    (( ${#waiting[@]} == 0 )) || { @err "[deps] depend on each other in a circle: ${waiting[*]}"; return; }

    @print "${order[@]}"

}
module:extract:keep () {

    local kind="${1}" part="${2}" path="${3}" left="${4:-}"

    case "${kind}" in
        engine|fragment) [[ "${path}" == "${part}/"* ]] ;;
        product)
            [[ "${path}" != "${EXTRACT_PRODUCTS}/"* || "${path}" == "${part}/"* ]] || return 1
            [[ -z "${left}" || ! "${path}" =~ ^(${left})/ ]]
        ;;
        *) return 1 ;;
    esac

}
module:extract:stays () {

    local path="${1}" part="${2:-}"

    [[ "${path%%/*}" != "${part%%/*}" ]] && core:list:has "${path%%/*}" "${EXTRACT_STAYS[@]}"

}
module:extract:files () {

    local root="${1}" kind="${2}" part="${3}" left="${4:-}" path="" target=""

    while IFS= read -r -d '' path; do

        module:extract:travels "${kind}" "${part}" "${path}" "${left}" || continue

        target="${path}"

        if [[ "${kind}" != product ]]; then ! module:extract:keep "${kind}" "${part}" "${path}" || target="${path#"${part}/"}"
        elif [[ "${path}" != */* ]]; then [[ ! -e "${root}/${part}/${path}" ]] || continue
        elif [[ "${path}" == "${part}/"*/* ]]; then target="${part%/*}/${path#"${part}/"}"
        elif [[ "${path}" == "${part}/"* ]]; then target="${path#"${part}/"}"
        fi

        printf '%s\t%s\n' "${path}" "${target}"

    done < <(core:git:files "${root}")

}
module:extract:travels () {

    local kind="${1}" part="${2}" path="${3}" left="${4:-}"

    ! module:extract:stays "${path}" "${part}" || return 1

    module:extract:keep "${kind}" "${part}" "${path}" "${left}" && return 0
    [[ "${kind}" != product ]] || return 1

    [[ "${path}" == "${EXTRACT_FORGE}"/* ]] && return 0

    [[ "${path}" != */* && "${path}" != "${EXTRACT_CHANGELOG}" && ! -e "${TOOL_ROOT}/${part}/${path}" ]]

}
