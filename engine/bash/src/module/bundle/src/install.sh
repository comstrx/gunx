module:bundle:install:tool () {

    local name="${1}" version="" kernel="" arch="" url="" digest="" member="" home=""

    version="$(config:tools:version "${name}")" || return
    kernel="$(core:sys:kernel)" || return
    arch="$(core:sys:arch)" || return

    url="$(config:manifest:get "archive.${name}_${kernel}_${arch}")" || return
    digest="$(config:manifest:get "downloads.${name}_${kernel}_${arch}")" || return
    member="$(config:tools:get "${name}" binary "${name}")" || return
    home="$(module:bundle:tool:home)" || return

    core:install:archive "${name}" "${url//\{version\}/"${version}"}" "${digest}" "${home}" "${member//\{version\}/"${version}"}"

}
module:bundle:install:tools () {

    local name="" failed=0
    local -a names=( "$@" )

    (( ${#names[@]} > 0 )) || mapfile -t names < <(config:tools:fetchable)

    for name in "${names[@]}"; do
        module:bundle:tool:pinned "${name}" 2>/dev/null && { core:log:debug "${name} is already at $(config:tools:version "${name}")"; continue; }
        module:bundle:install:tool "${name}" || failed=1
    done

    (( failed == 0 )) || { core:error:fail "A tool could not be fetched"; return; }

    core:log:succ "every tool is at its pin under $(module:bundle:tool:home)"

}
module:bundle:install:own () {

    (( $# > 0 )) || set -- "${LAW_TOOLS[@]}"

    module:bundle:install:tools "$@"

}
