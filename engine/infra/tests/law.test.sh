fixture:module:bundle:law:tree () {

    local root="${TMPDIR}/tree"

    mkdir -p "${root}/src/core" "${root}/src/app" "${root}/tests"

    printf 'core:log:say () {\n\n    out "%s"\n\n}\n' "\${1}" > "${root}/src/core/log.sh"
    printf 'app:hello:world () {\n\n    core:log:say hi\n\n}\n' > "${root}/src/app/hello.sh"
    printf 'app:main () {\n\n    app:hello:world\n\n}\n' > "${root}/src/app/index.sh"
    printf 'test:core:log:says () {\n\n    core:log:say hi\n\n}\n' > "${root}/tests/log.test.sh"
    printf 'test:app:hello:world () {\n\n    app:hello:world\n\n}\ntest:app:ui:main () {\n\n    app:main\n\n}\n' > "${root}/tests/app.test.sh"
    printf 'notes () {\n\n    out ignored\n\n}\n' > "${root}/tests/helper.sh"

    @print "${root}"

}
test:module:bundle:law:names-the-layers () {

    @eq "$(module:bundle:law:layer src/core/fs.sh)" core
    @eq "$(module:bundle:law:layer src/app/ui.sh)" app
    @eq "$(module:bundle:law:layer src/module/gate/src/yaml.sh)" module
    @eq "$(module:bundle:law:layer tests/fs.test.sh)" test
    @fails module:bundle:law:layer tests/helper.sh
    @fails module:bundle:law:layer src/other/x.sh
    @eq "$(module:bundle:law:prefix src/core/fs.sh)" core:fs
    @eq "$(module:bundle:law:prefix src/app/ui.sh)" app:ui
    @eq "$(module:bundle:law:prefix src/app/index.sh)" app
    @eq "$(module:bundle:law:prefix src/module/gate/src/yaml.sh)" module:gate
    @eq "$(module:bundle:law:prefix src/module/gate/index.sh)" ''
    @errors 'a module keeps its code under src/' module:bundle:law:prefix src/module/gate/yaml.sh
    @errors "a module's src is flat" module:bundle:law:prefix src/module/gate/src/deep/x.sh
    @eq "$(module:bundle:law:prefix tests/ui.test.sh)" test
    @eq "$(module:bundle:law:prefix benches/parse.bench.sh)" bench
    @eq "$(module:bundle:law:prefix src/core/index.sh)" ''
    @errors 'app is flat' module:bundle:law:prefix src/app/ui/deep.sh
    @errors 'core is flat' module:bundle:law:prefix src/core/fs/index.sh
    @eq "$(module:bundle:law:rank app)" 3

}
test:module:bundle:law:accepts-a-lawful-tree () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"
    module:bundle:law:check "${root}"

}
test:module:bundle:law:refuses-a-wrong-name () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"

    printf 'core:talk:speak () {\n\n    out hi\n\n}\n' > "${root}/src/core/log.sh"
    @errors 'core:talk:speak must be named core:log:<verb>' module:bundle:law:check "${root}"

    printf 'speak () {\n\n    out hi\n\n}\n' > "${root}/src/core/log.sh"
    @errors 'speak must be named core:log:<verb>' module:bundle:law:check "${root}"

    printf 'err () {\n\n    out hi\n\n}\n' > "${root}/src/core/log.sh"
    @errors 'err must be named core:log:<verb>' module:bundle:law:check "${root}"

    printf 'core:x () {\n\n    out hi\n\n}\n' > "${root}/src/core/index.sh"
    @errors 'a facade holds no function' module:bundle:law:check "${root}"

}
test:module:bundle:law:refuses-an-upward-call () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"

    printf 'core:log:say () {\n\n    app:hello:world\n\n}\n' > "${root}/src/core/log.sh"
    @errors 'core cannot call app:hello:world of app' module:bundle:law:check "${root}"

    printf 'core:log:say () {\n\n    core:log:shout\n\n}\n' > "${root}/src/core/log.sh"
    @errors 'core:log:shout is not defined anywhere' module:bundle:law:check "${root}"

    printf 'core:log:say () {\n\n    "core:log:%s"\n\n}\n' "\${1}" > "${root}/src/core/log.sh"
    module:bundle:law:check "${root}"

}
test:module:bundle:law:refuses-comments-and-eval () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"

    printf 'core:log:say () {\n\n    # explain\n    eval "%s"\n\n}\n' "\${1}" > "${root}/src/core/log.sh"
    @errors 'a comment' module:bundle:law:check "${root}"
    @errors 'eval is refused' module:bundle:law:check "${root}"

}
test:module:bundle:law:refuses-a-double-definition () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"

    printf 'app:again:world () {\n\n    out again\n\n}\napp:hello:world () {\n\n    out again\n\n}\n' > "${root}/src/app/again.sh"
    printf 'test:app:again:world () {\n\n    out again\n\n}\n' > "${root}/tests/again.test.sh"
    @errors 'already defined' module:bundle:law:check "${root}"

}
test:module:bundle:law:demands-a-test-per-domain () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"

    printf 'test:app:ui:main () {\n\n    app:main\n\n}\n' > "${root}/tests/app.test.sh"
    @errors 'no test:app:hello:* case and no #cfg[test] function' module:bundle:law:check "${root}"

    printf '#cfg[test]\napp:hello:world:proves () {\n\n    app:hello:world\n\n}\n' >> "${root}/src/app/hello.sh"
    module:bundle:law:check "${root}"

    printf '#cfg[test]\n\n' >> "${root}/src/app/hello.sh"
    @errors 'must sit right above a function' module:bundle:law:check "${root}"

    printf 'badly:named () {\n\n    out x\n\n}\n' > "${root}/tests/bad.test.sh"
    @errors 'badly:named must be named test:<verb>' module:bundle:law:check "${root}"

}
test:module:bundle:law:reads-cfg-attributes () {

    local file="${TMPDIR}/cfg.sh"

    printf 'core:x:a () {\n\n    :\n\n}\n#cfg[test]\ncore:x:b () {\n\n    :\n\n}\n#cfg[bench]\ncore:x:c () {\n\n    :\n\n}\n' > "${file}"

    @eq "$(module:bundle:cfg test "${file}")" core:x:b
    @eq "$(module:bundle:cfg bench "${file}")" core:x:c
    @eq "$(module:bundle:cfg fuzz "${file}")" ''

}
test:module:bundle:law:keeps-macros-in-their-file () {

    local root=""

    fixture:module:bundle:law:tree
    root="${TMPDIR}/tree"

    mkdir -p "${root}/src/module/bundle/src" "${root}/src/module/gate/src"
    printf '@say () {\n\n    core:log:say "$@"\n\n}\n' > "${root}/src/module/bundle/src/macro.sh"
    printf 'module:gate:hi () {\n\n    @say hi\n\n}\n' > "${root}/src/module/gate/src/hi.sh"
    printf 'test:module:gate:hi () {\n\n    @say hi\n\n}\ntest:module:bundle:macro () {\n\n    @say hi\n\n}\n' > "${root}/tests/ci.test.sh"
    module:bundle:law:check "${root}"

    printf '@loud () {\n\n    out "$@"\n\n}\n' > "${root}/src/module/gate/src/loud.sh"
    @errors 'a macro lives in module/bundle/src/macro.sh only' module:bundle:law:check "${root}"
    rm -f -- "${root}/src/module/gate/src/loud.sh"

    printf 'module:bundle:x () {\n\n    @say hi\n\n}\n' > "${root}/src/module/bundle/src/x.sh"
    @errors 'the bundle module never calls a macro' module:bundle:law:check "${root}"
    rm -f -- "${root}/src/module/bundle/src/x.sh"

    printf 'core:log:say () {\n\n    @say "$@"\n\n}\n' > "${root}/src/core/log.sh"
    @errors 'core cannot call the macro @say' module:bundle:law:check "${root}"
    printf 'core:log:say () {\n\n    out "%s"\n\n}\n' "\${1}" > "${root}/src/core/log.sh"

    printf 'module:gate:no () {\n\n    @nope hi\n\n}\n' > "${root}/src/module/gate/src/no.sh"
    @errors '@nope is not a macro' module:bundle:law:check "${root}"

    printf 'module:bundle:say () {\n\n    out "$@"\n\n}\n' > "${root}/src/module/bundle/src/macro.sh"
    @errors 'is not a macro name (@verb)' module:bundle:law:check "${root}"

}
