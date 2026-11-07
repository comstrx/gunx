module:bundle:help:overview () {

    local name="" handler="" usage="" summary="" UI_WIDTH=0

    while IFS='|' read -r name handler usage summary; do

        (( ${#usage} <= UI_WIDTH )) || UI_WIDTH="${#usage}"

    done < <(module:bundle:usage:commands)

    core:log:print "${MANIFEST[meta.name]} ${MANIFEST[meta.version]} · ${TOOL_BUILD} build"
    core:log:print 'One Bash bundle for the work, the infrastructure and everything around them.'

    core:ui:section Usage
    core:ui:row '[GLOBAL FLAGS] COMMAND [ARGUMENTS] [FLAGS]'
    core:ui:row 'help COMMAND' 'Flags and usage of one command'

    core:ui:section Commands

    while IFS='|' read -r name handler usage summary; do
        core:ui:row "${usage}" "${summary}"
    done < <(module:bundle:usage:commands)

    module:bundle:help:globals

}
module:bundle:help:globals () {

    local flag="" value="" summary=""

    core:ui:section 'Global flags'

    for flag in "${!UI_GLOBALS[@]}"; do

        IFS='|' read -r value summary <<< "${UI_GLOBALS[${flag}]}"
        printf '%s\t%s\n' "${flag} ${value}" "${summary}"

    done | sort | core:ui:table

    core:ui:section Settings

    core:log:print '  Resolution: .env.example defaults, then .env.local or .env, the process environment, then -e.'
    core:log:print '  A release bundle reads .env.production or .env. Secrets are redacted. Failures exit non-zero.'

}
module:bundle:help:manual () {

    local command="${1}" row="" name="" handler="" usage="" summary="" flag="" value=""

    row="$(module:bundle:usage:command "${command}")" || { module:bundle:help:unknown "${command}"; return; }
    IFS='|' read -r name handler usage summary <<< "${row}"

    core:log:print "${usage}"
    core:log:print "  ${summary}"

    [[ -n "$(module:bundle:usage:flags "${command}")" ]] || return 0

    core:ui:section Flags

    while IFS='|' read -r flag value summary; do
        [[ -z "${flag}" ]] || printf '%s\t%s\n' "${flag}${value:+ ${value}}" "${summary}"
    done < <(module:bundle:usage:flags "${command}") | core:ui:table

}
module:bundle:help:show () {

    if [[ -z "${1:-}" ]]; then module:bundle:help:overview
    else module:bundle:help:manual "${1}"
    fi

}
module:bundle:help:unknown () {

    local suggestion=""
    local -a names=()

    mapfile -t names < <(module:bundle:usage:names)
    suggestion="$(core:cli:suggest "${1}" "${names[@]}")"

    core:error:usage "Unknown command: ${1}${suggestion:+; did you mean ${suggestion}?}"

}
