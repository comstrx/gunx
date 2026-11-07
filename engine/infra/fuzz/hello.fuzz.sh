fuzz:module:bundle:hello () {

    local text=""

    text="$(tr -cd 'a-z-' < "${1}" | head -c 32)"

    [[ "$(module:bundle:hello "${text}")" == "hello world" ]]

}
