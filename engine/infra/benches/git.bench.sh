bench:module:extract:git:parse () {

    @measure 'module:extract:git:parse ssh address' 30 200 module:extract:git:parse "git@github.com:$(config:meta:owner)/rustx.git"

}
bench:module:extract:git:resolve () {

    @measure 'module:extract:git:resolve bare name' 30 50 module:extract:git:resolve rustx "${TOOL_ENGINE}"

}
