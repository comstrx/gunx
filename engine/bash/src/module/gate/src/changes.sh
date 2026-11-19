module:gate:changes () {

    local list="" kept="" row="" chain="" dir="" state="" root=""
    local -a rows=() listing=() roots=()

    (( $# == 0 )) || { core:error:usage "changes takes no argument; the directories go in --path"; return; }

    list="$(module:gate:plan 1 "$(core:cli:value --path)" "${GATE_TYPES[@]}")" || return
    [[ -z "${list}" ]] || mapfile -t rows <<< "${list}"

    for row in "${rows[@]}"; do

        IFS=$'\t' read -r chain dir <<< "${row}"
        root="$(core:git:root "${dir}")"

        core:list:has "${root}" "${roots[@]}" || { roots+=( "${root}" ); module:gate:base "${root}" >/dev/null || return; }

    done

    (( ${#rows[@]} == 0 )) || kept="$(module:gate:keep "${rows[@]}" 2>/dev/null)"

    for row in "${rows[@]}"; do

        IFS=$'\t' read -r chain dir <<< "${row}"

        state=unchanged
        [[ $'\n'"${kept}"$'\n' != *$'\n'"${row}"$'\n'* ]] || state=changed

        listing+=( "${chain}"$'\t'"$(module:gate:shown "${dir}")"$'\t'"${state}" )

    done

    (( ${#listing[@]} == 0 )) || @print "${listing[@]}" | core:ui:grid

}
module:gate:base () {

    local root="${1}" base=""

    if base="$(core:cli:value --base)"; then

        core:git:has "${root}" "${base}" || { @err "Cannot diff against ${base}"; return; }

    else

        base="${CI_BASE:-HEAD~1}"
        core:git:has "${root}" "${base}" || { @warn "Cannot diff against ${base}; everything is gated"; return 0; }

    fi

    @print "${base}"

}
module:gate:watch () {

    local dir="${1}" manifest="" item="" path=""

    @print "${dir}"

    for manifest in package.json pyproject.toml Cargo.toml go.mod go.work; do

        [[ -f "${dir}/${manifest}" ]] || continue

        while IFS= read -r item; do

            path="$(cd -- "${dir}/${item}" 2>/dev/null && pwd -P)" || continue
            [[ "${path}" == "${dir}" || "${path}" == "${dir}/"* ]] || @print "${path}"

        done < <(grep -oE '(\.\.?/)+[A-Za-z0-9._/-]*' -- "${dir}/${manifest}" | LC_ALL=C sort -u)

    done

    return 0

}
module:gate:fresh () {

    local dir="${1}" changed="${2:-}" watched="" file=""
    local -a folders=()

    [[ -n "${changed}" ]] || return 1

    mapfile -t folders < <(module:gate:watch "${dir}")

    for watched in "${folders[@]}"; do

        while IFS= read -r file; do
            [[ "${file}" != "${watched}" && "${file}" != "${watched}/"* ]] || return 0
        done <<< "${changed}"

    done

    return 1

}
module:gate:keep () {

    local row="" chain="" dir="" root="" base="" file=""
    local -A since=() moved=()

    for row in "$@"; do

        IFS=$'\t' read -r chain dir <<< "${row}"
        root="$(core:git:root "${dir}")"

        if [[ -z "${since[${root}]+x}" ]]; then

            since["${root}"]="$(module:gate:base "${root}")" || return
            moved["${root}"]=""

            if [[ -n "${since[${root}]}" ]]; then

                while IFS= read -r file; do
                    [[ -z "${file}" ]] || moved["${root}"]+="${root}/${file}"$'\n'
                done < <(core:git:changed "${root}" "${since[${root}]}")

            fi

        fi

        if [[ -z "${since[${root}]}" ]] || module:gate:fresh "${dir}" "${moved[${root}]}"; then @print "${row}"
        else @info "${chain} $(module:gate:shown "${dir}"): nothing changed since ${since[${root}]}"
        fi

    done

}
