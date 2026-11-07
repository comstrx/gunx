module:extract:words () {

    local word="${1}" root="" directory="" words="${1}"

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    for directory in "${root}"/product/*/; do

        [[ -d "${directory}" ]] || continue

        directory="${directory%/}"
        words+="|${directory##*/}"

    done

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

    local tree="${1}" kind="${2}" file="" failed=0 manifest="" word="" words=""

    word="$(module:extract:source)" || return

    case "${kind}" in
        engine)   manifest="Cargo.toml pyproject.toml go.work package.json infra.toml" ;;
        fragment) manifest="Cargo.toml pyproject.toml package.json" ;;
        tutor)    manifest="index.md" ;;
        product)  manifest="AGENTS.md" ;;
    esac

    module:extract:manifest "${tree}" "${manifest}" || failed=1

    if [[ "${kind}" != product ]]; then

        words="$(module:extract:words "${word}")" || return

        while IFS= read -r -d '' file; do

            ! grep -IqE '(^|[^A-Za-z0-9_./-]|[$]/|[.]/|[.][.]/)(engine|product|tutor)/|main[.]sh' -- "${file}" \
                || { @err "verify: a monorepo path in ${file#"${tree}/"}: $(grep -IoE '(^|[^A-Za-z0-9_./-]|[$]/|[.]/|[.][.]/)(engine|product|tutor)/[^ '"'"'"]*|main[.]sh' -- "${file}" | sort -u | tr '\n' ' ')" || failed=1; }

        done < <(core:fs:tree:files "${tree}/.github")

        while IFS= read -r -d '' file; do

            [[ "${file}" != */.git/* ]] || continue

            ! grep -IqiE -- "${words}" "${file}" \
                || { @err "verify: a monorepo or product name in ${file#"${tree}/"}: $(grep -IoiE -- "${words}" "${file}" | sort -u | tr '\n' ' ')" || failed=1; }

            ! grep -IqE '\.\./(\.\./)*(engine|product|tutor)/' -- "${file}" \
                || { @err "verify: a path out of the tree in ${file#"${tree}/"}" || failed=1; }

        done < <(core:fs:tree:files "${tree}")

    fi

    [[ ! -e "${tree}/$(config:paths:cache)" ]] \
        || { @err "verify: the lab $(config:paths:cache) travels in the tree" || failed=1; }

    while IFS= read -r -d '' file; do

        [[ "${file}" != */.git/* ]] || continue

        [[ "${file##*/}" != .env* || "${file##*/}" == .env.example ]] \
            || { @err "verify: an env file in the tree: ${file#"${tree}/"}" || failed=1; }

    done < <(core:fs:tree:files "${tree}")

    (( failed == 0 )) || { @err "verify refused the tree"; return; }

    @succ "verified ${tree}"

}
