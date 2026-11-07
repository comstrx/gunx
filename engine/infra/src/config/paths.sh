config:paths:cache () {

    core:log:print "${MANIFEST[paths.cache]}"

}
config:paths:lab () {

    local root="${TOOL_ROOT}" cache="" lab=""

    cache="$(config:paths:cache)" || return
    lab="${root}/${cache}"

    if [[ -d "${lab}" && -w "${lab}" ]] || [[ ! -e "${lab}" && -w "${root}" ]]; then
        core:log:print "${lab}"
        return 0
    fi

    if [[ -n "${TMPDIR:-}" ]]; then lab="${TMPDIR}/${cache}"
    else lab="/tmp/${cache}-$(id -u)"
    fi

    core:log:debug "${root} is not writable; the lab is ${lab}"

    core:log:print "${lab}"

}
config:paths:tools () {

    core:log:print "${TOOL_LAB}/tools"

}
config:paths:sbom () {

    core:log:print "${TOOL_LAB}/sbom/sbom.spdx.json"

}
config:paths:lock () {

    core:log:print "${TOOL_LAB}/lock/${1}"

}
