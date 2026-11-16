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
module:bundle:pack:split () {

    local kind="${1}" line="" marker="" inside=0

    while IFS= read -r line || [[ -n "${line}" ]]; do

        if (( inside == 0 )) && [[ "${line}" =~ ^\#cfg\[(test|bench|fuzz)\]$ ]]; then marker="${line}"; continue; fi
        if (( inside == 0 )) && [[ "${line}" =~ ^@?[a-z][a-z0-9:-]*\ \(\)\ \{$ ]]; then inside=1; fi

        if (( inside == 1 )); then

            [[ "${kind}" != functions ]] || printf '%s%s\n' "${marker:+${marker}$'\n'}" "${line}"
            [[ "${line}" != '}' ]] || inside=0

        else

            [[ "${kind}" != statements ]] || printf '%s%s\n' "${marker:+${marker}$'\n'}" "${line}"

        fi

        marker=""

    done

}
module:bundle:pack:part () {

    local file="${1}" mode="${2}" kind="${3}"

    if [[ "${mode}" == release ]]; then
        core:fs:file:read "${file}" | module:bundle:pack:strip | module:bundle:pack:split "${kind}" | module:bundle:pack:slim
    else
        core:fs:file:read "${file}" | module:bundle:pack:split "${kind}"
    fi

}
module:bundle:pack:sources () {

    local root="${1}" source="${2}" entry="${3}" mode="${4}" file="" relative="" index=0
    local -a embedded=() files=()

    while IFS= read -r -d '' file; do

        [[ "${file}" != "${root}/${entry}" ]] || continue

        relative="${file#"${root}/${source}/"}"

        [[ "${relative}" == *.sh && "${relative}" != *[!a-z0-9_/.-]* && "${relative}" != *..* ]] \
            || { core:error:fail "Invalid source name: ${relative}"; return; }

        embedded+=( "${relative}" )
        files+=( "${file}" )

    done < <(core:fs:tree:files "${root}/${source}" .sh)

    for file in "${files[@]}"; do
        module:bundle:pack:part "${file}" "${mode}" functions || return
    done

    for (( index = 0; index < ${#files[@]}; index++ )); do

        printf 'bundle:unit:%s () {\n\n:\n' "${index}"
        module:bundle:pack:part "${files[index]}" "${mode}" statements || return
        printf '\n}\n'

    done

    printf 'bundle:source () {\n\n    case "%s" in\n' "\${1}"

    for (( index = 0; index < ${#embedded[@]}; index++ )); do
        printf "        '%s') bundle:unit:%s || return; unset -f bundle:unit:%s ;;\n" "${embedded[index]}" "${index}" "${index}"
    done

    printf '        *) core:error:fail "Missing source: %s"; return ;;\n    esac\n\n}\n' "\${1}"
    printf 'bundle:sources () {\n\n'
    printf '    printf '"'"'%%s\\n'"'"
    printf " '%s'" "${embedded[@]}"
    printf '\n\n}\n'

}
module:bundle:pack:data () {

    local root="${1}" file="" key=""
    local -A table=() pairs=()
    local -a order=() keys=()

    shift

    for file in "$@"; do

        case "${file}" in
            *.toml)
                core:parse:toml table "${root}/${file}" || return
                mapfile -t keys < <(printf '%s\n' "${!table[@]}" | LC_ALL=C sort)

                printf 'bundle:manifest () {\n\n    local -n _manifest="%s"\n\n    _manifest=(\n' "\${1}"
                for key in "${keys[@]}"; do module:bundle:pack:pair "${key}" "${table[${key}]}"; done
                printf '    )\n\n}\n'
            ;;
            .env.example)
                core:parse:env pairs order "${root}/${file}" || return

                printf 'bundle:schema () {\n\n    local -n _schema="%s"\n    local -n _sequence="%s"\n\n    _schema=(\n' "\${1}" "\${2}"
                for key in "${order[@]}"; do module:bundle:pack:pair "${key}" "${pairs[${key}]}"; done
                printf '    )\n    _sequence=(\n'
                for key in "${order[@]}"; do printf "        '%s'\n" "${key}"; done
                printf '    )\n\n}\n'
            ;;
        esac

    done

}
module:bundle:pack:pair () {

    local key="${1}" value="${2-}"

    [[ "${key}" != *[!A-Za-z0-9_.-]* ]] || { core:error:fail "A key that cannot be embedded: ${key}"; return; }

    printf "        ['%s']='%s'\n" "${key}" "${value//\'/\'\\\'\'}"

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

        module:bundle:pack:sources "${root}" "${source}" "${entry}" "${mode}" || exit
        module:bundle:pack:assets "${root}" "$@" || exit
        module:bundle:pack:data "${root}" "$@" || exit

        [[ "${mode}" != dev ]] || module:bundle:pack:tests "${root}/${tests}" || exit

        module:bundle:pack:entry "${root}/${entry}" || exit

    ) > "${staging}" || { rm -f -- "${staging}"; core:error:fail "Bundle assembly failed: ${output}"; return; }

    bash -n "${staging}" || { rm -f -- "${staging}"; core:error:fail "Bundle syntax check failed: ${output}"; return; }

    if ! { chmod 755 "${staging}" && mv -f -- "${staging}" "${output}"; }; then

        rm -f -- "${staging}"
        core:error:fail "Bundle write failed: ${output}"
        return

    fi

}
