module:gate:parts () {

    local path="" project="" fragment=""

    while IFS= read -r path; do

        [[ -n "${path}" ]] || continue

        case "${path}" in
            engine/*/*)
                @print "engine=${path#engine/}" | sed 's#/.*##'
            ;;
            product/*/*)
                project="${path#product/}"
                fragment="${project#*/}"
                project="${project%%/*}"
                @print "product=${project}/${fragment%%/*}"
            ;;
            tutor/*)
                @print "tutor=tutor"
            ;;
            *)
                @print "global=root"
            ;;
        esac

    done | sort -u

}
module:gate:changes () {

    local root="" base="" line="" key="" value="" fragment="" part="" project="" touched=0 every=0

    local -a products=() projects=() rows=()
    local -A moved=()

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    base="$(core:cli:value --base)" || base="${CI_BASE:-HEAD~1}"

    ! core:cli:flag --all && [[ "${CI_ALL:-false}" != true ]] || every=1

    if (( every == 0 )); then

        while IFS= read -r line; do

            key="${line%%=*}"
            value="${line#*=}"
            touched=1

            case "${key}" in
                engine)  moved["${value}"]=1 ;;
                product) products+=( "${value}" ) ;;
                tutor)   moved[tutor]=1 ;;
                global)  moved[global]=1 ;;
            esac

        done < <(core:git:changed "${root}" "${base}" | module:gate:parts)

    fi

    if [[ ! -d "${root}/product" && ! -d "${root}/engine" ]]; then

        (( every == 1 || touched == 1 )) || { module:gate:emit; return; }

        while IFS= read -r part; do
            module:gate:row rows "${part}" ""
        done < <(module:gate:self "${root}")

        module:gate:emit "${rows[@]}"

        return 0

    fi

    for part in rust python go bun infra; do

        [[ -d "${root}/engine/${part}" ]] || continue
        (( every == 1 )) || [[ -n "${moved[${part}]+x}" ]] || continue

        module:gate:row rows "${part}" ""

    done

    if [[ -d "${root}/tutor" ]] && { (( every == 1 )) || [[ -n "${moved[tutor]+x}" ]]; }; then module:gate:row rows tutor ""; fi
    if (( every == 1 )) || [[ -n "${moved[global]+x}" || -n "${moved[infra]+x}" ]]; then module:gate:row rows global ""; fi

    for fragment in api web mobile desktop; do

        if (( every == 1 )); then mapfile -t projects < <(module:gate:projects "${root}" "${fragment}")
        else mapfile -t projects < <(module:gate:fragment "${root}" "${fragment}" "${products[*]}" "${!moved[*]}" "${touched}")
        fi

        for project in "${projects[@]}"; do

            [[ -n "${project}" ]] || continue

            module:gate:row rows "${fragment}" "${project}"

        done

    done

    module:gate:emit "${rows[@]}"

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
module:gate:manifest () {

    module:gate:engine "${1}" >/dev/null

}
module:gate:engine () {

    local directory="${1}"

    if [[ -f "${directory}/pyproject.toml" ]]; then @print python
    elif [[ -f "${directory}/Cargo.toml" ]]; then @print rust
    elif [[ -f "${directory}/go.work" || -f "${directory}/go.mod" ]]; then @print go
    elif [[ -f "${directory}/package.json" ]]; then @print bun
    else return 1
    fi

}
module:gate:projects () {

    local root="${1}" fragment="${2}" directory=""

    if [[ ! -d "${root}/product" ]]; then
        ! module:gate:manifest "${root}" || @print .
        return 0
    fi

    for directory in "${root}"/product/*/"${fragment}"; do

        module:gate:manifest "${directory}" || continue

        directory="${directory%/*}"
        @print "${directory##*/}"

    done

}
module:gate:row () {

    local -n _rows="${1}"
    local part="${2}" product="${3}" os=""

    for os in $(module:gate:runners "${part}"); do
        _rows+=( "{\"part\":\"${part}\",\"product\":\"${product}\",\"os\":\"${os}\"}" )
    done

}
module:gate:runners () {

    case "${1}" in
        infra|global) @print ubuntu-latest macos-latest ;;
        *)            @print ubuntu-latest ;;
    esac

}
module:gate:self () {

    local root="${1}" engine=""

    if [[ -f "${root}/infra.toml" && -f "${root}/src/main.sh" ]]; then
        @print infra
    elif engine="$(module:gate:engine "${root}")"; then
        if [[ "${engine}" == bun ]] && grep -q '"gate"' -- "${root}/package.json"; then @print web
        else @print "${engine}"
        fi
    elif [[ -f "${root}/index.md" ]]; then
        @print tutor
    fi

    @print global

}
module:gate:emit () {

    local body=""

    (( $# == 0 )) || body="$(core:str:join , "$@")"

    @print "matrix=[${body}]"

    [[ -z "${GITHUB_OUTPUT:-}" ]] || printf 'matrix=[%s]\n' "${body}" >> "${GITHUB_OUTPUT}"

}
