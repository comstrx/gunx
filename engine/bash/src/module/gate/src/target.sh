module:gate:chains () {

    local dir="${1}"

    [[ ! -f "${dir}/src/main.sh" ]] || ! config:manifest:find "${dir}" >/dev/null || @print bash
    [[ ! -f "${dir}/pyproject.toml" ]] || @print python
    [[ ! -f "${dir}/Cargo.toml" ]] || @print rust
    [[ ! -f "${dir}/go.work" && ! -f "${dir}/go.mod" ]] || @print go
    [[ ! -f "${dir}/package.json" ]] || @print bun

}
module:gate:paths () {

    local list="${1:-.}" item="" path=""
    local -a items=()
    local -A seen=()

    core:str:split items "${list}" ,

    for item in "${items[@]}"; do

        item="$(core:str:trim "${item}")"

        [[ -n "${item}" ]] || continue

        path="$(cd -- "${item}" 2>/dev/null && pwd -P)" || { @err "Not a directory: ${item}"; return; }

        [[ -n "${seen[${path}]+x}" ]] || { seen["${path}"]=1; @print "${path}"; }

    done

}
module:gate:governed () {

    local type=""

    for type in "$@"; do
        ! core:list:has "${type}" "${GATE_GOVERNANCE[@]}" || return 0
    done

    return 1

}
module:gate:plan () {

    local explicit="${1}" wanted="${2:-}" path="" chain="" governor="" list="" governs=0 prepares=0
    local -a chains=() roots=()

    shift 2

    ! module:gate:governed "$@" || governs=1
    ! core:list:has deps "$@" || prepares=1

    list="$(module:gate:paths "${wanted}")" || return

    [[ -n "${list}" ]] || { @err "--path names no directory"; return; }

    while IFS= read -r path; do

        governor="$(core:git:root "${path}")"
        mapfile -t chains < <(module:gate:chains "${path}")

        (( ${#chains[@]} > 0 )) || [[ "${path}" == "${governor}" ]] \
            || { @err "No gate target in ${path}: no ${MANIFEST_NAMES[0]} with src/main.sh, pyproject.toml, Cargo.toml, go.work, go.mod or package.json"; return; }

        for chain in "${chains[@]}"; do
            printf '%s\t%s\n' "${chain}" "${path}"
        done

        if (( governs == 1 )) && { (( explicit == 1 )) || [[ "${path}" == "${governor}" ]]; }; then
            core:list:has "${governor}" "${roots[@]}" || roots+=( "${governor}" )
        elif (( prepares == 1 )) && [[ "${path}" == "${governor}" ]]; then
            core:list:has "${governor}" "${roots[@]}" || roots+=( "${governor}" )
        fi

    done <<< "${list}"

    for governor in "${roots[@]}"; do
        printf 'root\t%s\n' "${governor}"
    done

}
module:gate:files () {

    local tree="${1}"

    if [[ -e "${tree}/.git" ]] || { core:git:is "${tree}" && ! core:git:ignored "${tree}"; }; then core:git:files "${tree}"
    else core:fs:tree:files "${tree}"
    fi

}
module:gate:within () {

    local tree="${1}" path="" dir="" top="" chain="" list="" under=0
    local -a tops=()
    local -A seen=()

    while IFS= read -r -d '' path; do

        path="${path#"${tree}/"}"

        case "/${path}" in
            */pyproject.toml|*/Cargo.toml|*/go.work|*/go.mod|*/package.json) dir="/${path}"; dir="${dir%/*}" ;;
            */src/main.sh) dir="/${path}"; dir="${dir%/src/main.sh}" ;;
            *) continue ;;
        esac

        [[ -z "${dir}" ]] || seen["${dir#/}"]=1

    done < <(module:gate:files "${tree}")

    while IFS= read -r dir; do

        under=0

        for top in "${tops[@]}"; do
            [[ -n "${top}" && "${dir}" != "${top}/"* ]] || under=1
        done

        (( under == 0 )) || continue

        list="$(module:gate:chains "${tree}${dir:+/${dir}}")"

        [[ -n "${list}" ]] || continue

        tops+=( "${dir}" )

        while IFS= read -r chain; do
            printf '%s\t%s\n' "${chain}" "${tree}${dir:+/${dir}}"
        done <<< "${list}"

    done < <(printf '\n'; (( ${#seen[@]} == 0 )) || printf '%s\n' "${!seen[@]}" | LC_ALL=C sort)

    printf 'root\t%s\n' "${tree}"

}
module:gate:toolchains () {

    local list="" path="" chain="" dir="" file="" key=""
    local -A needs=()

    (( $# == 0 )) || { core:error:usage "toolchains takes no argument; the directories go in --path"; return; }

    list="$(module:gate:paths "$(core:cli:value --path)")" || return

    while IFS= read -r path; do

        while IFS=$'\t' read -r chain dir; do

            case "${chain}" in
                rust|python) needs["${chain}"]=true ;;
                go)
                    needs[go]=true

                    file="${dir}/go.work"
                    [[ -f "${file}" ]] || file="${dir}/go.mod"

                    [[ -n "${needs[go-file]:-}" ]] || needs[go-file]="${file#"${TOOL_ROOT}/"}"
                ;;
                bun)
                    needs[bun]=true

                    [[ -n "${needs[bun-file]:-}" ]] || ! grep -q '"packageManager"' -- "${dir}/package.json" \
                        || needs[bun-file]="${dir#"${TOOL_ROOT}/"}/package.json"
                ;;
                root)
                    [[ "${dir}" != "${TOOL_ROOT}" ]] || ! core:proc:within "${dir}" module:gate:root:has prettier || needs[bun]=true
                ;;
            esac

        done < <(module:gate:within "${path}")

    done <<< "${list}"

    for key in rust python go go-file bun bun-file; do
        [[ -z "${needs[${key}]:-}" ]] || printf '%s=%s\n' "${key}" "${needs[${key}]}"
    done

}
module:gate:shown () {

    local dir="${1}"

    if [[ "${dir}" == "${PWD}" ]]; then @print .
    elif [[ "${dir}" == "${PWD}/"* ]]; then @print "${dir#"${PWD}/"}"
    else @print "${dir}"
    fi

}
