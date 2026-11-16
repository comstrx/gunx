module:bundle:expect:equal () {

    [[ "${1-}" == "${2-}" ]] || { core:error:fail "Expected '${2-}' but got '${1-}': ${3:-values differ}"; return; }

}
module:bundle:expect:contains () {

    [[ "${1-}" == *"${2-}"* ]] || { core:error:fail "Missing '${2-}': ${3:-content differs}"; return; }

}
module:bundle:expect:absent () {

    [[ "${1-}" != *"${2-}"* ]] || { core:error:fail "Unexpected '${2-}': ${3:-content differs}"; return; }

}
module:bundle:expect:status () {

    local expected="${1}" status=0

    shift
    "$@" >/dev/null 2>&1 || status=$?

    module:bundle:expect:equal "${status}" "${expected}" "exit status of ${1-}"

}
module:bundle:expect:fail () {

    ! "$@" >/dev/null 2>&1 || { core:error:fail "Expected failure: $*"; return; }

}
module:bundle:expect:error () {

    local message="${1}" output="" status=0

    shift
    output="$("$@" 2>&1 >/dev/null)" || status=$?

    (( status != 0 )) || { core:error:fail "Expected failure: $*"; return; }
    module:bundle:expect:contains "${output}" "${message}" "error of ${1-}"

}
module:bundle:expect:discover () {

    local prefix="${1:-test:}" name=""

    while IFS= read -r name; do
        [[ "${name}" == "${prefix}"* ]] && core:log:print "${name}"
    done < <(compgen -A function "${prefix}")

    return 0

}
#cfg[test]
module:bundle:expect:proves-itself () {

    local file="${TMPDIR}/hashed"

    printf 'proof' > "${file}"

    module:bundle:expect:equal "$(core:fs:file:hash "${file}")" "$(sha256sum -- "${file}" | cut -d' ' -f1)"

}
