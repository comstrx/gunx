module:bundle:pack:strip () {

    local line="" skip=0

    while IFS= read -r line || [[ -n "${line}" ]]; do

        if (( skip == 1 )); then [[ "${line}" != '}' ]] || skip=0; continue; fi
        if [[ "${line}" =~ ^\#cfg\[(test|bench|fuzz)\]$ ]]; then skip=1; continue; fi

        printf '%s\n' "${line}"

    done

}
module:bundle:pack:slim () {

    local line=""

    while IFS= read -r line || [[ -n "${line}" ]]; do
        line="${line#"${line%%[![:space:]]*}"}"
        [[ -z "${line}" ]] || printf '%s\n' "${line}"
    done

}
module:bundle:pack:sources () {

    local root="${1}" source="${2}" entry="${3}" mode="${4}" file="" relative=""
    local -a embedded=()

    printf 'bundle:source () {\n\n    case "%s" in\n' "\${1}"

    while IFS= read -r -d '' file; do

        [[ "${file}" != "${root}/${entry}" ]] || continue

        relative="${file#"${root}/${source}/"}"

        [[ "${relative}" == *.sh && "${relative}" != *[!a-z0-9_/.-]* && "${relative}" != *..* ]] \
            || { core:error:fail "Invalid source name: ${relative}"; return; }

        embedded+=( "${relative}" )

        printf "        '%s')\n" "${relative}"

        if [[ "${mode}" == release ]]; then
            core:fs:file:read "${file}" | module:bundle:pack:strip | module:bundle:pack:slim || return
        else
            core:fs:file:read "${file}" || return
        fi

        printf '\n        ;;\n'

    done < <(core:fs:tree:files "${root}/${source}" .sh)

    printf '        *) core:error:fail "Missing source: %s" ;;\n    esac\n\n}\n' "\${1}"
    printf 'bundle:sources () {\n\n'
    printf '    printf '"'"'%%s\\n'"'"
    printf " '%s'" "${embedded[@]}"
    printf '\n\n}\n'

}
module:bundle:pack:assets () {

    local root="${1}" file="" digest=""
    local -a names=()

    shift
    names=( "$@" )

    printf 'bundle:asset () {\n\n    case "%s" in\n' "\${1}"

    for file in "${names[@]}"; do

        core:fs:path:relative "${file}" || { core:error:fail "Invalid asset name: ${file}"; return; }

        digest="$(core:fs:file:hash "${root}/${file}")" || return

        if [[ -s "${root}/${file}" && -n "$(tail -c 1 -- "${root}/${file}")" ]]; then

            printf "        '%s') printf '%%s' \"\$(cat <<'ASSET_%s'\n" "${file}" "${digest}"
            core:fs:file:read "${root}/${file}" || return
            printf '\nASSET_%s\n)\"\n        ;;\n' "${digest}"

        else

            printf "        '%s') cat <<'ASSET_%s'\n" "${file}" "${digest}"
            core:fs:file:read "${root}/${file}" || return
            printf 'ASSET_%s\n        ;;\n' "${digest}"

        fi

    done

    printf '        *) core:error:fail "Missing asset: %s" ;;\n    esac\n\n}\n' "\${1}"
    printf 'bundle:assets () {\n\n'
    printf '    printf '"'"'%%s\\n'"'"
    printf " '%s'" "${names[@]}"
    printf '\n\n}\n'

}
module:bundle:pack:tests () {

    local folder="${1}" file=""

    [[ -d "${folder}" ]] || return 0

    while IFS= read -r -d '' file; do

        core:fs:file:read "${file}" || return
        printf '\n'

    done < <(core:fs:tree:files "${folder}" .test.sh)

}
module:bundle:pack:entry () {

    local entry="${1}" line=""

    while IFS= read -r line || [[ -n "${line}" ]]; do
        [[ "${line}" == '#!'* || "${line}" == 'source '* || "${line}" == 'set '* ]] || printf '%s\n' "${line}"
    done < "${entry}"

}
module:bundle:pack:create () {

    local root="${1}" output="${2}" mode="${3}" source="${4}" entry="${5}" tests="${6}" staging=""

    shift 6

    [[ "${mode}" == dev || "${mode}" == release ]] || { core:error:fail "Unknown bundle mode: ${mode}"; return; }

    core:fs:dir:new "${output%/*}" 755 || return

    staging="$(mktemp "${output}.XXXXXXXX")" || { core:error:fail "Cannot stage bundle: ${output}"; return; }

    (
        printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' 'TOOL_BUNDLED=true' "TOOL_BUILD=${mode}"
        printf 'TOOL_ROOT="%s"\nTOOL_ENGINE=""\nTOOL_SOURCE=""\nTOOL_BIN="%s"\n\n' "\${PWD}" "\${BASH_SOURCE[0]}"
        printf '%s\n' 'declare -gA LOAD_STATE=() LOAD_INDEX=()' 'declare -g LOAD_PATH=""'

        declare -f core:load:use core:load:index core:load:exists core:load:resolve core:load:list

        module:bundle:pack:sources "${root}" "${source}" "${entry}" "${mode}" || exit
        module:bundle:pack:assets "${root}" "$@" || exit

        [[ "${mode}" != dev ]] || module:bundle:pack:tests "${root}/${tests}" || exit

        printf 'core:load:use app || exit\n'
        module:bundle:pack:entry "${root}/${entry}" || exit

    ) > "${staging}" || { rm -f -- "${staging}"; core:error:fail "Bundle assembly failed: ${output}"; return; }

    bash -n "${staging}" || { rm -f -- "${staging}"; core:error:fail "Bundle syntax check failed: ${output}"; return; }

    if ! { chmod 755 "${staging}" && mv -f -- "${staging}" "${output}"; }; then

        rm -f -- "${staging}"
        core:error:fail "Bundle write failed: ${output}"
        return

    fi

}
