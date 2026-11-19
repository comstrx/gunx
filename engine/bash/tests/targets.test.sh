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

    MANIFEST=( [deps.threex.repo]=o/threex )
    config:targets:load
    @eq "$(config:targets:list)" threex

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
test:config:targets:writes-a-row () {

    TARGETS=()

    config:targets:set onex type engine
    config:targets:set onex path engine/one

    @eq "$(config:targets:list)" onex
    @eq "$(config:targets:get onex path)" engine/one
    config:targets:has onex
    @fails config:targets:has twox

    @errors 'must name a path inside the root' config:targets:set onex path ../out
    @errors 'not a target name' config:targets:set 'one.x' type engine
    @errors 'not a target name' config:targets:set '../x' type engine
    @errors 'not a target name' config:targets:set '' type engine
    @errors 'not a key' config:targets:set onex 'one.x' engine
    @errors 'holds a control character' config:targets:set onex logo $'https://x\ny'

    config:targets:fill onex engines one two
    @eq "$(config:targets:engines onex | tr '\n' ' ')" 'one two '

    config:targets:fill onex engines three
    @eq "$(config:targets:engines onex | tr '\n' ' ')" 'three '

    config:targets:link onex engine o/basex side o/sidex
    @eq "$(config:targets:deps onex | cut -f1,2 | tr '\t\n' '= ')" 'engine=o/basex side=o/sidex '

    config:targets:link onex
    @eq "$(config:targets:deps onex)" ''
    @errors 'a name and a repository for every dependency' config:targets:link onex engine

}
test:config:targets:an-owner-names-the-repository () {

    TOOL_ROOT="${TMPDIR}"

    TARGETS=(
        [onex]=1 [onex.owner]=acme
        [twox]=1 [twox.name]=chosen [twox.owner]=acme/
        [threex]=1 [threex.repo]=/srv/three.git/ [threex.owner]=acme
        [fourx]=1
    )

    config:targets:settle

    @contains "$(config:targets:get onex repo)" '/acme/onex'
    @contains "$(config:targets:get twox repo)" '/acme/chosen'
    @eq "$(config:targets:get threex repo)" /srv/three.git
    @errors 'Target fourx has no repo' config:targets:get fourx repo

}
test:config:targets:refuses-a-name-that-is-not-one () {

    MANIFEST=( ['deps.bad name.type']=engine )
    @errors 'not a target name' config:targets:load

    MANIFEST=( ['deps..type']=engine )
    @errors 'not a target name' config:targets:load

    MANIFEST=( [deps.]=1 [deps.okx.path]=engine/ok )
    config:targets:load
    @eq "$(config:targets:list)" okx

}
test:config:targets:a-dependency-row-always-reads-as-three-fields () {

    local line="" tabs=""

    TARGETS=( [onex]=1 [onex.deps]=3 [onex.deps.0.repo]=o/basex.git [onex.deps.1.name]=side [onex.deps.2.tag]=1.0.0 )

    @eq "$(config:targets:deps onex | tr '\t\n' '= ')" 'basex=o/basex.git= side=-= -=-=1.0.0 '

    while IFS= read -r line; do

        tabs="${line//[!$'\t']/}"
        @eq "${#tabs}" 2

    done < <(config:targets:deps onex)

    TARGETS=( [onex]=1 [onex.deps]=many )
    @eq "$(config:targets:deps onex)" ''

}
test:config:targets:refuses-words-that-would-break-the-table () {

    TARGETS=()

    @errors 'an empty or spaced word' config:targets:fill onex engines one 'two three'
    @errors 'an empty or spaced word' config:targets:fill onex engines ''
    @errors 'each one word' config:targets:link onex engine 'o/base x'
    @errors 'each one word' config:targets:link onex $'eng\tine' o/basex
    @errors 'each one word' config:targets:link onex engine ''

    @eq "${#TARGETS[@]}" 0

}
test:config:targets:settles-every-form-to-one-and-stays-there () {

    local first=""

    TOOL_ROOT="${TMPDIR}"

    TARGETS=(
        [onex]=1 [onex.repo]=acme/basex.git
        [twox]=1 [twox.repo]=https://github.com/acme/basex/
        [threex]=1 [threex.repo]=git@github.com:acme/basex.git
        [fourx]=1 [fourx.repo]='not an address'
        [fivex]=1 [fivex.deps]=1 [fivex.deps.0.repo]=github.com/acme/basex
    )

    config:targets:settle
    first="${TARGETS[twox.repo]}"

    @eq "${first}" https://github.com/acme/basex
    @eq "${TARGETS[threex.repo]}" "${first}"
    @eq "${TARGETS[fivex.deps.0.repo]}" "${first}"
    @contains "${TARGETS[onex.repo]}" '/acme/basex'
    @absent "${TARGETS[onex.repo]}" '.git'
    @eq "${TARGETS[fourx.repo]}" 'not an address'

    config:targets:settle

    @eq "${TARGETS[twox.repo]} ${TARGETS[threex.repo]} ${TARGETS[fourx.repo]}" "${first} ${first} not an address"

}
