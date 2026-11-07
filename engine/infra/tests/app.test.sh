test:app:router:serves-the-tool-commands () {

    @eq "$(module:bundle:usage:handler hello)" module:bundle:hello
    @eq "$(module:bundle:usage:handler build)" module:bundle:build:pick
    @eq "$(module:bundle:usage:handler check)" module:bundle:check
    @eq "$(module:bundle:usage:handler fetch)" module:bundle:fetch

}
test:app:router:serves-changes () {

    @eq "$(module:bundle:usage:handler changes)" module:gate:changes
    @contains "$(module:bundle:usage:flags changes)" '--base|REF|'

}
test:app:router:serves-the-gate () {

    @eq "$(module:bundle:usage:handler gate)" module:gate:run
    @contains "$(module:bundle:usage:flags gate)" '--type|T|'

}
test:app:router:serves-the-distribution () {

    @eq "$(module:bundle:usage:handler extract)" module:extract:extract
    @eq "$(module:bundle:usage:handler push)" module:extract:push
    @eq "$(module:bundle:usage:handler sync)" module:extract:all
    @contains "$(module:bundle:usage:flags push)" '--repository|R|'

}
test:app:routes-every-registered-command () {

    local name="" handler=""

    while IFS= read -r name; do
        handler="$(module:bundle:usage:handler "${name}")"
        declare -F "${handler}" >/dev/null || { @err "${name} routes to a missing ${handler}"; return; }
    done < <(module:bundle:usage:names)

}
