fuzz:core:parse:toml () {

    local -A table=()

    core:parse:toml table "${1}"

}
fuzz:core:parse:env () {

    local -A pairs=()
    local -a order=()

    core:parse:env pairs order "${1}"

}
fuzz:core:parse:table () {

    local key=""
    local -A table=( [list]=2 [list.0]=one [list.1]=two [word]=text )

    key="$(tr -d '\0\n' < "${1}" | head -c 60)"

    core:parse:has table "${key}" || true
    core:parse:get table "${key}" fallback >/dev/null
    core:parse:count table "${key}" >/dev/null
    core:parse:list table "${key}" >/dev/null
    core:parse:unquote "${key}" >/dev/null || true

    [[ "$(core:parse:list table list | tr '\n' ' ')" == 'one two ' && "$(core:parse:count table list)" == 2 ]] || return 3

}
