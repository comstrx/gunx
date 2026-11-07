fuzz:core:cli:parse () {

    local -a words=()

    mapfile -t words < <(tr -c 'a-zA-Z0-9=_.-' '\n' < "${1}" | head -64)

    CLI_VALUED=( [--root]=true )

    core:cli:parse "${words[@]}"

}
