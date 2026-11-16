test:module:bundle:view:prints-config () {

    @contains "$(bash "${TOOL_BIN}" config)" 'LOG_LEVEL'
    @eq "$(bash "${TOOL_BIN}" config LOG_LEVEL)" info
    @eq "$(bash "${TOOL_BIN}" -e LOG_LEVEL=warn config --changed | tr -s ' ')" ' LOG_LEVEL warn (cli)'
    @errors 'config [KEY]' bash "${TOOL_BIN}" config A B

}
