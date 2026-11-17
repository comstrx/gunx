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

    if core:ui:color; then printf '\n\033[1m%s\033[0m\n\n' "${1-}"
    else printf '\n%s\n\n' "${1-}"
    fi

}
core:ui:row () {

    local width="${UI_WIDTH:-40}" key="${1-}" pad=0

    if [[ -z "${2-}" ]]; then printf '  %s\n' "${key}"; return 0; fi

    (( pad = width - ${#key}, pad > 0 )) || pad=0

    if core:ui:color; then printf '  \033[36m%s\033[0m%*s  %s\n' "${key}" "${pad}" '' "${2}"
    else printf '  %s%*s  %s\n' "${key}" "${pad}" '' "${2}"
    fi

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
core:ui:grid () {

    local line="" cell="" text="" pad="" index=0 paint=false
    local -a rows=() cells=() widths=()

    mapfile -t rows
    ! core:ui:color || paint=true

    for line in "${rows[@]}"; do

        core:str:split cells "${line}" $'\t'

        for (( index = 0; index < ${#cells[@]}; index++ )); do
            widths[index]="${widths[index]:-0}"
            (( ${#cells[index]} <= widths[index] )) || widths[index]="${#cells[index]}"
        done

    done

    for line in "${rows[@]}"; do

        core:str:split cells "${line}" $'\t'
        text=""

        for (( index = 0; index < ${#cells[@]}; index++ )); do

            cell="${cells[index]}"

            if (( index == ${#cells[@]} - 1 )); then

                text+="${cell}"

            elif (( index == 0 )); then

                printf -v pad '%*s' "$(( widths[index] - ${#cell} + 2 ))" ''

                if [[ "${paint}" == true ]]; then text+=$'\033[36m'"${cell}"$'\033[0m'"${pad}"
                else text+="${cell}${pad}"
                fi

            else

                printf -v cell '%-*s  ' "${widths[index]}" "${cell}"
                text+="${cell}"

            fi

        done

        printf '  %s\n' "${text}"

    done

}
core:ui:confirm () {

    local question="${1-}" answer=""

    [[ -t 0 ]] || return 2

    printf '%s [y/N] ' "${question}" >&2

    IFS= read -r answer || return 1

    [[ "${answer}" == [yY] || "${answer}" == [yY][eE][sS] ]]

}
