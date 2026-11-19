fuzz:config:targets:load () {

    local key="" name=""
    local -A table=()

    core:parse:toml table "${1}" 2>/dev/null || return 0

    MANIFEST=()

    for key in "${!table[@]}"; do
        MANIFEST["deps.${key}"]="${table[${key}]}"
    done

    config:targets:load || return 0

    while IFS= read -r name; do

        config:targets:get "${name}" type >/dev/null || true
        config:targets:get "${name}" path >/dev/null || true
        config:targets:get "${name}" tag >/dev/null
        config:targets:get "${name}" branch >/dev/null
        config:targets:get "${name}" logo >/dev/null
        config:targets:refs "${name}" >/dev/null
        config:targets:engines "${name}" >/dev/null

    done < <(config:targets:list)

    config:targets:get '' type 2>/dev/null || true
    config:targets:get "$(tr -d '\0\n' < "${1}" | head -c 40)" path >/dev/null

}
fuzz:config:targets:write () {

    local text="" name="" rest=""

    text="$(tr -d '\0' < "${1}" | head -c 200)"
    name="${text%%$'\n'*}"
    name="${name:0:40}"
    rest="${text#*$'\n'}"

    TARGETS=()

    if config:targets:set "${name}" logo "${rest}" 2>/dev/null; then

        [[ "${name}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ && "${rest}" != *[[:cntrl:]]* ]] || return 3
        [[ ${#TARGETS[@]} -eq 2 && "${TARGETS[${name}.logo]}" == "${rest}" ]] || return 3

    else

        [[ ${#TARGETS[@]} -eq 0 ]] || return 3

    fi

    TARGETS=()

    if config:targets:set okx path "${name}" 2>/dev/null; then core:fs:path:relative "${name}" || return 3
    else [[ ${#TARGETS[@]} -eq 0 ]] || return 3
    fi

}
fuzz:config:targets:lists () {

    local text="" line="" tabs="" count=0
    local -a words=()

    text="$(tr -d '\0' < "${1}" | head -c 200)"

    mapfile -t words <<< "${text}"

    TARGETS=()

    if config:targets:fill okx engines "${words[@]}" 2>/dev/null; then

        [[ "${TARGETS[okx.engines]}" == "${#words[@]}" ]] || return 3
        [[ "$(config:targets:engines okx)" == "$(printf '%s\n' "${words[@]}")" || ${#words[@]} -eq 0 ]] || return 3

    else

        [[ ${#TARGETS[@]} -eq 0 ]] || return 3

    fi

    TARGETS=()

    config:targets:link okx "${words[@]}" 2>/dev/null || { [[ ${#TARGETS[@]} -eq 0 ]] || return 3; return 0; }

    while IFS= read -r line; do

        tabs="${line//[!$'\t']/}"
        [[ ${#tabs} -eq 2 ]] || return 3

        count=$(( count + 1 ))

    done < <(config:targets:refs okx)

    [[ "${count}" == "$(( ${#words[@]} / 2 ))" ]] || return 3

}
fuzz:config:targets:settle () {

    local spec="" first=""

    spec="$(tr -d '\0\n' < "${1}" | head -c 120)"

    [[ -n "${spec}" ]] || return 0

    TARGETS=( [onex]=1 [onex.repo]="${spec}" [onex.refs]=1 [onex.refs.0.repo]="${spec}" )

    config:targets:settle 2>/dev/null || { [[ "${spec}" != */* && "${spec}" != *:* ]] || return 3; return 0; }

    first="${TARGETS[onex.repo]}"

    [[ "${first}" == "${spec}" || "${first}" == /* || "${first}" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9_.-]+){2,}$ ]] || return 3
    [[ "${TARGETS[onex.refs.0.repo]}" == "${first}" ]] || return 3

    config:targets:settle 2>/dev/null || return 3

    [[ "${TARGETS[onex.repo]}" == "${first}" && "${TARGETS[onex.refs.0.repo]}" == "${first}" ]] || return 3

}
