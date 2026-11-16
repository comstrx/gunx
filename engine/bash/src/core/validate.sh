core:validate:url () {

    [[ "${1:-}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~%/+=:@-]*)?(\?[A-Za-z0-9._~%&=+/:@-]*)?$ ]]

}
core:validate:identifier () {

    [[ "${1:-}" =~ ^[a-z][a-z0-9_-]*$ ]]

}
core:validate:key () {

    [[ "${1:-}" =~ ^[A-Z][A-Z0-9_]*$ ]]

}
core:validate:number () {

    [[ "${1:-}" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]

}
core:validate:sha256 () {

    [[ "${1:-}" =~ ^[0-9a-f]{64}$ ]]

}
core:validate:semver () {

    [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.+-][A-Za-z0-9.-]+)?$ ]]

}
core:validate:breaking () {

    local from="${1#v}" to="${2#v}"
    local -a older=() newer=()

    core:validate:semver "${from}" && core:validate:semver "${to}" || return 1

    IFS=. read -r -a older <<< "${from%%[+-]*}"
    IFS=. read -r -a newer <<< "${to%%[+-]*}"

    if (( 10#${older[0]} == 0 )); then (( 10#${newer[0]} > 0 || 10#${newer[1]} > 10#${older[1]} ))
    else (( 10#${newer[0]} > 10#${older[0]} ))
    fi

}
core:validate:branch () {

    [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "${1}" != *..* && "${1}" != */ ]]

}
core:validate:tag () {

    [[ "${1:-}" == v* ]] && core:validate:semver "${1#v}"

}
core:validate:name () {

    [[ "${1:-}" =~ ^[a-z][a-z0-9-]*$ ]]

}
core:validate:email () {

    [[ "${1:-}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]

}
