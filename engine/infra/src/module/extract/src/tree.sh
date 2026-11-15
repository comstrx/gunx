module:extract:source () {

    local root="" origin=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    if origin="$(module:extract:git:origin "${root}" 2>/dev/null)"; then @print "${origin##*/}"
    else @print "${root##*/}"
    fi

}
module:extract:self () {

    local root="" engine="" name="" path=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return
    root="$(cd -- "${root}" && pwd -P)" || return
    engine="$(cd -- "${TOOL_ENGINE}" && pwd -P)" || return

    if [[ "${engine}" == "${root}/"* ]]; then @print "${engine#"${root}/"}"; return 0; fi

    while IFS= read -r name; do

        path="$(config:targets:get "${name}" path)" || return

        [[ -f "${root}/${path}/${MANIFEST[paths.entrypoint]}" ]] && config:manifest:file "${root}/${path}" >/dev/null 2>&1 \
            && { @print "${path}"; return 0; }

    done < <(config:targets:list)

    @err "No target of the table is this engine under ${root}"

}
module:extract:kind () {

    local name="${1}"

    if [[ "${name}" == product/* ]]; then @print product
    else config:targets:get "${name}" type
    fi

}
module:extract:part () {

    local name="${1}"

    if [[ "${name}" == product/* ]]; then @print "${name}"
    else config:targets:get "${name}" path
    fi

}
module:extract:title () {

    local name="${1}"

    if [[ "${name}" == product/* ]]; then @print "${name#product/}"
    else config:targets:get "${name}" title
    fi

}
module:extract:repository () {

    local name="${1}" root="" spec=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    if spec="$(core:cli:value --repository)"; then :
    elif [[ "${name}" == product/* ]]; then spec="$(config:targets:product "${root}" "${name#product/}" repository)" || return
    else spec="$(config:targets:get "${name}" repo)" || return
    fi

    module:extract:git:resolve "${spec}" "${root}"

}
module:extract:keep () {

    local kind="${1}" part="${2}" path="${3}" project=""

    case "${kind}" in
        engine|fragment) [[ "${path}" == "${part}/"* ]] ;;
        tutor)           [[ "${path}" == tutor/* && "${path}" != tutor/stack/product/* ]] ;;
        product)
            project="${part#product/}"

            [[ "${path}" != product/* || "${path}" == "product/${project}/"* ]] \
                && [[ "${path}" != tutor/stack/product/* || "${path}" == "tutor/stack/product/${project}/"* ]]
        ;;
        *) return 1 ;;
    esac

}
module:extract:governance () {

    local path="${1}"

    case "${path}" in
        .github/*|.git/*|README.md|AGENTS.md|CHANGELOG.md) return 1 ;;
        .*|LICENSE|CODE_OF_CONDUCT.md|CONTRIBUTING.md|SECURITY.md|SUPPORT.md) [[ "${path}" != */* ]] ;;
        *) return 1 ;;
    esac

}
module:extract:files () {

    local root="${1}" kind="${2}" part="${3}" path=""

    while IFS= read -r -d '' path; do

        module:extract:travels "${kind}" "${part}" "${path}" || continue

        if [[ "${kind}" == product ]] || ! module:extract:keep "${kind}" "${part}" "${path}"; then printf '%s\t%s\n' "${path}" "${path}"
        else printf '%s\t%s\n' "${path}" "${path#"${part}/"}"
        fi

    done < <(core:git:files "${root}")

}
module:extract:travels () {

    local kind="${1}" part="${2}" path="${3}"

    module:extract:keep "${kind}" "${part}" "${path}" && return 0
    [[ "${kind}" != product ]] || return 1

    module:extract:governance "${path}" || module:extract:flows:files "${kind}" "${part}" "${path}"

}
module:extract:gatename () {

    local kind="${1}" part="${2}"

    case "${kind}" in
        engine)   @print "${part#engine/}" ;;
        fragment) @print "${part##*/}" ;;
        tutor)    @print tutor ;;
        product)  @print product ;;
        *)        @err "Unknown kind: ${kind}" ;;
    esac

}
