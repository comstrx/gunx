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
module:extract:manifest () {

    local tree="${1}" kind="${2}" part="${3}"

    case "${kind}" in
        tutor)   [[ -f "${tree}/index.md" ]] || @err "verify: no index.md at the root of ${tree}" ;;
        product) [[ -d "${tree}/${part}" ]] || @err "verify: no ${part} in ${tree}" ;;
        *)       module:extract:language "${tree}" || @err "verify: no manifest of a language at the root of ${tree}" ;;
    esac

}
module:extract:verify () {

    local tree="${1}" kind="${2}" name="${3:-}" file="" failed=0 word="" words="" cache="" part="" left=""

    word="$(module:extract:source)" || return
    cache="$(config:paths:cache)" || return

    [[ -z "${name}" ]] || part="$(config:targets:get "${name}" path)" || return

    module:extract:manifest "${tree}" "${kind}" "${part}" || failed=1

    if [[ "${kind}" == product ]]; then

        words="$(module:extract:words "${word}" "${part##*/}")" || return
        left="$(module:extract:left "${name}")" || return

        module:extract:scan "${tree}" "${words}" "the monorepo name or another product's name" || failed=1

        [[ -z "${left}" ]] || module:extract:scan "${tree}/.github" "(^|[^A-Za-z0-9_-])(${left})(/|[^A-Za-z0-9_/-]|\$)" 'an engine that stayed behind' sensitive || failed=1

    else

        words="$(module:extract:words "${word}")" || return

        module:extract:scan "${tree}/.github" "(^|[^A-Za-z0-9_./-]|[$]/|[.]/|[.][.]/)(${EXTRACT_HOMES})/|main[.]sh" 'a monorepo path' sensitive || failed=1
        module:extract:scan "${tree}" "${words}" 'a monorepo or product name' || failed=1
        module:extract:scan "${tree}" "\.\./(\.\./)*(${EXTRACT_HOMES})/" 'a path out of the tree' sensitive || failed=1

    fi

    [[ ! -e "${tree}/${cache}" ]] || { @err "verify: the lab ${cache} travels in the tree" || failed=1; }

    while IFS= read -r -d '' file; do

        [[ "${file}" != */.git/* ]] || continue

        [[ "${file##*/}" != .env* || "${file##*/}" == .env.example ]] \
            || { @err "verify: an env file in the tree: ${file#"${tree}/"}" || failed=1; }

    done < <(core:fs:tree:files "${tree}")

    (( failed == 0 )) || { @err "verify refused the tree"; return; }

    @succ "verified ${tree}"

}
module:extract:scan () {

    local tree="${1}" pattern="${2}" what="${3}" sensitive="${4:-}" file="" failed=0
    local -a flags=( -rIlE --exclude-dir=.git )

    [[ -n "${pattern}" && -d "${tree}" ]] || return 0
    [[ -n "${sensitive}" ]] || flags+=( -i )

    while IFS= read -r file; do

        [[ -n "${file}" ]] || continue

        @err "verify: ${what} in ${file#"${tree%/.github}/"}: $(grep -IoE "${flags[@]:2}" -- "${pattern}" "${file}" | sort -u | tr '\n' ' ')" || failed=1

    done < <(grep "${flags[@]}" -- "${pattern}" "${tree}" 2>/dev/null || true)

    (( failed == 0 ))

}
