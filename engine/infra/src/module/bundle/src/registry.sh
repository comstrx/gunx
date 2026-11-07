declare -ga UI_COMMANDS=()
declare -gA UI_FLAGS=() UI_GLOBALS=() UI_INDEX=()

module:bundle:usage:add () {

    local name="${1:-}" handler="${2:-}" usage="${3:-}" summary="${4:-}"

    [[ "${name}" =~ ^[a-z][a-z0-9-]*$ ]] || { core:error:fail "Invalid command name: ${name}"; return; }

    [[ -n "${handler}" && -n "${usage}" && -n "${summary}" ]] \
        || { core:error:fail "Usage of ${name} needs handler, usage and summary"; return; }

    (( ${#summary} <= 80 )) || { core:error:fail "Summary of ${name} exceeds 80 characters"; return; }

    [[ "${handler}|${usage}|${summary}" != *'|'*'|'*'|'* ]] \
        || { core:error:fail "A registration never holds a pipe: ${name}"; return; }

    [[ -z "${UI_INDEX[${name}]+x}" ]] || { core:error:fail "Command already registered: ${name}"; return; }

    UI_COMMANDS+=( "${name}|${handler}|${usage}|${summary}" )
    UI_INDEX["${name}"]="${name}|${handler}|${usage}|${summary}"

}
module:bundle:usage:flag () {

    local name="${1:-}" spec="${2:-}" summary="${3:-}" flag="" value=""

    [[ -n "${UI_INDEX[${name}]+x}" ]] || { core:error:fail "Flag of an unknown command: ${name}"; return; }

    flag="${spec%% *}"
    value="${spec#"${flag}"}"
    value="${value# }"

    [[ "${flag}" =~ ^--[a-z][a-z0-9-]*$ && "${value}" != *'|'* ]] \
        || { core:error:fail "Invalid flag spec: ${spec}"; return; }

    [[ -n "${summary}" && ${#summary} -le 80 && "${summary}" != *'|'* ]] \
        || { core:error:fail "Flag ${flag} of ${name} needs a summary of at most 80 characters"; return; }

    UI_FLAGS["${name}"]+="${flag}|${value}|${summary}"$'\n'

}
module:bundle:usage:global () {

    local flag="${1:-}" value="${2-}" summary="${3:-}"

    [[ "${flag}" =~ ^-[-a-z][a-z0-9-]*$ ]] || { core:error:fail "Invalid global flag: ${flag}"; return; }

    [[ -n "${summary}" && "${summary}" != *'|'* && "${value}" != *'|'* ]] \
        || { core:error:fail "Global flag ${flag} needs a summary"; return; }

    UI_GLOBALS["${flag}"]="${value}|${summary}"

}
module:bundle:usage:commands () {

    (( ${#UI_COMMANDS[@]} == 0 )) || printf '%s\n' "${UI_COMMANDS[@]}"

}
module:bundle:usage:command () {

    [[ -n "${UI_INDEX[${1:-}]+x}" ]] || return 1

    core:log:print "${UI_INDEX[${1}]}"

}
module:bundle:usage:handler () {

    local row=""

    row="$(module:bundle:usage:command "${1:-}")" || return
    row="${row#*|}"

    core:log:print "${row%%|*}"

}
module:bundle:usage:flags () {

    [[ -z "${UI_FLAGS[${1:-}]:-}" ]] || printf '%s' "${UI_FLAGS[${1}]}"

}
module:bundle:usage:names () {

    local row=""

    for row in "${UI_COMMANDS[@]}"; do
        core:log:print "${row%%|*}"
    done

}
module:bundle:usage:valued () {

    local name="" flag="" value="" summary=""

    CLI_VALUED=()

    for flag in "${!UI_GLOBALS[@]}"; do
        value="${UI_GLOBALS[${flag}]%%|*}"
        [[ -z "${value}" ]] || CLI_VALUED["${flag}"]=true
    done

    for name in "${!UI_FLAGS[@]}"; do

        while IFS='|' read -r flag value summary; do
            [[ -z "${flag}" || -z "${value}" ]] || CLI_VALUED["${flag}"]=true
        done <<< "${UI_FLAGS[${name}]}"

    done

}
module:bundle:usage:allowed () {

    local name="${1:-}" wanted="${2:-}" flag="" value="" summary=""

    [[ -z "${UI_GLOBALS[${wanted}]+x}" ]] || return 0

    while IFS='|' read -r flag value summary; do
        [[ "${flag}" != "${wanted}" ]] || return 0
    done <<< "${UI_FLAGS[${name}]:-}"

    return 1

}
