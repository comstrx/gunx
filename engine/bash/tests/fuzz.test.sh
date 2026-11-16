fixture:module:bundle:fuzz:crash () {

    return 3

}
fixture:module:bundle:fuzz:hang () {

    sleep 30

}
fixture:module:bundle:fuzz:fine () {

    [[ -f "${1}" ]]

}
test:module:bundle:fuzz:loop-names-crash-and-hang () {

    local input="${TMPDIR}/input" status=0 result=""

    result="$(module:bundle:fuzz:loop fixture:module:bundle:fuzz:crash "${input}" 5)" || status=$?
    @eq "${status} ${result}" '2 0 3'

    status=0
    result="$(core:proc:timeout 2 module:bundle:fuzz:loop fixture:module:bundle:fuzz:hang "${input}" 1)" || status=$?
    @eq "${status}" 124

    result="$(module:bundle:fuzz:loop fixture:module:bundle:fuzz:fine "${input}" 1)"
    [[ "${result}" =~ ^[1-9][0-9]*\ 0$ ]]

}
