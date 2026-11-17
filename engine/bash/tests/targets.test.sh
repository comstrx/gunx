fixture:config:targets:table () {

    TARGETS=(
        [demox]=3 [demox.type]=engine [demox.path]=engine/demo [demox.repo]=github.com/x/demox
        [skillx]=4 [skillx.type]=tutor [skillx.path]=tutor [skillx.repo]=github.com/x/skillx [skillx.tag]=1.2.3
    )

}
test:config:targets:loads-the-table-of-the-manifest () {

    MANIFEST=( [deps.twox]=2 [deps.twox.type]=engine [deps.twox.path]=engine/two [tools.x]=1 )
    config:targets:load
    @eq "$(config:targets:list)" twox
    @eq "$(config:targets:get twox path)" engine/two

    MANIFEST=( [deps.onex]=2 [deps.onex.type]=engine [deps.onex.path]=../outside )
    @errors 'must name a path inside the root' config:targets:load

}
test:config:targets:reads-the-table () {

    fixture:config:targets:table

    @eq "$(config:targets:list | tr '\n' ' ')" 'demox skillx '
    @eq "$(config:targets:get demox path)" engine/demo
    @eq "$(config:targets:get skillx type)" tutor
    @eq "$(config:targets:get demox tag)" ''
    @eq "$(TOOL_ROOT="${TMPDIR}/none" config:targets:get demox branch)" "${GIT_BRANCH}"
    @eq "$(config:targets:get skillx tag)" 1.2.3
    @eq "$(config:targets:get demox title)" DemoX
    @eq "$(config:targets:title mobilex)" MobileX
    @eq "$(config:targets:title tutor)" Tutor
    @errors 'Unknown target: nope' config:targets:get nope path
    @errors 'has no shade' config:targets:get demox shade

}
test:config:targets:lists-the-engines-of-a-product () {

    TARGETS=( [demo]=4 [demo.type]=product [demo.path]=product/demo [demo.repo]=o/demo [demo.engines]=2 [demo.engines.0]=bun [demo.engines.1]=python )

    @eq "$(config:targets:engines demo | tr '\n' ' ')" 'bun python '
    @eq "$(config:targets:engines nothing)" ''

}
test:config:targets:lists-dependencies () {

    TARGETS=( [apix]=4 [apix.type]=fragment [apix.path]=product/demo/api [apix.repo]=o/apix [apix.deps]=2
              [apix.deps.0.name]=engine [apix.deps.0.repo]=o/pyx [apix.deps.1.name]=x [apix.deps.1.repo]=o/x [apix.deps.1.tag]=1.0.0 )

    @eq "$(config:targets:deps apix | tr '\t' ' ' | tr '\n' ';')" 'engine o/pyx ;x o/x 1.0.0;'
    @eq "$(config:targets:deps nothing)" ''

}
test:config:targets:refuses-an-empty-name () {

    fixture:config:targets:table

    @errors 'Unknown target: ; see targets' config:targets:get '' path

}
