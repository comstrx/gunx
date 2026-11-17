fuzz:core:error:fail () {

    local text="" status=0

    text="$(tr -d '\0' < "${1}" | head -c 300)"

    core:error:fail "${text}" || status=$?

    (( status == 1 )) || return 3

}
