core:validate:url () {

    [[ "${1:-}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~%/+=-]*)?(\?[A-Za-z0-9._~%&=+-]*)?$ ]]

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
core:validate:branch () {

    [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "${1}" != *..* && "${1}" != */ ]]

}
core:validate:tag () {

    [[ "${1:-}" == v* ]] && core:validate:semver "${1#v}"

}
core:validate:name () {

    [[ "${1:-}" =~ ^[a-z][a-z0-9-]*$ ]]

}
