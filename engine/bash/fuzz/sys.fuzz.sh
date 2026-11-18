fuzz:core:sys:has () {

    local name=""

    name="$(tr -d '\0\n' < "${1}" | head -c 60)"

    core:sys:has "${name}" || return 0

    [[ -n "${name}" ]] || return 3

}
fuzz:core:sys:prune () {

    local run="" name=""

    run="$(core:fs:temp:dir)" || return 0
    name="$(tr -cd 'a-zA-Z0-9._-' < "${1}" | head -c 40)"

    [[ -z "${name}" ]] || mkdir -p -- "${run}/${name}" 2>/dev/null || true

    core:sys:prune "${run}"

}
