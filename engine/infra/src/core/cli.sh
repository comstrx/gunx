declare -gA CLI_FLAGS=() CLI_VALUED=()
declare -ga CLI_ARGS=() CLI_OVERRIDES=()

core:cli:parse () {

    CLI_FLAGS=() CLI_ARGS=() CLI_OVERRIDES=()

    while (( $# > 0 )); do

        case "${1}" in
            -e)
                [[ "${2:-}" =~ ^[A-Z][A-Z0-9_]*= ]] || { core:error:fail "Expected KEY=VALUE after -e"; return; }
                CLI_OVERRIDES+=( "${2}" )
                shift 2
            ;;
            -h|--help|--version)
                CLI_FLAGS["${1/#-h/--help}"]=true
                shift
            ;;
            --)
                shift
                CLI_ARGS+=( "$@" )
                break
            ;;
            --[a-z]*=*)
                [[ -n "${CLI_VALUED[${1%%=*}]+x}" ]] || { core:error:fail "${1%%=*} takes no value"; return; }
                [[ -z "${CLI_FLAGS[${1%%=*}]+x}" ]] || { core:error:fail "Repeated flag: ${1%%=*}"; return; }

                CLI_FLAGS["${1%%=*}"]="${1#*=}"
                shift
            ;;
            --[a-z]*)
                [[ "${1}" =~ ^--[a-z][a-z0-9-]*$ ]] || { core:error:fail "Invalid flag: ${1}"; return; }
                [[ -z "${CLI_FLAGS[${1}]+x}" ]] || { core:error:fail "Repeated flag: ${1}"; return; }

                if [[ -n "${CLI_VALUED[${1}]+x}" ]]; then
                    (( $# >= 2 )) || { core:error:fail "Value required: ${1}"; return; }
                    CLI_FLAGS["${1}"]="${2}"
                    shift 2
                else
                    CLI_FLAGS["${1}"]=true
                    shift
                fi
            ;;
            -*)
                core:error:fail "Unknown flag: ${1}"
                return
            ;;
            *)
                CLI_ARGS+=( "${1}" )
                shift
            ;;
        esac

    done

}
core:cli:flag () {

    [[ -z "${CLI_VALUED[${1}]+x}" && "${CLI_FLAGS[${1}]:-false}" == true ]]

}
core:cli:value () {

    [[ -n "${CLI_VALUED[${1}]+x}" && -n "${CLI_FLAGS[${1}]+x}" ]] || return 1

    core:log:print "${CLI_FLAGS[${1}]}"

}
core:cli:switches () {

    local flag=""

    for flag in "${!CLI_FLAGS[@]}"; do
        [[ "${flag}" == --help || "${flag}" == --version ]] || core:log:print "${flag}"
    done

    return 0

}
core:cli:suggest () {

    local wanted="${1}" candidate="" best="" distance=0 limit=3

    shift

    for candidate in "$@"; do

        [[ "${candidate}" == "${wanted}"* || "${wanted}" == "${candidate}"* ]] && { core:log:print "${candidate}"; return 0; }

        distance=$(( ${#candidate} > ${#wanted} ? ${#candidate} - ${#wanted} : ${#wanted} - ${#candidate} ))

        [[ "${candidate:0:2}" == "${wanted:0:2}" && distance -lt limit && -z "${best}" ]] && best="${candidate}"

    done

    [[ -z "${best}" ]] || core:log:print "${best}"

    return 0

}
