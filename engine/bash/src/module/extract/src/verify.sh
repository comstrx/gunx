module:extract:words () {

    local word="${1}" own="${2:-}" directory="" words="${1}" name=""

    for directory in "${TOOL_ROOT}/${EXTRACT_PRODUCTS}"/*/; do

        [[ -n "${EXTRACT_PRODUCTS}" && -d "${directory}" ]] || continue

        directory="${directory%/}"
        name="${directory##*/}"

        [[ "${name}" != "${own}" ]] || continue

        words+="${words:+|}${name}"

    done

    [[ -n "${words}" ]] || return 0

    @print "\b(${words})\b"

}
module:extract:loose () {

    local kind="${1}" path="${2}"

    case "${kind}" in
        fragment) [[ "${path}" != "${EXTRACT_FORGE}"/* ]] || return ;;
        product)  [[ "${path}" == "${EXTRACT_PRODUCTS}"/* ]] || return ;;
        *)        return 1 ;;
    esac

    [[ ! "${path}" =~ [.](${EXTRACT_PAPERS})$ ]]

}
module:extract:verify () {

    local tree="${1}" kind="${2}" name="${3:-}" file="" failed=0 word="" words="" cache="" part="" left="" entry="" pattern=""

    word="$(module:extract:source)" || return
    cache="$(config:paths:cache)" || return

    entry="${MANIFEST[paths.entrypoint]##*/}"
    entry="${entry//./[.]}"

    [[ -z "${name}" ]] || part="$(config:targets:get "${name}" path)" || return

    if [[ "${kind}" == product ]]; then

        words="$(module:extract:words "${word}" "${part##*/}")" || return
        left="$(module:extract:left "${name}")" || return

        module:extract:scan "${tree}" "${words}" "the monorepo name or another product's name" '' "${kind}" || failed=1

        [[ -z "${left}" ]] || module:extract:scan "${tree}/${EXTRACT_FORGE}" "(^|[^A-Za-z0-9_-])(${left})(/|[^A-Za-z0-9_/-]|\$)" 'an engine that stayed behind' sensitive || failed=1

    else

        words="$(module:extract:words "${word}")" || return

        module:extract:scan "${tree}/${EXTRACT_FORGE}" "(^|[^A-Za-z0-9_./-]|${EXTRACT_SELF}|[.]/|[.][.]/)(${EXTRACT_HOMES})/|${entry}" 'a monorepo path' sensitive || failed=1
        module:extract:scan "${tree}" "${words}" 'a monorepo or product name' '' "${kind}" || failed=1

    fi

    [[ ! -e "${tree}/${cache}" ]] || { @err "verify: the lab ${cache} travels in the tree" || failed=1; }

    while IFS= read -r -d '' file; do

        [[ "${file}" != */"${EXTRACT_SKIP}"/* ]] || continue

        ! core:list:has "${file##*/}" "${EXTRACT_SAMPLES[@]}" || continue

        for pattern in "${EXTRACT_SECRETS[@]}"; do

            [[ "${file##*/}" != "${pattern}"* ]] || { @err "verify: a secrets file in the tree: ${file#"${tree}/"}" || failed=1; break; }

        done

    done < <(core:fs:tree:files "${tree}")

    (( failed == 0 )) || { @err "verify refused the tree"; return; }

    @succ "verified ${tree}"

}
module:extract:scan () {

    local tree="${1}" pattern="${2}" what="${3}" sensitive="${4:-}" kind="${5:-}" file="" path="" failed=0
    local -a flags=( -rIlE --exclude-dir="${EXTRACT_SKIP}" )

    [[ -n "${pattern}" && -d "${tree}" ]] || return 0
    [[ -n "${sensitive}" ]] || flags+=( -i )

    while IFS= read -r file; do

        [[ -n "${file}" ]] || continue

        path="${file#"${tree%/"${EXTRACT_FORGE}"}/"}"

        [[ -z "${kind}" ]] || ! module:extract:loose "${kind}" "${path}" || continue

        @err "verify: ${what} in ${path}: $(grep -IoE "${flags[@]:2}" -- "${pattern}" "${file}" | sort -u | tr '\n' ' ')" || failed=1

    done < <(grep "${flags[@]}" -- "${pattern}" "${tree}" 2>/dev/null || true)

    (( failed == 0 ))

}
