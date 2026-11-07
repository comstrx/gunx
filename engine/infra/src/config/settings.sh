config:settings:manifest () {

    local file=""

    if declare -F bundle:asset >/dev/null; then config:manifest:load "" || return
    else file="$(config:manifest:file "${TOOL_ENGINE}")" || return; config:manifest:load "${file}" || return
    fi

    [[ "${TOOL_BUNDLED:-false}" == true ]] || TOOL_BIN="${TOOL_ENGINE}/${MANIFEST[paths.entrypoint]}"

}
config:settings:schema () {

    local key=""

    local -A pairs=()
    local -a order=()

    if declare -F bundle:asset >/dev/null; then core:parse:env pairs order <(bundle:asset .env.example) || return
    else core:parse:env pairs order "${TOOL_ENGINE}/.env.example" || return
    fi

    for key in "${order[@]}"; do
        core:cfg:default "${key}" "${pairs[${key}]}" || return
    done

}
config:settings:file () {

    local name=""
    local -a names=( .env.local .env )

    [[ "${TOOL_BUILD}" != release ]] || names=( .env.production .env )

    for name in "${names[@]}"; do
        [[ ! -f "${TOOL_ROOT}/${name}" ]] || { core:log:print "${TOOL_ROOT}/${name}"; return 0; }
    done

    return 0

}
config:settings:load () {

    local file=""

    config:settings:schema || return

    file="$(config:settings:file)" || return

    [[ -z "${file}" ]] || core:cfg:load "${file}" known file || return

    core:cfg:environment || return
    core:cfg:overrides "${CLI_OVERRIDES[@]}" || return

    config:settings:validate

}
config:settings:validate () {

    case "${CONFIG[LOG_LEVEL]}" in
        debug|info|warn|error) ;;
        *) core:error:fail "LOG_LEVEL must be debug, info, warn or error"; return ;;
    esac

    core:cfg:number RUN_TIMEOUT 1 || return
    core:cfg:number RUN_RETRIES 1 10 || return
    core:cfg:number RUN_BACKOFF 0 60 || return
    core:cfg:number TEST_TIMEOUT 1 || return
    core:cfg:number BENCH_TOLERANCE 0 1000 || return

}
config:settings:keys () {

    core:log:print "${CONFIG_KEYS[@]}"

}
