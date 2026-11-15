core:json:quote () {

    local -n _quoted="${1}"
    local text="${2-}" plain="" char="" index=0

    text="${text//\\/\\\\}"
    text="${text//\"/\\\"}"
    text="${text//$'\n'/\\n}"
    text="${text//$'\r'/\\r}"
    text="${text//$'\t'/\\t}"
    text="${text//$'\b'/\\b}"
    text="${text//$'\f'/\\f}"

    if [[ "${text}" == *[[:cntrl:]]* ]]; then

        for (( index = 0; index < ${#text}; index++ )); do

            char="${text:index:1}"
            [[ "${char}" != [[:cntrl:]] ]] || printf -v char '\\u%04x' "'${char}"

            plain+="${char}"

        done

        text="${plain}"

    fi

    _quoted="\"${text}\""

}
core:json:string () {

    local quoted=""

    core:json:quote quoted "${1-}"

    core:log:print "${quoted}"

}
core:json:object () {

    local body="" key=""

    (( $# % 2 == 0 )) || { core:error:fail "An object takes key and value pairs"; return; }

    while (( $# > 0 )); do

        [[ -n "${1}" && -n "${2}" ]] || { core:error:fail "An object pair needs a key and a value: ${1:-?}"; return; }

        core:json:quote key "${1}"
        body+="${body:+,}${key}:${2}"

        shift 2

    done

    core:log:print "{${body}}"

}
core:json:array () {

    local IFS=,

    core:log:print "[$*]"

}
