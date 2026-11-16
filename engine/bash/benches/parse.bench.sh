bench:core:parse:toml () {

    local file=""
    local -A table=()

    file="$(core:fs:temp:file)" || return
    cat "${TOOL_ENGINE}/infra.toml" > "${file}"

    @measure 'core:parse:toml infra.toml' 30 20 core:parse:toml table "${file}"

}
bench:core:parse:env () {

    local file=""
    local -A pairs=()
    local -a order=()

    file="$(core:fs:temp:file)" || return
    cat "${TOOL_ENGINE}/.env.example" > "${file}"

    @measure 'core:parse:env .env.example' 30 50 core:parse:env pairs order "${file}"

}
