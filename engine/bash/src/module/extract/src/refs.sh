module:extract:pin () {

    local tag="${1}" remote="${2}"

    [[ -n "${tag}" ]] || tag="$(core:git:newest "${remote}")" || tag=""

    [[ -n "${tag}" ]] || core:git:default "${remote}" >/dev/null \
        || { @err "The dependency ${remote##*@} has no tag nor a default branch to stand on"; return; }

    [[ -z "${tag}" ]] || core:git:named "${tag}" || { @err "Not a tag name: ${tag}"; return; }

    @print "${tag}"

}
module:extract:uses () {

    local tree="${1}" manifest="${2}" src="${3}"

    grep -rIlE --exclude-dir="${EXTRACT_SKIP}" --include="${manifest}" "([.][.]/)+${src//./[.]}(/|\")" -- "${tree}" 2>/dev/null || true

}
module:extract:refs () {

    local tree="${1}" name="${2}" self="" src="" repo="" tag="" address="" remote="" manifest="" list=""
    local -a files=()

    self="$(module:extract:self)" || return

    while IFS=$'\t' read -r src repo tag; do

        [[ "${src}" != "${self}" ]] || continue

        address=""

        for manifest in "${!EXTRACT_MANIFESTS[@]}"; do

            list="$(module:extract:uses "${tree}" "${manifest}" "${src}")"

            [[ -n "${list}" ]] || continue

            mapfile -t files <<< "${list}"

            if [[ -z "${address}" ]]; then

                address="$(core:git:resolve "${repo}" "${TOOL_ROOT}")" || return
                remote="$(core:git:url "${address}")" || return
                tag="$(module:extract:pin "${tag}" "${remote}")" || return

            fi

            "module:extract:refs:${EXTRACT_MANIFESTS[${manifest}]}" "${src}" "${address}" "${tag}" "${files[@]}" \
                || { @err "[deps] ${name}: cannot point ${manifest} at ${address}"; return; }

        done

    done < <(config:targets:refs "${name}")

}
module:extract:refs:python () {

    local path="${1}" address="${2}" tag="${3}" file="" url="" pin="" from=""

    shift 3

    url="$(core:git:link "${address}")"

    [[ -z "${tag}" ]] || pin=", tag = \"${tag}\""

    from="\\{ *path *= *\"([.][.]/)+${path//./[.]}"

    for file in "$@"; do

        core:fs:file:edit "${file}" -E \
            -e "s#${from}/([^\"]+)\"[^}]*\\}#{ git = \"${url}\", subdirectory = \"\\2\"${pin} }#" \
            -e "s#${from}\"[^}]*\\}#{ git = \"${url}\"${pin} }#" \
            || return

    done

}
