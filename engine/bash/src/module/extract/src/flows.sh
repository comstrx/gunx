module:extract:flows:action () {

    local root="${1}" tool="${2}" name="${3}" path="" remote="" ref="" sha="" label="" repo="" tag="" wanted=""

    while IFS=$'\t' read -r label repo tag; do
        [[ "${repo}" != "${tool}" ]] || wanted="${tag}"
    done < <(config:targets:deps "${name}")

    path="$(core:git:resolve "${tool}" "${root}")" || return
    remote="$(core:git:url "${path}")" || return
    ref="$(module:extract:pin "${wanted}" "${remote}")" || return

    if [[ -n "${ref}" ]]; then sha="$(core:git:ref "${remote}" "refs/tags/${ref}")" || { @err "${path} has no tag ${ref}"; return; }
    else

        ref="$(core:git:default "${remote}")" || return
        sha="$(core:git:ref "${remote}" "refs/heads/${ref}")" || { @err "${path} has no branch ${ref}"; return; }

    fi

    @print "${path#*/}/${EXTRACT_ACTION}@${sha} # ${ref}"

}
module:extract:flows:paths () {

    local file="${1}" tree="${2}" line="" path=""

    while IFS= read -r line; do

        path="${line#*- }"

        [[ -d "${tree}/${path}" ]] || core:parse:yaml:prune "${file}" "^ *- ${path//./[.]}\$" self || return

    done < <(grep -E "^ *- (${EXTRACT_HOMES})(/[^ ]+)?\$" -- "${file}" | sort -u || true)

}
module:extract:flows:rewrite () {

    local file="${1}" tree="${2}" kind="${3}" self="${4}" carried="${5}" alias=""

    alias="$(config:meta:alias)" || return

    [[ "${kind}" == product ]] || core:parse:yaml:erase "${file}" paths || return

    module:extract:flows:paths "${file}" "${tree}" || return
    core:parse:yaml:prune "${file}" "^ *- run: ${alias} extract( |\$)" 2 || return

    core:parse:yaml:sub "${file}" -E "s/^( *(- )?(run: )?)${alias} /\\1${EXTRACT_SLOTS[0]} /" || return

    [[ "${carried}" == true ]] || core:parse:yaml:sub "${file}" -E "s|uses: [$]/${self}/${EXTRACT_ACTION}|uses: ${EXTRACT_SLOTS[1]}|" || return

    core:parse:yaml:hollow "${file}" || return

}
module:extract:flows:labels () {

    local tree="${1}" file="" path=""

    for file in "${tree}/.github/labels.yml" "${tree}/.github/labeler.yml"; do

        [[ -f "${file}" ]] || continue

        while IFS= read -r path; do

            [[ -z "${path}" || -d "${tree}/${path}" ]] || core:parse:yaml:prune "${file}" "[('](${path//./[.]})(/|[)'])" || return

        done < <(grep -oE "[('](${EXTRACT_HOMES})(/[A-Za-z0-9_.-]+)*" -- "${file}" | cut -c2- | sort -u || true)

    done

    core:parse:yaml:hollow "${tree}/.github/labeler.yml" '[a-z][a-z0-9-]*' || return

}
module:extract:flows:dependabot () {

    local tree="${1}" kind="${2}" part="${3}" file="${1}/.github/dependabot.yml" line="" path=""

    [[ -f "${file}" ]] || return 0

    core:parse:yaml:sub "${file}" -E -e '/^#/d' -e "s|prefix: '[a-z0-9-]+\\(deps\\)'|prefix: deps|" || return

    [[ "${kind}" == product ]] \
        || core:parse:yaml:sub "${file}" -E -e "s|^( *)directory: /${part}\$|\\1directory: /|" -e "s|^( *)directory: /${part}/|\\1directory: /|" \
        || return

    while IFS= read -r line; do

        path="${line#*directory: /}"

        [[ -d "${tree}/${path}" ]] || core:parse:yaml:prune "${file}" "directory: /${path//./[.]}\$" || return

    done < <(grep -E "^ *directory: /(${EXTRACT_HOMES})/" -- "${file}" | sort -u || true)

}
module:extract:flows:apply () {

    local tree="${1}" kind="${2}" part="${3}" name="${4}" file="" self="" carried=false

    [[ -d "${tree}/.github" ]] || return 0

    self="$(module:extract:self)" || return

    module:extract:flows:labels "${tree}" || return
    module:extract:flows:dependabot "${tree}" "${kind}" "${part}" || return

    [[ "${part}" == "${self}" ]] || ! module:extract:carries "${name}" "${self}" || carried=true

    for file in "${tree}"/.github/workflows/*.yml; do
        [[ -f "${file}" ]] || continue
        module:extract:flows:rewrite "${file}" "${tree}" "${kind}" "${self}" "${carried}" || return
    done

    [[ "${carried}" == true || "${part}" == "${self}" || ! -f "${tree}/.zizmor.yml" ]] \
        || core:parse:yaml:sub "${tree}/.zizmor.yml" -E "s|^( *)- actions/checkout\$|\\1- ${EXTRACT_SLOTS[1]}\\n\\1- actions/checkout|" || return

}
module:extract:flows:seal () {

    local tree="${1}" part="${2}" name="${3}" root="${TOOL_ROOT}" self="" tool="" command="" action="" file=""

    [[ -d "${tree}/.github" ]] || return 0

    self="$(module:extract:self)" || return
    tool="$(module:extract:mirror "${self}")" || return
    command="$(module:extract:name "$(module:extract:row "${self}")")" || return

    if [[ "${part}" == "${self}" ]]; then action="$/${EXTRACT_ACTION}"
    elif module:extract:carries "${name}" "${self}"; then command="$(module:extract:name "${name}")" || return
    else action="$(module:extract:flows:action "${root}" "${tool}" "${name}")" || return
    fi

    [[ ! -f "${tree}/.zizmor.yml" ]] || core:parse:yaml:sub "${tree}/.zizmor.yml" -E "s|${EXTRACT_SLOTS[1]}|${action%%@*}|g" || return

    for file in "${tree}"/.github/workflows/*.yml; do

        [[ -f "${file}" ]] || continue

        core:parse:yaml:sub "${file}" -E -e "s|${EXTRACT_SLOTS[0]}|${command}|g" -e "s|${EXTRACT_SLOTS[1]}|${action}|g" || return

    done

}
