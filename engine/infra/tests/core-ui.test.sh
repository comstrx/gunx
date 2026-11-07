fixture:module:bundle:usage:registry () {

    UI_COMMANDS=() UI_FLAGS=() UI_GLOBALS=() UI_INDEX=()

    @usage ship demo:ship 'ship NAME [--to DIR] [--force]' 'Ship a thing'
    @flag ship '--to DIR' 'Where it goes'
    @flag ship '--force' 'Ignore the guards'
    @global --root DIR 'The root'

}
test:module:bundle:usage:registers-commands () {

    fixture:module:bundle:usage:registry

    @eq "$(module:bundle:usage:command ship)" 'ship|demo:ship|ship NAME [--to DIR] [--force]|Ship a thing'
    @eq "$(module:bundle:usage:handler ship)" demo:ship
    @eq "$(module:bundle:usage:names)" ship
    @fails module:bundle:usage:command fly

}
test:module:bundle:usage:refuses-bad-registrations () {

    fixture:module:bundle:usage:registry

    @errors 'already registered' @usage ship demo:ship 'ship' 'Again'
    @errors 'Invalid command name' @usage Ship demo:ship 'ship' 'Case'
    @errors 'exceeds 80' @usage long demo:long 'long' "$(printf 'x%.0s' {1..81})"
    @errors 'unknown command' @flag fly '--to DIR' 'Nowhere'
    @errors 'Invalid flag spec' @flag ship 'to DIR' 'No dashes'
    @errors 'Invalid global flag' @global root '' 'No dash'

}
test:module:bundle:usage:derives-the-valued-flags () {

    fixture:module:bundle:usage:registry
    module:bundle:usage:valued

    @eq "$(printf '%s\n' "${!CLI_VALUED[@]}" | sort | tr '\n' ' ')" '--root --to '
    module:bundle:usage:allowed ship --force
    module:bundle:usage:allowed ship --root
    @fails module:bundle:usage:allowed ship --list

}
test:core:ui:aligns-a-table () {

    local aligned=""

    aligned="$(printf 'a\tone\nlonger\ttwo\n' | NO_COLOR=1 core:ui:table)"

    @eq "${aligned}" $'  a       one\n  longer  two'
    @eq "$(NO_COLOR=1 core:ui:section Title)" $'\nTitle'
    @eq "$(NO_COLOR=1 core:ui:row alone)" '  alone'

}
