module:extract:flows:files () {

    [[ "${3}" == .github/* ]]

}
module:extract:flows:action () {

    local root="${1}" name="" spec="" path="" remote="" ref="" sha=""

    while IFS= read -r name; do

        [[ "$(config:targets:get "${name}" path)" == engine/infra ]] || continue

        spec="$(config:targets:get "${name}" repo)" || return

    done < <(config:targets:list)

    [[ -n "${spec}" ]] || { @err "No target carries engine/infra; the workflows of a tool need it as an action"; return; }

    path="$(module:extract:git:resolve "${spec}" "${root}")" || return
    remote="$(module:extract:git:remote "${path}")" || return
    ref="$(core:git:release "${root}")" || ref=""

    sha="$(module:extract:git:ref "${remote}" "${ref:+refs/tags/${ref}}")" || sha=""

    [[ -n "${sha}" ]] || sha="$(module:extract:git:ref "${remote}" refs/heads/main)" || sha=""

    [[ -n "${sha}" ]] || {

        @warn "${path} has no ${ref:-main} yet; the action stays on main unpinned"
        @print "${path#*/}/src/module/gate/template@main"

        return 0

    }

    @print "${path#*/}/src/module/gate/template@${sha} # ${ref:-main}"

}
module:extract:flows:rewrite () {

    local file="${1}" tree="${2}" action="${3}" line="" wanted=""

    core:parse:yaml:erase "${file}" paths || return
    core:parse:yaml:prune "${file}" '^ *- run: infra sync( |$)' 2 || return

    while IFS= read -r line; do

        wanted="${line##*/}"

        if [[ -f "${tree}/${wanted}" ]]; then core:parse:yaml:sub "${file}" -E "s|(version-file: )engine/[a-z]+/|\\1|" || return
        else core:parse:yaml:prune "${file}" "version-file: engine/" self || return
        fi

    done < <(grep -E 'version-file: engine/' -- "${file}" || true)

    core:parse:yaml:sub "${file}" -E "s|uses: [$]/engine/infra/src/module/gate/template|uses: ${action}|" || return
    core:parse:yaml:hollow "${file}" || return

}
module:extract:flows:labels () {

    local tree="${1}"

    core:parse:yaml:prune "${tree}/.github/labels.yml" '[(](engine|product|tutor)/' || return
    core:parse:yaml:prune "${tree}/.github/labeler.yml" "'(engine|product|tutor)/" || return
    core:parse:yaml:hollow "${tree}/.github/labeler.yml" '[a-z]+' || return

}
module:extract:flows:dependabot () {

    local tree="${1}" kind="${2}" part="${3}" root="${4}" file="${1}/.github/dependabot.yml" project="" other=""

    [[ -f "${file}" ]] || return 0

    core:parse:yaml:sub "${file}" -E -e '/^#/d' -e "s|prefix: '[a-z0-9-]+\\(deps\\)'|prefix: deps|" || return

    if [[ "${kind}" != product ]]; then

        core:parse:yaml:sub "${file}" -E "s|^( *)directory: /${part}\$|\\1directory: /|" || return
        core:parse:yaml:prune "${file}" "directory: /(engine|product|tutor)/" || return

        return 0

    fi

    project="${part#product/}"

    for other in "${root}"/product/*/; do

        other="${other%/}"
        other="${other##*/}"

        [[ "${other}" == "${project}" ]] || core:parse:yaml:prune "${file}" "directory: /product/${other}/" || return

    done

}
module:extract:flows:apply () {

    local tree="${1}" kind="${2}" part="${3}" root="" action="" file=""

    [[ -d "${tree}/.github" ]] || return 0

    root="$(core:git:root "${TOOL_ENGINE}")" || return

    module:extract:flows:labels "${tree}" || return
    module:extract:flows:dependabot "${tree}" "${kind}" "${part}" "${root}" || return

    [[ "${kind}" != product ]] || return 0

    if [[ "${part}" == engine/infra ]]; then action="$/src/module/gate/template"
    else action="$(module:extract:flows:action "${root}")" || return
    fi

    for file in "${tree}"/.github/workflows/*.yml; do
        [[ -f "${file}" ]] || continue
        module:extract:flows:rewrite "${file}" "${tree}" "${action}" || return
    done

    [[ "${action}" == "$/src/module/gate/template" || ! -f "${tree}/.zizmor.yml" ]] \
        || core:parse:yaml:sub "${tree}/.zizmor.yml" -E "s|^( *)- actions/checkout\$|\\1- ${action%%@*}\\n\\1- actions/checkout|" || return

}
