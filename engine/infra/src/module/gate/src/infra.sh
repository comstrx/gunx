module:gate:infra:deps () {

    module:gate:runtime && bash src/main.sh fetch shellcheck

}
module:gate:infra:check () {

    bash src/main.sh check

}
module:gate:infra:test () {

    bash src/main.sh test

}
module:gate:infra:safety () {

    bash src/main.sh test --shuffle

}
module:gate:infra:audit () {

    bash src/main.sh audit

}
module:gate:infra:bench () {

    bash src/main.sh bench

}
module:gate:infra:fuzz () {

    bash src/main.sh fuzz "$(( GATE_SECONDS * 9 / 10 / 10 ))"

}
module:gate:runtime () {

    local manager=""
    local -a missing=() runtime=()

    manager="$(core:pkg:manager)" || return
    mapfile -t missing < <(config:packages:missing "${manager}")

    (( ${#missing[@]} > 0 )) || { @info "runtime complete: ${MANIFEST[requires.runtime]}"; return 0; }

    core:pkg:refresh || return
    core:pkg:install "${missing[@]}" || return

    read -r -a runtime <<< "${MANIFEST[requires.runtime]}"
    core:sys:need "${runtime[@]}"

}
