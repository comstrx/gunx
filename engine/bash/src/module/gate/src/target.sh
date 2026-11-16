declare -ga GATE_GOVERNANCE=( quality security )

module:gate:chains () {

    local dir="${1}"

    [[ ! -f "${dir}/infra.toml" || ! -f "${dir}/src/main.sh" ]] || @print bash
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
            || { @err "No gate target in ${path}: no infra.toml with src/main.sh, pyproject.toml, Cargo.toml, go.work, go.mod or package.json"; return; }

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
module:gate:within () {

    local tree="${1}" dir="" chain="" found=0

    while IFS= read -r chain; do

        found=1
        printf '%s\t%s\n' "${chain}" "${tree}"

    done < <(module:gate:chains "${tree}")

    if (( found == 0 )); then

        for dir in "${tree}"/*/; do

            dir="${dir%/}"

            while IFS= read -r chain; do
                printf '%s\t%s\n' "${chain}" "${dir}"
            done < <(module:gate:chains "${dir}")

        done

    fi

    printf 'root\t%s\n' "${tree}"

}
module:gate:shown () {

    local dir="${1}"

    if [[ "${dir}" == "${PWD}" ]]; then @print .
    elif [[ "${dir}" == "${PWD}/"* ]]; then @print "${dir#"${PWD}/"}"
    else @print "${dir}"
    fi

}
