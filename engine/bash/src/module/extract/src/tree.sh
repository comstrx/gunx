module:extract:open () {

    core:git:is "${TOOL_ROOT}" && [[ "$(core:git:root "${TOOL_ROOT}")" -ef "${TOOL_ROOT}" ]] \
        || { @err "Extraction reads a git repository from its root, and ${TOOL_ROOT} is not one"; return; }

    config:targets:load || return

    module:extract:table && module:extract:wired

}
module:extract:table () {

    local name="" kind="" path="" home=""
    local -A homes=()

    EXTRACT_HOMES="" EXTRACT_PRODUCTS="" EXTRACT_TUTOR=""

    while IFS= read -r name; do

        kind="$(config:targets:get "${name}" type)" || return
        path="$(config:targets:get "${name}" path)" || return

        core:list:has "${kind}" "${EXTRACT_KINDS[@]}" || { @err "[deps] ${name}: type is one of ${EXTRACT_KINDS[*]}, not ${kind}"; return; }

        homes["${path%%/*}"]=1
        home=""

        case "${kind}" in
            tutor) EXTRACT_TUTOR="${path}" ;;
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
        || { @err "No distribution table: no [deps] in the tool nor in a ${MANIFEST_NAMES[0]} or ${MANIFEST_NAMES[1]} of ${TOOL_ROOT}"; return; }

    EXTRACT_HOMES="$(printf '%s\n' "${!homes[@]}" | LC_ALL=C sort | paste -sd '|' -)"
    EXTRACT_HOMES="${EXTRACT_HOMES//./[.]}"

}
module:extract:wired () {

    local name="" self="" tool="" folder="" repo="" label="" tag="" path="" found=0
    local -a engines=() folders=()

    self="$(module:extract:self)" || return
    tool="$(module:extract:mirror "${self}")" || return

    while IFS= read -r name; do
        [[ "$(config:targets:get "${name}" type)" != engine ]] || folders+=( "$(config:targets:get "${name}" path)" )
    done < <(config:targets:list)

    folders=( "${folders[@]##*/}" )

    while IFS= read -r name; do

        [[ "$(config:targets:get "${name}" path)" != "${self}" ]] || continue

        mapfile -t engines < <(config:targets:engines "${name}")

        [[ ${#engines[@]} -eq 0 || "$(config:targets:get "${name}" type)" == product ]] \
            || { @err "[deps] ${name}: engines belongs to a product; a tool names its engine in deps"; return; }

        for folder in "${engines[@]}"; do

            core:list:has "${folder}" "${folders[@]}" \
                || { @err "[deps] ${name}: engines names ${folder}, and no engine of the table sits in a folder of that name"; return; }

        done

        found=0
        ! core:list:has "${self##*/}" "${engines[@]}" || found=1

        while IFS=$'\t' read -r label repo tag; do

            path="$(module:extract:carrier "${repo}")" || { @err "[deps] ${name}: the dependency ${label:-?} names no mirror of the table"; return; }

            ! core:list:has "${path##*/}" "${engines[@]}" \
                || { @err "[deps] ${name}: ${path##*/} is in engines and ${repo} is in deps; one of the two"; return; }

            [[ "${repo}" != "${tool}" ]] || found=1

        done < <(config:targets:deps "${name}")

        (( found == 1 )) || { @err "[deps] ${name}: its workflows run the bash engine; name ${tool} in its deps"; return; }

    done < <(config:targets:list)

}
module:extract:source () {

    core:git:name "${TOOL_ROOT}"

}
module:extract:self () {

    local name="" path=""

    while IFS= read -r name; do

        path="$(config:targets:get "${name}" path)" || return

        [[ -f "${TOOL_ROOT}/${path}/${MANIFEST[paths.entrypoint]}" ]] && config:manifest:find "${TOOL_ROOT}/${path}" >/dev/null \
            && { @print "${path}"; return 0; }

    done < <(config:targets:list)

    @err "No target of [deps] is the bash engine under ${TOOL_ROOT}"

}
module:extract:mirror () {

    local name=""

    name="$(module:extract:row "${1}")" || return

    config:targets:get "${name}" repo

}
module:extract:name () {

    local name="${1}" given="" repo=""

    given="$(config:targets:get "${name}" name 2>/dev/null)" || given=""

    if [[ -z "${given}" ]]; then

        repo="$(config:targets:get "${name}" repo 2>/dev/null)" || repo=""
        repo="${repo%/}"
        repo="${repo%.git}"

        given="${repo##*/}"

    fi

    given="${given:-${name}}"

    [[ "${given}" =~ ^[A-Za-z][A-Za-z0-9_-]*$ ]] || { @err "[deps] ${name}: not a name to extract under: ${given}"; return; }

    @print "${given}"

}
module:extract:row () {

    local path="${1}" name=""

    while IFS= read -r name; do

        [[ "$(config:targets:get "${name}" path)" != "${path}" ]] || { @print "${name}"; return 0; }

    done < <(config:targets:list)

    @err "No target of [deps] sits at ${path}"

}
module:extract:carrier () {

    local repo="${1}" name=""

    while IFS= read -r name; do

        [[ "$(config:targets:get "${name}" repo)" != "${repo}" ]] || { config:targets:get "${name}" path; return; }

    done < <(config:targets:list)

    @err "No target of [deps] mirrors to ${repo}"

}
module:extract:carries () {

    local name="${1}" path="${2}"
    local -a engines=()

    mapfile -t engines < <(config:targets:engines "${name}")

    core:list:has "${path##*/}" "${engines[@]}"

}
module:extract:left () {

    local name="${1}" target="" path="" left=""

    [[ "$(config:targets:get "${name}" type)" == product ]] || return 0

    while IFS= read -r target; do

        [[ "$(config:targets:get "${target}" type)" == engine ]] || continue

        path="$(config:targets:get "${target}" path)" || return

        module:extract:carries "${name}" "${path}" || left+="${left:+|}${path//./[.]}"

    done < <(config:targets:list)

    @print "${left}"

}
module:extract:repository () {

    local name="${1}" spec=""

    spec="$(config:targets:get "${name}" repo)" || return

    core:git:resolve "${spec}" "${TOOL_ROOT}"

}
module:extract:needs () {

    local name="${1}" label="" repo="" tag="" target=""

    while IFS=$'\t' read -r label repo tag; do

        while IFS= read -r target; do
            [[ "$(config:targets:get "${target}" repo)" != "${repo}" ]] || @print "${target}"
        done < <(config:targets:list)

    done < <(config:targets:deps "${name}")

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

    local kind="${1}" part="${2}" path="${3}" left="${4:-}" notes="${EXTRACT_TUTOR}/stack"

    case "${kind}" in
        engine|fragment) [[ "${path}" == "${part}/"* ]] ;;
        tutor)           [[ "${path}" == "${part}/"* && "${path}" != "${notes}/${EXTRACT_PRODUCTS}/"* ]] ;;
        product)
            [[ -z "${EXTRACT_TUTOR}" || "${path}" != "${EXTRACT_TUTOR}/"* ]] || return 1
            [[ "${path}" != "${EXTRACT_PRODUCTS}/"* || "${path}" == "${part}/"* ]] || return 1
            [[ -z "${left}" || ! "${path}" =~ ^(${left})/ ]]
        ;;
        *) return 1 ;;
    esac

}
module:extract:stays () {

    local path="${1}" part="${2:-}"

    core:list:has "${path##*/}" "${EXTRACT_LOCKS[@]}" || { [[ "${path%%/*}" != "${part%%/*}" ]] && core:list:has "${path%%/*}" "${EXTRACT_STAYS[@]}"; }

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

    [[ "${path}" == .github/* ]] && return 0

    [[ "${path}" != */* && "${path}" != CHANGELOG.md && ! -e "${TOOL_ROOT}/${part}/${path}" ]]

}
