test:app:router:commands-are-the-recorded-surface () {

    local recorded="hello build install checksum fetch check test bench fuzz audit help version config meta system gate changes targets extract place push sync"

    @eq "$(module:bundle:usage:names | tr '\n' ' ' | sed 's/ $//')" "${recorded}"

}
test:app:router:global-flags-are-the-recorded-surface () {

    @eq "$(printf '%s\n' "${!UI_GLOBALS[@]}" | sort | tr '\n' ' ' | sed 's/ $//')" "--root -e"

}
test:app:router:refuses-the-unknown () {

    @errors 'did you mean hello' bash "${TOOL_BIN}" hellp
    @errors 'does not take --list' bash "${TOOL_BIN}" hello --list
    @status 2 bash "${TOOL_BIN}" hellp
    @status 2 bash "${TOOL_BIN}" hello --list
    @errors 'Not a directory' bash "${TOOL_BIN}" --root "${TMPDIR}/nothing" hello

}
test:module:bundle:help:prints () {

    @contains "$(bash "${TOOL_BIN}" help extract)" '--into DIR'
    @contains "$(bash "${TOOL_BIN}" help)" 'Commands'
    @contains "$(bash "${TOOL_BIN}" --help test)" '--shuffle'
    @contains "$(bash "${TOOL_BIN}" help hello)" 'Say hello world'
    @absent "$(bash "${TOOL_BIN}" help hello)" 'Flags'
    @errors 'did you mean' bash "${TOOL_BIN}" help hellp

}
test:module:bundle:view:prints-config () {

    @contains "$(bash "${TOOL_BIN}" config)" 'LOG_LEVEL'
    @eq "$(bash "${TOOL_BIN}" config LOG_LEVEL)" info
    @eq "$(bash "${TOOL_BIN}" -e LOG_LEVEL=warn config --changed | tr -s ' ')" ' LOG_LEVEL warn (cli)'
    @errors 'config [KEY]' bash "${TOOL_BIN}" config A B

}
