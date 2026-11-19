module:extract:flows:action () {

    local root="${1}" tool="${2}" wanted="${3:-}" path="" remote="" ref="" sha=""

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
module:extract:flows:files () {

    local tree="${1}" file=""

    for file in "${tree}/${EXTRACT_FLOWS}"/*; do
        [[ ! -f "${file}" || ! "${file}" =~ [.](${EXTRACT_YAML})$ ]] || @print "${file}"
    done

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

    [[ "${kind}" == product ]] || core:parse:yaml:erase "${file}" "${EXTRACT_WATCH}" || return

    module:extract:flows:paths "${file}" "${tree}" || return
    core:parse:yaml:prune "${file}" "^ *- ${EXTRACT_RUN}${alias} ${EXTRACT_VERB}( |\$)" 2 || return

    core:parse:yaml:sub "${file}" -E "s/^( *(- )?(${EXTRACT_RUN})?)${alias} /\\1${EXTRACT_SLOTS[0]} /" || return

    [[ "${carried}" == true ]] \
        || core:parse:yaml:sub "${file}" -E "s|${EXTRACT_USES}${EXTRACT_SELF}${self}/${EXTRACT_ACTION}|${EXTRACT_USES}${EXTRACT_SLOTS[1]}|" || return

    core:parse:yaml:hollow "${file}" || return

}
module:extract:flows:labels () {

    local tree="${1}" file="" path=""

    for file in "${EXTRACT_LABELS[@]/#/${tree}/}"; do

        [[ -f "${file}" ]] || continue

        while IFS= read -r path; do

            [[ -z "${path}" || -d "${tree}/${path}" ]] || core:parse:yaml:prune "${file}" "[('](${path//./[.]})(/|[)'])" || return

        done < <(grep -oE "[('](${EXTRACT_HOMES})(/[A-Za-z0-9_.-]+)*" -- "${file}" | cut -c2- | sort -u || true)

    done

    core:parse:yaml:hollow "${tree}/${EXTRACT_LABELER}" '[a-z][a-z0-9-]*' || return

}
module:extract:flows:dependabot () {

    local tree="${1}" kind="${2}" part="${3}" file="${1}/${EXTRACT_UPDATES}" line="" path=""

    [[ -f "${file}" ]] || return 0

    core:parse:yaml:sub "${file}" -E -e '/^#/d' -e "s|${EXTRACT_PREFIX}'[a-z0-9-]+\\(${EXTRACT_BUMP}\\)'|${EXTRACT_PREFIX}${EXTRACT_BUMP}|" || return

    [[ "${kind}" == product ]] \
        || core:parse:yaml:sub "${file}" -E -e "s|^( *)${EXTRACT_FOLDER}${part}\$|\\1${EXTRACT_FOLDER}|" -e "s|^( *)${EXTRACT_FOLDER}${part}/|\\1${EXTRACT_FOLDER}|" \
        || return

    while IFS= read -r line; do

        path="${line#*"${EXTRACT_FOLDER}"}"

        [[ -d "${tree}/${path}" ]] || core:parse:yaml:prune "${file}" "${EXTRACT_FOLDER}${path//./[.]}\$" || return

    done < <(grep -E "^ *${EXTRACT_FOLDER}(${EXTRACT_HOMES})/" -- "${file}" | sort -u || true)

}
module:extract:flows:apply () {

    local tree="${1}" kind="${2}" part="${3}" name="${4}" file="" self="" carried=false

    [[ -d "${tree}/${EXTRACT_FORGE}" ]] || return 0

    self="$(module:extract:self)" || return

    module:extract:flows:labels "${tree}" || return
    module:extract:flows:dependabot "${tree}" "${kind}" "${part}" || return

    [[ "${part}" == "${self}" ]] || ! module:extract:local "${name}" "${self}" || carried=true

    while IFS= read -r file; do
        module:extract:flows:rewrite "${file}" "${tree}" "${kind}" "${self}" "${carried}" || return
    done < <(module:extract:flows:files "${tree}")

    [[ "${carried}" == true || "${part}" == "${self}" || ! -f "${tree}/${EXTRACT_ALLOW}" ]] \
        || core:parse:yaml:sub "${tree}/${EXTRACT_ALLOW}" -E "s|^( *)- ${EXTRACT_CHECKOUT}\$|\\1- ${EXTRACT_SLOTS[1]}\\n\\1- ${EXTRACT_CHECKOUT}|" || return

}
module:extract:flows:seal () {

    local tree="${1}" part="${2}" name="${3}" root="${TOOL_ROOT}" self="" tool="" tag="" command="" action="" file=""

    [[ -d "${tree}/${EXTRACT_FORGE}" ]] || return 0

    self="$(module:extract:self)" || return

    if [[ "${part}" == "${self}" ]] || module:extract:local "${name}" "${self}"; then

        command="$(config:targets:get "${name}" name)" || return
        [[ "${part}" != "${self}" ]] || action="$/${EXTRACT_ACTION}"

    else

        tool="$(module:extract:tool "${name}" "${self}")" || return

        tag="${tool#*$'\t'}"
        tool="${tool%%$'\t'*}"

        command="$(module:extract:called "${self}" "${tool}")" || return
        action="$(module:extract:flows:action "${root}" "${tool}" "${tag}")" || return

    fi

    [[ ! -f "${tree}/${EXTRACT_ALLOW}" ]] || core:parse:yaml:sub "${tree}/${EXTRACT_ALLOW}" -E "s|${EXTRACT_SLOTS[1]}|${action%%@*}|g" || return

    while IFS= read -r file; do

        core:parse:yaml:sub "${file}" -E -e "s|${EXTRACT_SLOTS[0]}|${command}|g" -e "s|${EXTRACT_SLOTS[1]}|${action}|g" || return

    done < <(module:extract:flows:files "${tree}")

}
module:extract:called () {

    local self="${1}" tool="${2}" row="" word=""

    if row="$(module:extract:row "${self}" 2>/dev/null)"; then config:targets:get "${row}" name; return; fi

    word="$(core:git:leaf "${tool}")"

    [[ "${word}" =~ ^[A-Za-z][A-Za-z0-9_-]*$ ]] || { @err "The repository ${tool} gives no command name"; return; }

    @print "${word}"

}
