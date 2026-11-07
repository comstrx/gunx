core:ui:color () {

    [[ -z "${NO_COLOR:-}" ]] || return 1
    [[ -z "${FORCE_COLOR:-}" ]] || return 0

    [[ -t 1 && "${TERM:-dumb}" != dumb ]]

}
core:ui:paint () {

    local color="${1}" text="${2-}"

    if core:ui:color; then printf '\033[%sm%s\033[0m' "${color}" "${text}"
    else printf '%s' "${text}"
    fi

}
core:ui:section () {

    printf '\n%s\n\n' "$(core:ui:paint 1 "${1-}")"

}
core:ui:row () {

    local width="${UI_WIDTH:-40}" pad=0

    if [[ -z "${2-}" ]]; then printf '  %s\n' "${1-}"; return 0; fi

    (( pad = width - ${#1}, pad > 0 )) || pad=0

    printf '  %s%*s  %s\n' "$(core:ui:paint 36 "${1}")" "${pad}" '' "${2}"

}
core:ui:table () {

    local line="" key="" value="" UI_WIDTH=0
    local -a rows=()

    mapfile -t rows

    for line in "${rows[@]}"; do
        key="${line%%$'\t'*}"
        (( ${#key} <= UI_WIDTH )) || UI_WIDTH="${#key}"
    done

    for line in "${rows[@]}"; do
        key="${line%%$'\t'*}"
        value="${line#*$'\t'}"
        [[ "${line}" == *$'\t'* ]] || value=""
        core:ui:row "${key}" "${value}"
    done

}
