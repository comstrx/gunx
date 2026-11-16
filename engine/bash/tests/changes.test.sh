test:module:gate:watches-what-it-builds-on () {

    local root=""

    root="$(fixture:module:gate:repo)"

    @eq "$(module:gate:watch "${root}/product/demo/web" | tr '\n' ' ')" "${root}/product/demo/web ${root}/product/demo/api "
    @eq "$(module:gate:watch "${root}/engine/rust")" "${root}/engine/rust"
    module:gate:fresh "${root}/product/demo/web" "${root}/product/demo/api/main.py"
    @fails module:gate:fresh "${root}/product/demo/web" "${root}/product/demo/apiary/x"
    @fails module:gate:fresh "${root}/product/demo/web" ''

}
test:module:gate:keeps-the-changed-paths () {

    local root=""

    root="$(fixture:module:gate:repo)"
    CLI_VALUED=( [--path]=true [--base]=true )
    cd -- "${root}" || return

    printf 'changed\n' > "${root}/product/demo/api/main.py"

    CLI_FLAGS=( [--base]=HEAD )
    @eq "$(module:gate:keep "rust"$'\t'"${root}/engine/rust" "python"$'\t'"${root}/product/demo/api" "bun"$'\t'"${root}/product/demo/web" 2>/dev/null | cut -f1 | tr '\n' ' ')" 'python bun '
    @contains "$(module:gate:keep "rust"$'\t'"${root}/engine/rust" 2>&1)" 'nothing changed since HEAD'

    @contains "$(bash "${TOOL_BIN}" changes --base HEAD --path engine/rust,product/demo/api)" $'engine/rust       unchanged'
    @contains "$(bash "${TOOL_BIN}" changes --base HEAD --path product/demo/api)" $'product/demo/api  changed'
    @errors 'Cannot diff against nope' bash "${TOOL_BIN}" changes --base nope
    @errors 'changes takes no argument' bash "${TOOL_BIN}" changes extra

}
