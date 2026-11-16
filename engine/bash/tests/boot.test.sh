test:module:bundle:boot:serves-the-tool-commands () {

    @eq "$(module:bundle:usage:handler hello)" module:bundle:hello
    @eq "$(module:bundle:usage:handler build)" module:gate:build
    @eq "$(module:bundle:usage:handler self)" module:bundle:self
    @eq "$(module:bundle:usage:handler check)" module:gate:kind
    @eq "$(module:bundle:usage:handler fuzz)" module:gate:kind
    @eq "$(module:bundle:usage:handler fetch)" module:bundle:fetch

}
test:module:bundle:boot:serves-changes () {

    @eq "$(module:bundle:usage:handler changes)" module:gate:changes
    @contains "$(module:bundle:usage:flags changes)" '--base|REF|'

}
test:module:bundle:boot:serves-the-gate () {

    @eq "$(module:bundle:usage:handler gate)" module:gate:run
    @eq "$(module:bundle:usage:handler lint)" module:gate:kind
    @errors 'lint takes no argument' bash "${TOOL_BIN}" lint foo
    @errors 'lint does not take --type' bash "${TOOL_BIN}" lint --type x
    @errors 'self build|check|lint|test|bench|fuzz|audit' bash "${TOOL_BIN}" self nope
    @contains "$(module:bundle:usage:flags gate)" '--type|T|'
    @contains "$(module:bundle:usage:flags gate)" '--path|P|'
    @contains "$(module:bundle:usage:flags test)" '--only-changed||'

}
test:module:bundle:boot:serves-the-distribution () {

    @eq "$(module:bundle:usage:handler extract)" module:extract:extract
    @eq "$(module:bundle:usage:handler push)" module:extract:push
    @eq "$(module:bundle:usage:handler sync)" module:extract:all
    @contains "$(module:bundle:usage:flags push)" '--repository|R|'

}
test:module:bundle:boot:routes-every-registered-command () {

    local name="" handler=""

    while IFS= read -r name; do
        handler="$(module:bundle:usage:handler "${name}")"
        declare -F "${handler}" >/dev/null || { @err "${name} routes to a missing ${handler}"; return; }
    done < <(module:bundle:usage:names)

}
test:module:bundle:boot:commands-are-the-recorded-surface () {

    local recorded="hello install checksum fetch self help version config meta system notify gate changes build run deps check lint test safety audit semver quality security bench fuzz targets extract place push sync"

    @eq "$(module:bundle:usage:names | tr '\n' ' ' | sed 's/ $//')" "${recorded}"

}
test:module:bundle:boot:global-flags-are-the-recorded-surface () {

    @eq "$(printf '%s\n' "${!UI_GLOBALS[@]}" | sort | tr '\n' ' ' | sed 's/ $//')" "--root -e"

}
test:module:bundle:boot:refuses-the-unknown () {

    @errors 'did you mean hello' bash "${TOOL_BIN}" hellp
    @errors 'does not take --list' bash "${TOOL_BIN}" hello --list
    @status 2 bash "${TOOL_BIN}" hellp
    @status 2 bash "${TOOL_BIN}" hello --list
    @errors 'Not a directory' bash "${TOOL_BIN}" --root "${TMPDIR}/nothing" hello

}
test:module:bundle:boot:serves-fetch () {

    @eq "$(module:bundle:usage:handler fetch)" module:bundle:fetch
    @eq "$(module:bundle:usage:handler build)" module:gate:build

}
