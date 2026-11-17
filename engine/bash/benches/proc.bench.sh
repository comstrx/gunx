bench:core:proc:seconds () {

    @measure 'core:proc:seconds' 20 400 core:proc:seconds 30 bench

}
bench:core:proc:within () {

    @measure 'core:proc:within a folder' 20 100 core:proc:within "${TOOL_ENGINE}" true

}
