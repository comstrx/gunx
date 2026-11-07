core:list:has () {

    local wanted="${1-}" item=""

    shift

    for item in "$@"; do [[ "${item}" != "${wanted}" ]] || return 0; done

    return 1

}
core:list:uniq () {

    local item=""
    local -A seen=()

    for item in "$@"; do
        [[ -n "${seen[${item}]+x}" ]] || { seen["${item}"]=1; core:log:print "${item}"; }
    done

    return 0

}
core:list:sort () {

    (( $# > 0 )) || return 0

    printf '%s\n' "$@" | sort

}
core:list:first () {

    (( $# > 0 )) || return 1

    core:log:print "${1}"

}
core:list:last () {

    (( $# > 0 )) || return 1

    core:log:print "${!#}"

}
core:list:count () {

    core:log:print "$#"

}
core:list:without () {

    local wanted="${1-}" item=""

    shift

    for item in "$@"; do [[ "${item}" == "${wanted}" ]] || core:log:print "${item}"; done

    return 0

}
core:list:shuffle () {

    (( $# > 0 )) || return 0

    if core:sys:has shuf; then printf '%s\n' "$@" | shuf
    else printf '%s\n' "$@" | sort -R
    fi

}
