declare -ga GATE_ENGINES=( rust python go bun infra )
declare -ga GATE_FRAGMENTS=( api web mobile desktop )
declare -ga GATE_PARTS=( "${GATE_ENGINES[@]}" "${GATE_FRAGMENTS[@]}" tutor root )

module:gate:known () {

    core:list:has "${1}" "${GATE_PARTS[@]}" || { @err "Unknown part: ${1}; one of ${GATE_PARTS[*]}"; return; }

}
module:gate:mono () {

    [[ -d "${1}/product" || -d "${1}/engine" ]]

}
module:gate:engine () {

    local directory="${1}"

    if [[ -f "${directory}/pyproject.toml" ]]; then @print python
    elif [[ -f "${directory}/Cargo.toml" ]]; then @print rust
    elif [[ -f "${directory}/go.work" || -f "${directory}/go.mod" ]]; then @print go
    elif [[ -f "${directory}/package.json" ]]; then @print bun
    else return 1
    fi

}
module:gate:manifest () {

    module:gate:engine "${1}" >/dev/null

}
module:gate:self () {

    local root="${1}" engine=""

    if [[ -f "${root}/infra.toml" && -f "${root}/src/main.sh" ]]; then
        @print infra
    elif engine="$(module:gate:engine "${root}")"; then
        if [[ "${engine}" == bun ]] && grep -q '"gate"' -- "${root}/package.json"; then @print web
        else @print "${engine}"
        fi
    elif [[ -f "${root}/index.md" ]]; then
        @print tutor
    fi

    @print root

}
module:gate:projects () {

    local root="${1}" fragment="${2}" directory=""

    if [[ ! -d "${root}/product" ]]; then
        ! module:gate:manifest "${root}" || @print .
        return 0
    fi

    for directory in "${root}"/product/*/"${fragment}"; do

        module:gate:manifest "${directory}" || continue

        directory="${directory%/*}"
        @print "${directory##*/}"

    done

}
module:gate:product () {

    local root="${1}" wanted="${2:-}" directory=""

    if [[ -n "${wanted}" ]]; then

        [[ "${wanted}" == . || -d "${root}/product/${wanted}" ]] \
            || { @err "Unknown product: ${wanted}; see ${root}/product"; return; }

        @print "${wanted}"
        return 0

    fi

    for directory in "${root}"/product/*/; do

        [[ -d "${directory}" ]] || continue
        directory="${directory%/}"

        @print "${directory##*/}"
        return 0

    done

    [[ -d "${root}/product" ]] && { @err "No product under ${root}/product"; return; }

    @print .

}
module:gate:home () {

    local root="${1}" part="${2}" product="${3:-}" home="${1}"

    if core:list:has "${part}" "${GATE_ENGINES[@]}"; then

        home="${root}/engine/${part}"

    elif core:list:has "${part}" "${GATE_FRAGMENTS[@]}"; then

        product="$(module:gate:product "${root}" "${product}")" || return
        [[ "${product}" == . ]] || home="${root}/product/${product}/${part}"

    elif [[ "${part}" == tutor ]]; then

        home="${root}/tutor"

    elif [[ "${part}" != root ]]; then

        @err "Unknown part: ${part}"
        return

    fi

    [[ -d "${home}" ]] || home="${root}"

    @print "${home}"

}
module:gate:chain () {

    local home="${1}" part="${2}" engine=""

    core:list:has "${part}" "${GATE_FRAGMENTS[@]}" || { @print "${part}"; return 0; }

    [[ "${part}" == api ]] || { @print bun; return 0; }

    engine="$(module:gate:engine "${home}")" || { @err "No manifest for an api under ${home}"; return; }
    [[ "${engine}" != bun ]] || { @err "An api is never a Bun package: ${home}"; return; }

    @print "${engine}"

}
