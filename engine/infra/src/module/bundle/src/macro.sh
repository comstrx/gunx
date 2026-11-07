@use () {

    core:load:use "$@"

}
@print () {

    core:log:print "$@"

}
@debug () {

    core:log:debug "$@"

}
@info () {

    core:log:info "$@"

}
@succ () {

    core:log:succ "$@"

}
@warn () {

    core:log:warn "$@"

}
@err () {

    core:error:fail "$@"

}
@usage () {

    module:bundle:usage:add "$@"

}
@flag () {

    module:bundle:usage:flag "$@"

}
@global () {

    module:bundle:usage:global "$@"

}
@eq () {

    module:bundle:expect:equal "$@"

}
@contains () {

    module:bundle:expect:contains "$@"

}
@absent () {

    module:bundle:expect:absent "$@"

}
@fails () {

    module:bundle:expect:fail "$@"

}
@errors () {

    module:bundle:expect:error "$@"

}
@status () {

    module:bundle:expect:status "$@"

}
@measure () {

    module:bundle:bench:measure "$@"

}
@tool () {

    module:bundle:tool:run "$@"

}
@fetch () {

    module:bundle:fetch "$@"

}
