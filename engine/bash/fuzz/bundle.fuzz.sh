fuzz:module:bundle:hello () {

    local text=""

    text="$(tr -cd 'a-z-' < "${1}" | head -c 32)"

    [[ "$(module:bundle:hello "${text}")" == "hello world" ]]

}
fuzz:module:bundle:bash () {

    local -a words=()

    mapfile -t words < <(tr -d '\0' < "${1}" | head -n 2)

    module:bundle:bash:enough "${words[0]:-}" "${words[1]:-5.2}" || true

    module:bundle:bash:enough 5.2 5.2 && module:bundle:bash:enough 4.4 5.0 && ! module:bundle:bash:enough 5.3 5.2 || return 3

}
fuzz:module:bundle:bench () {

    local line=""

    line="$(tr -d '\0\n' < "${1}" | head -c 200)"

    module:bundle:bench:field "${line}" p50ns >/dev/null || true
    module:bundle:bench:member "bench:${line}" >/dev/null

}
fuzz:module:bundle:load:resolve () {

    local name=""

    name="$(tr -d '\0\n' < "${1}" | head -c 80)"

    module:bundle:load:exists "${name}" || true
    module:bundle:load:resolve "${name}" || true
    module:bundle:load:use "${name}"

}
fuzz:module:bundle:alias () {

    local out=""

    CLI_VALUED=( [--alias]=true )
    CLI_FLAGS=( [--alias]="$(tr -d '\0\n' < "${1}" | head -c 40)" )

    out="$(module:bundle:build:alias 2>/dev/null)" || return 0

    [[ "${out}" =~ ^[a-z][a-z0-9-]*$ ]] || return 3

}
