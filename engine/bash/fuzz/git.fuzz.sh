fuzz:module:extract:git:parse () {

    local text=""

    text="$(tr -d '\0' < "${1}" | head -c 128)"

    module:extract:git:parse "${text}" >/dev/null

}
fuzz:module:extract:git:resolve () {

    local text=""

    text="$(tr -d '\0\n' < "${1}" | head -c 96)"

    module:extract:git:resolve "${text}" "${TOOL_ENGINE}" >/dev/null

}
