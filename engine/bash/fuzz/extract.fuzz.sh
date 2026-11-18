fuzz:module:extract:keep () {

    local path="" kind=""
    local -a kinds=( engine fragment tutor product )

    path="$(tr -d '\0\n' < "${1}" | head -c 160)"
    kind="${kinds[$(( $(wc -c < "${1}") % 4 ))]}"

    EXTRACT_PRODUCTS=product EXTRACT_TUTOR=tutor

    module:extract:keep "${kind}" product/demo "${path}" 'engine/rust|engine/go' || true

    ! module:extract:stays "${path}" || [[ "${path}" == *.lock ]] || core:list:has "${path%%/*}" "${EXTRACT_STAYS[@]}" || return 3

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
fuzz:module:extract:changelog () {

    local root="" tree="" out=""

    root="$(core:fs:temp:dir)" || return 0
    tree="$(core:fs:temp:dir)" || return 0

    { printf '## v1\n\n### one\n\n- kept\n\n### two\n\n### demo-part\n'; tr -d '\0' < "${1}"; } > "${root}/CHANGELOG.md"

    module:extract:changelog "${root}" "${tree}" one 'demo-*' two=shown || return 3

    out="$(cat "${tree}/CHANGELOG.md")"

    [[ "${out}" == '# Changelog'$'\n\n''## v1'$'\n\n''### one'$'\n\n''- kept'* ]] || return 3
    [[ "${out}" != *$'\n\n\n'* && "${out}" != *$'\n''### two'* && "${out}" != *$'\n''### demo-'* ]] || return 3
    [[ -n "$(tail -n 1 "${tree}/CHANGELOG.md")" ]] || return 3

}
fuzz:module:extract:shallow () {

    local tree="" text="" before=""

    tree="$(core:fs:temp:dir)" || return 0
    text="$(tr -d '\0' < "${1}" | head -c 300)"

    mkdir -p "${tree}/product/api" "${tree}/.github"
    printf 'path = "../../../engine/demo"\n%s\n' "${text}" > "${tree}/product/api/part.toml"
    printf 'at: product/demo/api\nany: product/*/web\n%s\n' "${text}" > "${tree}/.github/flow.yml"
    printf '%s\n' "${text}" > "${tree}/product/api/code.ts"
    before="$(cat "${tree}/product/api/code.ts")"

    EXTRACT_HOMES='engine|product'

    module:extract:shallow "${tree}" product product/demo || return 3

    [[ "$(head -n 1 "${tree}/product/api/part.toml")" == 'path = "../../engine/demo"' ]] || return 3
    [[ "$(head -n 2 "${tree}/.github/flow.yml")" == 'at: product/api'$'\n''any: product/web' ]] || return 3
    [[ "$(cat "${tree}/product/api/code.ts")" == "${before}" ]] || return 3

}
