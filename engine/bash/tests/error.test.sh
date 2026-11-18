test:core:error:returns-the-code () {

    @status 1 core:error:fail broken
    @status 2 core:error:usage 'extract NAME'
    @status 7 core:error:raise 7 seven
    @status 1 core:error:raise 999 bad

}
test:core:error:prints-on-stderr () {

    @eq "$(core:error:fail broken 2>&1 >/dev/null)" '[-] broken'
    @eq "$(core:error:fail broken 2>/dev/null)" ''
    @contains "$(core:error:usage 'gate PART' 2>&1)" "see $(config:meta:alias) help"
    @contains "$(LOG_LEVEL=debug core:error:fail here 2>&1)" 'raised 1 in'

}
test:core:error:cleans-the-session () {

    local directory=""

    directory="$(mktemp -d "${TMPDIR}/session.XXXXXXXX")"

    TOOL_TEMP="${directory}" core:error:cleanup
    [[ ! -d "${directory}" ]]

}
test:core:error:warns-when-the-session-stays () {

    local directory="" report="" stubs="${TMPDIR}/stubs"

    directory="$(mktemp -d "${TMPDIR}/session.XXXXXXXX")"

    mkdir -p "${stubs}"
    printf '#!/bin/sh\nexit 1\n' > "${stubs}/rm"
    chmod 755 "${stubs}/rm"

    report="$(PATH="${stubs}:${PATH}" TOOL_TEMP="${directory}" core:error:cleanup 2>&1)"

    @contains "${report}" "Cannot remove ${directory}"

}
