fixture:config:targets:table () {

    TARGETS=(
        [demox]=3 [demox.type]=engine [demox.path]=engine/demo [demox.repo]=github.com/x/demox
        [skillx]=4 [skillx.type]=tutor [skillx.path]=tutor [skillx.repo]=github.com/x/skillx [skillx.tag]=1.2.3
    )

}
test:config:targets:loads-the-root-table-first () {

    local root="${TMPDIR}/project"

    mkdir -p "${root}"
    printf '[meta]\nname = "demo"\nversion = "0.1.0"\n\n[deps]\nonex = { type = "engine", path = "engine/one" }\n' > "${root}/infra.toml"

    TOOL_ROOT="${root}" config:targets:load
    @eq "$(config:targets:list)" onex

    rm -f -- "${root}/infra.toml"
    MANIFEST=( [deps.twox]=1 [deps.twox.type]=engine )
    TOOL_ROOT="${root}" config:targets:load
    @eq "$(config:targets:list)" twox

}
test:config:targets:reads-the-table () {

    fixture:config:targets:table

    @eq "$(config:targets:list | tr '\n' ' ')" 'demox skillx '
    @eq "$(config:targets:get demox path)" engine/demo
    @eq "$(config:targets:get skillx type)" tutor
    @eq "$(config:targets:get demox tag)" inherit
    @eq "$(config:targets:get skillx tag)" 1.2.3
    @eq "$(config:targets:get demox title)" DemoX
    @eq "$(config:targets:title mobilex)" MobileX
    @eq "$(config:targets:title tutor)" Tutor
    @errors 'Unknown target: nope' config:targets:get nope path
    @errors 'has no shade' config:targets:get demox shade

}
test:config:targets:reads-a-product () {

    local root="${TMPDIR}/repo"

    mkdir -p "${root}/product/demo/infra"
    printf '[meta]\nname = "demo"\nversion = "0.1.0"\nrepo = "github.com/x/demo"\n' > "${root}/product/demo/infra/infra.toml"

    @eq "$(config:targets:product "${root}" demo)" github.com/x/demo
    printf '[meta]\nname = "demo"\nversion = "0.1.0"\n' > "${root}/product/demo/infra/infra.toml"
    @errors 'has no [meta] repo' config:targets:product "${root}" demo
    @errors 'No infra.toml' config:targets:product "${root}" other

}
test:config:targets:lists-dependencies () {

    TARGETS=( [apix]=4 [apix.type]=fragment [apix.path]=product/demo/api [apix.repo]=o/apix [apix.deps]=2
              [apix.deps.0.name]=engine [apix.deps.0.repo]=o/pyx [apix.deps.1.name]=x [apix.deps.1.repo]=o/x [apix.deps.1.tag]=1.0.0 )

    @eq "$(config:targets:deps apix | tr '\t' ' ' | tr '\n' ';')" 'engine o/pyx inherit;x o/x 1.0.0;'
    @eq "$(config:targets:deps nothing)" ''

}
