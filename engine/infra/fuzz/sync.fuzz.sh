fuzz:module:extract:keep () {

    local path="" kind=""
    local -a kinds=( engine fragment tutor product )

    path="$(tr -d '\0\n' < "${1}" | head -c 160)"
    kind="${kinds[$(( $(wc -c < "${1}") % 4 ))]}"

    module:extract:keep "${kind}" product/demo "${path}"

}
fuzz:module:extract:governance () {

    local path=""

    path="$(tr -d '\0\n' < "${1}" | head -c 160)"

    module:extract:governance "${path}"

}
