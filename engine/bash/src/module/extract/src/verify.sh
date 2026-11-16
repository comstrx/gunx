module:extract:words () {

    local word="${1}" own="${2:-}" root="" directory="" words="${1}" name=""

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    for directory in "${root}"/product/*/; do

        [[ -d "${directory}" ]] || continue

        directory="${directory%/}"
        name="${directory##*/}"

        [[ "${name}" != "${own}" ]] || continue

        words+="${words:+|}${name}"

    done

    [[ -n "${words}" ]] || return 0

    @print "\b(${words})\b"

}
module:extract:manifest () {

    local tree="${1}" name=""

    for name in ${2}; do
        [[ ! -f "${tree}/${name}" ]] || return 0
    done

    @err "verify: no manifest (${2}) at the root of ${tree}"

}
module:extract:verify () {

    local tree="${1}" kind="${2}" name="${3:-}" file="" failed=0 manifest="" word="" words="" cache=""

    word="$(module:extract:source)" || return
    cache="$(config:paths:cache)" || return

    case "${kind}" in
        engine)   manifest="Cargo.toml pyproject.toml go.work package.json infra.toml" ;;
        fragment) manifest="Cargo.toml pyproject.toml package.json" ;;
        tutor)    manifest="index.md" ;;
        product)  manifest="AGENTS.md" ;;
    esac

    module:extract:manifest "${tree}" "${manifest}" || failed=1

    if [[ "${kind}" == product ]]; then

        words="$(module:extract:words '' "${name#product/}")" || return
        module:extract:scan "${tree}" "${words}" "another product's name" || failed=1

    else

        words="$(module:extract:words "${word}")" || return

        module:extract:scan "${tree}/.github" '(^|[^A-Za-z0-9_./-]|[$]/|[.]/|[.][.]/)(engine|product|tutor)/|main[.]sh' 'a monorepo path' sensitive || failed=1
        module:extract:scan "${tree}" "${words}" 'a monorepo or product name' || failed=1
        module:extract:scan "${tree}" '\.\./(\.\./)*(engine|product|tutor)/' 'a path out of the tree' sensitive || failed=1

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

        @err "verify: ${what} in ${file#"${tree%/.github}/"}: $(grep -IoE "${flags[@]:3}" -- "${pattern}" "${file}" | sort -u | tr '\n' ' ')" || failed=1

    done < <(grep "${flags[@]}" -- "${pattern}" "${tree}" 2>/dev/null || true)

    (( failed == 0 ))

}
