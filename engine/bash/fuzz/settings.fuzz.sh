fuzz:config:settings:validate () {

    local value=""

    value="$(tr -d '\0\n' < "${1}" | head -c 60)"

    CONFIG[RUN_TIMEOUT]="${value}"

    config:settings:validate || return 0

    [[ "${value}" =~ ^[0-9]+$ ]] || return 3

}
