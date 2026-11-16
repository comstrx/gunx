test:module:bundle:help:prints () {

    @contains "$(bash "${TOOL_BIN}" help extract)" '--into DIR'
    @contains "$(bash "${TOOL_BIN}" help)" 'Commands'
    @contains "$(bash "${TOOL_BIN}" --help self)" '--shuffle'
    @contains "$(bash "${TOOL_BIN}" help hello)" 'Say hello world'
    @absent "$(bash "${TOOL_BIN}" help hello)" 'Flags'
    @errors 'did you mean' bash "${TOOL_BIN}" help hellp

}
