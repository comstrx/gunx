module:gate:build () {

    module:gate:life build "$@"

}
module:gate:launch () {

    module:gate:life run "$@"

}
module:gate:install () {

    module:gate:life install "$@"

}
module:gate:update () {

    module:gate:life update "$@"

}
module:gate:remove () {

    module:gate:life remove "$@"

}
module:gate:life () {

    local action="${1}" dev=0 paths="" list="" row="" chain="" dir=""
    local -a rest=() rows=()

    shift

    ! core:cli:flag --dev || dev=1
    paths="$(core:cli:value --path)" || paths=""

    while (( $# > 0 )); do

        case "${1}" in
            --dev)    dev=1; shift ;;
            --path=*) paths="${1#*=}"; shift ;;
            --path)   (( $# >= 2 )) || { core:error:usage "--path needs the directories"; return; }; paths="${2}"; shift 2 ;;
            --)       rest+=( "$@" ); break ;;
            *)        rest+=( "${1}" ); shift ;;
        esac

    done

    list="$(module:gate:plan 1 "${paths}")" || return
    [[ -z "${list}" ]] || mapfile -t rows <<< "${list}"

    (( ${#rows[@]} > 0 )) || { @err "Nothing to ${action} here: no language under ${paths:-the working directory}"; return; }
    [[ "${action}" != run || ${#rows[@]} -eq 1 ]] || { @err "run takes one target, not ${#rows[@]}; name it with --path"; return; }

    for row in "${rows[@]}"; do

        IFS=$'\t' read -r chain dir <<< "${row}"

        module:gate:fits "${chain}" "${action}" || { @err "${chain} has no ${action}"; return; }

        @info "${action} ${chain} $(module:gate:shown "${dir}")$( (( dev == 0 )) || printf ' (dev)' )"

        core:proc:within "${dir}" "module:gate:${chain}:${action}" "${dev}" "${rest[@]}" || return

    done

}
