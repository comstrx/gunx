fuzz:config:targets:load () {

    local key="" name=""
    local -A table=()

    core:parse:toml table "${1}" 2>/dev/null || return 0

    MANIFEST=()

    for key in "${!table[@]}"; do
        MANIFEST["deps.${key}"]="${table[${key}]}"
    done

    config:targets:load || return 0

    while IFS= read -r name; do

        config:targets:get "${name}" type >/dev/null || true
        config:targets:get "${name}" path >/dev/null || true
        config:targets:get "${name}" tag >/dev/null
        config:targets:get "${name}" branch >/dev/null
        config:targets:get "${name}" title >/dev/null
        config:targets:deps "${name}" >/dev/null
        config:targets:engines "${name}" >/dev/null

    done < <(config:targets:list)

    config:targets:get '' type 2>/dev/null || true
    config:targets:get "$(tr -d '\0\n' < "${1}" | head -c 40)" path >/dev/null

}
