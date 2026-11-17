bench:core:toml:read () {

    local -A table=()

    @measure 'toml table of the manifest' 20 10 core:parse:toml table "${MANIFEST_FILE}"

}
