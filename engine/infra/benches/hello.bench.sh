bench:module:bundle:hello:function () {

    @measure 'module:bundle:hello in process' 50 400 module:bundle:hello

}
bench:module:bundle:hello:bundle () {

    local bundle=""

    bundle="$(module:bundle:build:current)" || return

    @measure 'bash bundle hello' 20 1 bash "${bundle}" hello

}
