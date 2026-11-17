bench:config:manifest:find () {

    @measure 'config:manifest:find engine' 20 100 config:manifest:find "${TOOL_ENGINE}"

}
bench:config:manifest:get () {

    @measure 'config:manifest:get meta.name' 20 400 config:manifest:get meta.name

}
