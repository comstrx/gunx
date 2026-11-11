module:gate:changes () {

    local root="" base=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    base="$(module:gate:base "${root}")" || return

    module:gate:since "${root}" "${base}" view

}
module:gate:base () {

    local root="${1}" base=""

    ! core:cli:flag --all && [[ "${CI_ALL:-false}" != true ]] || return 0

    if base="$(core:cli:value --base)"; then

        core:git:has "${root}" "${base}" || { @err "Cannot diff against ${base}"; return; }

    else

        base="${CI_BASE:-HEAD~1}"
        core:git:has "${root}" "${base}" || { @warn "Cannot diff against ${base}; everything is gated"; return 0; }

    fi

    @print "${base}"

}
module:gate:owners () {

    local path="" rest="" project="" owner=""

    while IFS= read -r path; do

        [[ -n "${path}" ]] || continue

        owner="root=root"

        case "${path}" in
            engine/*/*)
                rest="${path#engine/}"
                ! core:list:has "${rest%%/*}" "${GATE_ENGINES[@]}" || owner="engine=${rest%%/*}"
            ;;
            product/*/*/*)
                rest="${path#product/}"
                project="${rest%%/*}"
                rest="${rest#*/}"
                ! core:list:has "${rest%%/*}" "${GATE_FRAGMENTS[@]}" || owner="product=${project}/${rest%%/*}"
            ;;
            tutor/*)
                owner="tutor=tutor"
            ;;
        esac

        printf '%s\t%s\n' "${owner}" "${path}"

    done

}
module:gate:parts () {

    module:gate:owners | cut -f1 | sort -u

}
module:gate:files () {

    local root="${1}" part="${2}" product="${3:-}" wanted="root=root" owner="" path=""

    if core:list:has "${part}" "${GATE_ENGINES[@]}"; then wanted="engine=${part}"
    elif core:list:has "${part}" "${GATE_FRAGMENTS[@]}"; then wanted="product=${product}/${part}"
    elif [[ "${part}" == tutor ]]; then wanted="tutor=tutor"
    fi

    module:gate:mono "${root}" || wanted=""

    module:gate:owners | while IFS=$'\t' read -r owner path; do

        [[ -n "${wanted}" && "${owner}" != "${wanted}" ]] || @print "${path}"

    done

}
module:gate:fragment () {

    local root="${1}" fragment="${2}" changed="${3}" moved="${4}" touched="${5:-0}" project="" home="" engine=""

    for project in $(module:gate:projects "${root}" "${fragment}"); do

        if [[ "${project}" == . ]]; then home="${root}"
        else home="${root}/product/${project}/${fragment}"
        fi

        engine="$(module:gate:engine "${home}")" || continue

        if [[ "${project}" == . ]]; then
            (( touched == 1 )) || continue
        else
            [[ " ${moved} " == *" infra "* || " ${moved} " == *" ${engine} "* || " ${changed} " == *" ${project}/${fragment} "* ]] || continue
        fi

        @print "${project}"

    done

}
module:gate:plan () {

    local root="${1}" every="${2:-0}" paths="${3:-}" owner="" part="" project="" touched=0
    local -a products=() projects=()
    local -A moved=()

    while IFS= read -r owner; do

        touched=1

        case "${owner}" in
            engine=*)  moved["${owner#*=}"]=1 ;;
            product=*) products+=( "${owner#*=}" ) ;;
            *)         moved["${owner%%=*}"]=1 ;;
        esac

    done < <(module:gate:parts <<< "${paths}")

    if ! module:gate:mono "${root}"; then

        (( every == 0 && touched == 0 )) || module:gate:self "${root}"

        return 0

    fi

    for part in "${GATE_ENGINES[@]}"; do

        [[ -d "${root}/engine/${part}" ]] || continue
        (( every == 1 )) || [[ -n "${moved[${part}]+x}" ]] || continue

        @print "${part}"

    done

    if [[ -d "${root}/tutor" ]] && { (( every == 1 )) || [[ -n "${moved[tutor]+x}" ]]; }; then @print tutor; fi
    if (( every == 1 )) || [[ -n "${moved[root]+x}" || -n "${moved[infra]+x}" ]]; then @print root; fi

    for part in "${GATE_FRAGMENTS[@]}"; do

        if (( every == 1 )); then mapfile -t projects < <(module:gate:projects "${root}" "${part}")
        else mapfile -t projects < <(module:gate:fragment "${root}" "${part}" "${products[*]}" "${!moved[*]}" "${touched}")
        fi

        for project in "${projects[@]}"; do

            [[ -z "${project}" ]] || @print "${part} ${project}"

        done

    done

}
module:gate:pick () {

    local wanted="${1:-}" only="${2:-}" part="" product=""

    while read -r part product; do

        [[ -n "${part}" ]] || continue
        [[ -z "${wanted}" || "${part}" == "${wanted}" ]] || continue
        [[ -z "${only}" || -z "${product}" || "${product}" == "${only}" ]] || continue

        @print "${part}${product:+ ${product}}"

    done

}
module:gate:present () {

    local root="${1}" first="" part="" product=""

    first="$(module:gate:product "${root}" "" 2>/dev/null)" || first=""

    module:gate:plan "${root}" 1 | module:gate:pick "" "${first}" | while read -r part product; do
        @print "${part}"
    done

}
module:gate:select () {

    local root="${1}" base="${2:-}" paths="${3:-}" part="" product="" every=0

    part="$(core:cli:value --part)" || part=""
    product="$(core:cli:value --product)" || product=""

    [[ -z "${part}" ]] || module:gate:known "${part}" || return
    [[ -z "${product}" ]] || module:gate:product "${root}" "${product}" >/dev/null || return
    [[ -n "${base}" ]] || every=1

    module:gate:plan "${root}" "${every}" "${paths}" | module:gate:pick "${part}" "${product}"

}
module:gate:view () {

    local root="${1}" base="${2}" paths="${3}" detail="" target="" part="" product=""
    local -a files=() rows=()

    shift 3

    (( $# > 0 )) || { module:gate:idle "${root}" "${base}"; return 0; }

    detail="$(core:cli:value --part)" || detail=""

    if [[ -n "${base}" ]]; then @info "Changes since ${base}"
    else @info "Everything under ${root}"
    fi

    for target in "$@"; do

        read -r part product <<< "${target}"
        mapfile -t files < <(module:gate:files "${root}" "${part}" "${product}" <<< "${paths}")

        if [[ -z "${base}" ]]; then rows+=( "${target}" )
        elif (( ${#files[@]} == 0 )); then rows+=( "${target}"$'\t'"follows what it builds on" )
        elif [[ -z "${detail}" ]]; then rows+=( "${target}"$'\t'"${#files[@]} changed" )
        else @print "${files[@]}"
        fi

    done

    (( ${#rows[@]} == 0 )) || @print "${rows[@]}" | core:ui:table

}
