fuzz:core:ui:tables () {

    local text=""

    text="$(tr -d '\0' < "${1}" | head -c 400)"

    core:ui:table <<< "${text}" >/dev/null
    core:ui:grid <<< "${text}" >/dev/null
    core:ui:section "${text%%$'\n'*}" >/dev/null
    core:ui:paint red "${text}" >/dev/null

}
