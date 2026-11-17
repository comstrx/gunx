bench:module:gate:types () {

    @measure 'module:gate:types default' 20 100 module:gate:types default

}
bench:module:gate:chains () {

    @measure 'module:gate:chains engine' 20 100 module:gate:chains "${TOOL_ENGINE}"

}
