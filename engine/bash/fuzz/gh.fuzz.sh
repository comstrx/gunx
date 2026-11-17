fuzz:core:gh:hosted () {

    local address="" host="" path=""

    address="$(tr -d '\0\n' < "${1}" | head -c 120)"

    core:gh:base "${address}" >/dev/null

    IFS=$'\t' read -r host path <<< "$(core:gh:hosted "${address}" 2>/dev/null)"

    [[ -z "${path}" || "${host}/${path}" == "${address}" ]] || return 3

}
