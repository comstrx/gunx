fuzz:module:extract:keep () {

    local path="" kind=""
    local -a kinds=( engine fragment tutor product )

    path="$(tr -d '\0\n' < "${1}" | head -c 160)"
    kind="${kinds[$(( $(wc -c < "${1}") % 4 ))]}"

    EXTRACT_PRODUCTS=product EXTRACT_TUTOR=tutor

    module:extract:keep "${kind}" product/demo "${path}" 'engine/rust|engine/go' || true

    ! module:extract:stays "${path}" || [[ "${path}" == *.lock || "${path}" != */* ]] || return 3

}
fuzz:module:extract:notes () {

    local tree="" out=""

    tree="$(core:fs:temp:dir)" || return 0
    tr -d '\0' < "${1}" > "${tree}/CHANGELOG.md"

    out="$(module:extract:notes "${tree}" v1.2.3)" || return 3

    [[ "${out}" != *$'\n## '* && "${out}" != '## '* ]] || return 3

}
fuzz:module:extract:flows () {

    local tree="" file=""

    tree="$(core:fs:temp:dir)" || return 0
    file="${tree}/ci.yml"
    tr -d '\0' < "${1}" > "${file}"

    EXTRACT_HOMES='engine|product'

    module:extract:flows:paths "${file}" "${tree}" || return 0

    ! grep -qE '^ *- (engine|product)(/[^ ]+)?$' -- "${file}" || return 3

}
fuzz:module:extract:rename () {

    local tree="" word="" text="" lines=0

    tree="$(core:fs:temp:dir)" || return 0
    word="$(module:extract:source)" || return 0
    text="$(tr -d '\0' < "${1}" | head -c 300)"

    TARGETS=( [fuzzed]=3 [fuzzed.type]=engine [fuzzed.path]=engine/fuzzed [fuzzed.repo]=gitlab.com/team/sub/fuzzed )

    printf '%s %s %s %s\n%s\n' "${word}" "${word^^}" "${word^}" "https://github.com/x/${word}" "${text}" > "${tree}/x.toml"
    printf '%s\n' "${word}" > "${tree}/kept.txt"
    lines="$(wc -l < "${tree}/x.toml")"

    module:extract:rename "${tree}" fuzzed || return 3

    ! grep -qiF -- "${word}" "${tree}/x.toml" || return 3

    [[ "$(wc -l < "${tree}/x.toml")" == "${lines}" && "$(cat "${tree}/kept.txt")" == "${word}" ]] || return 3

}
fuzz:module:extract:anycase () {

    local text="" regex=""

    text="$(tr -cd 'A-Za-z0-9._/:-' < "${1}" | head -c 60)"
    regex="$(module:extract:anycase "${text}")" || return 3

    [[ "${text}" =~ ^${regex}$ && "${text^^}" =~ ^${regex}$ && "${text,,}" =~ ^${regex}$ ]] || return 3

}
fuzz:module:extract:name () {

    local given="" out=""

    given="$(tr -d '\0\n' < "${1}" | head -c 60)"

    TARGETS=( [rowx]=4 [rowx.type]=engine [rowx.path]=engine/row [rowx.name]="${given}" [rowx.repo]="${given}" )

    out="$(module:extract:name rowx 2>/dev/null)" || return 0

    [[ "${out}" =~ ^[A-Za-z][A-Za-z0-9_-]*$ ]] || return 3

}
