module:extract:pin () {

    local tag="${1}" remote="${2}"

    [[ -n "${tag}" ]] || tag="$(core:git:newest "${remote}")" || tag=""

    [[ -n "${tag}" ]] || core:git:default "${remote}" >/dev/null \
        || { @err "The dependency ${remote##*@} has no tag nor a default branch to stand on"; return; }

    [[ -z "${tag}" ]] || core:git:named "${tag}" || { @err "Not a tag name: ${tag}"; return; }

    @print "${tag}"

}
module:extract:deps () {

    local tree="${1}" name="${2}" kind="${3}" label="" repo="" tag="" path="" address="" tool="" remote=""

    [[ "${kind}" == fragment || "${kind}" == product ]] || return 0

    tool="$(module:extract:mirror "$(module:extract:self)")" || return

    while IFS=$'\t' read -r label repo tag; do

        [[ "${repo}" != "${tool}" ]] || continue

        path="$(module:extract:carrier "${repo}")" || return
        address="$(core:git:resolve "${repo}" "${TOOL_ROOT}")" || return
        remote="$(core:git:url "${address}")" || return
        tag="$(module:extract:pin "${tag}" "${remote}")" || return

        module:extract:deps:python "${tree}" "${path}" "${address}" "${tag}" || return

    done < <(config:targets:deps "${name}")

}
module:extract:deps:python () {

    local tree="${1}" path="${2}" address="${3}" tag="${4}" file="" url="" pin="" from=""

    url="file://${address}"
    [[ "${address}" == /* ]] || url="https://${address}"

    [[ -z "${tag}" ]] || pin=", tag = \"${tag}\""

    from="\\{ *path *= *\"([.][.]/)+${path//./[.]}"

    while IFS= read -r -d '' file; do

        [[ "${file##*/}" == pyproject.toml ]] || continue

        core:fs:file:edit "${file}" -E \
            -e "s#${from}/([^\"]+)\"[^}]*\\}#{ git = \"${url}\", subdirectory = \"\\2\"${pin} }#" \
            -e "s#${from}\"[^}]*\\}#{ git = \"${url}\"${pin} }#" \
            || { @err "Cannot point ${file#"${tree}/"} at ${address}"; return; }

    done < <(core:fs:tree:files "${tree}")

}
