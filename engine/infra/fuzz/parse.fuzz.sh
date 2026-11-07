fuzz:core:parse:toml () {

    local -A table=()

    core:parse:toml table "${1}"

}
fuzz:core:parse:env () {

    local -A pairs=()
    local -a order=()

    core:parse:env pairs order "${1}"

}
