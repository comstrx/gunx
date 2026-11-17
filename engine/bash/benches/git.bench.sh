bench:core:git:address () {

    @measure 'core:git:address ssh address' 30 200 core:git:address "git@github.com:$(config:meta:owner)/rustx.git"

}
bench:core:git:resolve () {

    @measure 'core:git:resolve bare name' 30 50 core:git:resolve rustx "${TOOL_ENGINE}"

}
bench:core:git:host () {

    @measure 'core:git:host of this repository' 20 50 core:git:host "${TOOL_ENGINE}"

}
bench:core:git:trunk () {

    @measure 'core:git:trunk of this repository' 20 50 core:git:trunk "${TOOL_ENGINE}"

}
