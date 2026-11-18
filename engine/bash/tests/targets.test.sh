fixture:config:targets:table () {

    TARGETS=(
        [demox]=3 [demox.type]=engine [demox.path]=engine/demo [demox.repo]=github.com/x/demox
        [notesx]=4 [notesx.type]=tutor [notesx.path]=tutor [notesx.repo]=github.com/x/notesx [notesx.tag]=1.2.3
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
test:config:targets:loads-a-row-written-as-its-own-section () {

    MANIFEST=(
        [deps.twox.type]=engine [deps.twox.path]=engine/two
        [deps.threex.type]=fragment [deps.threex.path]=product/demo/api [deps.threex.deps]=1
        [deps.threex.deps.0]=2 [deps.threex.deps.0.name]=engine [deps.threex.deps.0.type]=odd
    )

    config:targets:load

    @eq "$(config:targets:list | tr '\n' ' ')" 'threex twox '
    @eq "$(config:targets:get threex path)" product/demo/api
    @eq "$(config:targets:deps threex | cut -f1)" engine

}
test:config:targets:reads-the-table () {

    fixture:config:targets:table

    @eq "$(config:targets:list | tr '\n' ' ')" 'demox notesx '
    @eq "$(config:targets:get demox path)" engine/demo
    @eq "$(config:targets:get notesx type)" tutor
    @eq "$(config:targets:get demox tag)" ''
    @eq "$(TOOL_ROOT="${TMPDIR}/none" config:targets:get demox branch)" "${GIT_BRANCH}"
    @eq "$(config:targets:get notesx tag)" 1.2.3
    @errors 'Unknown target: nope' config:targets:get nope path
    @errors 'has no shade' config:targets:get demox shade

}
test:config:targets:lists-the-engines-of-a-product () {

    TARGETS=( [demo]=4 [demo.type]=product [demo.path]=product/demo [demo.repo]=o/demo [demo.engines]=2 [demo.engines.0]=bun [demo.engines.1]=python )

    @eq "$(config:targets:engines demo | tr '\n' ' ')" 'bun python '
    @eq "$(config:targets:engines nothing)" ''

}
test:config:targets:lists-dependencies () {

    TARGETS=( [partx]=4 [partx.type]=fragment [partx.path]=product/demo/api [partx.repo]=o/partx [partx.deps]=2
              [partx.deps.0.name]=engine [partx.deps.0.repo]=o/basex [partx.deps.1.name]=x [partx.deps.1.repo]=o/x [partx.deps.1.tag]=1.0.0 )

    @eq "$(config:targets:deps partx | tr '\t' ' ' | tr '\n' ';')" 'engine o/basex ;x o/x 1.0.0;'
    @eq "$(config:targets:deps nothing)" ''

}
test:config:targets:refuses-an-empty-name () {

    fixture:config:targets:table

    @errors 'Unknown target: ; see targets' config:targets:get '' path

}
