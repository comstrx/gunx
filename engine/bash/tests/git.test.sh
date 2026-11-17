fixture:core:git:repo () {

    local root="${TMPDIR}/repo"

    mkdir -p "${root}/sub"
    git -C "${root}" init -q -b main
    printf x > "${root}/sub/file"
    printf y > "${root}/ignored"
    printf 'ignored\n' > "${root}/.gitignore"

    @print "${root}"

}
test:core:git:reads-a-tree () {

    local root=""

    root="$(fixture:core:git:repo)"

    @eq "$(core:git:root "${root}/sub")" "$(cd -- "${root}" && pwd -P)"
    @eq "$(core:git:root "${TMPDIR}")" "${TMPDIR}"
    @eq "$(core:git:files "${root}" | tr '\0' ' ')" '.gitignore sub/file '
    @errors 'No commit' core:git:head "${root}"

    git -C "${root}" -c user.name=t -c user.email=t@t add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m one
    [[ "$(core:git:head "${root}")" =~ ^[0-9a-f]{12}$ ]]
    @eq "$(core:git:release "${root}" || true)" ''

    git -C "${root}" tag v1.2.3
    @eq "$(core:git:release "${root}")" v1.2.3

    printf z > "${root}/sub/file"

}
test:core:git:lists-changes () {

    local root=""

    root="$(fixture:core:git:repo)"
    git -C "${root}" -c user.name=t -c user.email=t@t add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m one
    printf z > "${root}/sub/file"

    @eq "$(core:git:changed "${root}" HEAD)" sub/file
    @errors 'Cannot diff' core:git:changed "${root}" nope

}
test:core:git:refuses-to-mirror-blind () {

    local root=""

    root="$(fixture:core:git:repo)"

    @eq "$(core:git:url github.com/x/y)" https://x-access-token@github.com/x/y.git
    @eq "$(core:git:url /srv/y.git)" /srv/y.git
    @errors 'has no author to inherit' core:git:identity "${root}"
    @contains "$(GIT_TOKEN=t cat "$(core:git:askpass)")" 'GIT_TOKEN'
    @eq "$(GIT_TOKEN=secret-token core:git:token)" secret-token
    @eq "$(PATH=/nonexistent GIT_TOKEN='' core:git:token 2>&1 || true)" '[-] GIT_TOKEN is not set and gh is not installed'

}
test:core:git:inherits-the-author () {

    local root=""

    root="$(fixture:core:git:repo)"

    @errors 'No commit in' core:git:author "${root}"
    @errors 'has no author to inherit' core:git:identity "${root}"

    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com add -A
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -q -m one

    @eq "$(core:git:author "${root}")" $'Core Master\tcore@example.com'
    @eq "$(core:git:identity "${root}")" $'Core Master\tcore@example.com'
    @eq "$(GIT_CONFIG_NAME=Bot core:git:identity "${root}")" $'Bot\tcore@example.com'
    @eq "$(GIT_CONFIG_NAME=Bot GIT_CONFIG_EMAIL=bot@example.com core:git:identity "${root}")" $'Bot\tbot@example.com'

}
test:core:git:parses-every-address () {

    local owner=""

    owner="$(config:meta:owner)"

    @eq "$(core:git:address "https://github.com/${owner}/rustx.git")" "github.com/${owner}/rustx"
    @eq "$(core:git:address "https://github.com/${owner}/rustx/")" "github.com/${owner}/rustx"
    @eq "$(core:git:address http://git.example.com:8443/team/tool)" git.example.com:8443/team/tool
    @eq "$(core:git:address "ssh://git@github.com/${owner}/rustx.git")" "github.com/${owner}/rustx"
    @eq "$(core:git:address "git@github.com:${owner}/rustx.git")" "github.com/${owner}/rustx"
    @eq "$(core:git:address "github.com/${owner}/rustx")" "github.com/${owner}/rustx"
    @eq "$(core:git:address /srv/git/rustx.git)" /srv/git/rustx.git
    @errors 'Not a repository address' core:git:address "${owner}"
    @errors 'Not a repository address' core:git:address 'https://github.com/a/b;c'

}
test:core:git:resolves-from-the-origin () {

    local root="" mono="gu" owner=""

    mono+="nx"
    owner="$(config:meta:owner)"

    root="$(fixture:core:git:repo)"

    @errors 'no owner' core:git:resolve rustx "${root}"
    @eq "$(core:git:resolve "${owner}/rustx" "${root}")" "github.com/${owner}/rustx"

    git -C "${root}" remote add origin "git@github.com:${owner}/${mono}.git"

    @eq "$(core:git:resolve rustx "${root}")" "github.com/${owner}/rustx"
    @eq "$(core:git:resolve other/rustx "${root}")" github.com/other/rustx
    @eq "$(core:git:resolve gitlab.com/o/rustx "${root}")" gitlab.com/o/rustx
    @eq "$(core:git:resolve https://gitlab.com/o/rustx.git "${root}")" gitlab.com/o/rustx
    @eq "$(core:git:resolve /srv/rustx.git "${root}")" /srv/rustx.git
    @eq "$(core:git:home "${root}")" "github.com/${owner}/${mono}"

    git -C "${root}" remote set-url origin "https://code.example.com/team/${mono}"
    @eq "$(core:git:resolve rustx "${root}")" code.example.com/team/rustx
    @eq "$(core:git:resolve other/rustx "${root}")" code.example.com/other/rustx
    @eq "$(core:git:host "${root}")" code.example.com
    @eq "$(core:git:owner "${root}")" team
    @eq "$(core:git:trunk "${root}")" "$(git -C "${root}" symbolic-ref --short HEAD)"
    @eq "$(core:git:host "${TMPDIR}/no-repository")" "${GIT_HOST}"
    @eq "$(core:git:trunk "${TMPDIR}/no-repository")" "${GIT_BRANCH}"
    @fails core:git:owner "${TMPDIR}/no-repository"
    @eq "$(core:git:resolve gitlab.com/group/sub/rustx "${root}")" gitlab.com/group/sub/rustx
    @eq "$(core:git:resolve https://dev.azure.com/org/project/_git/rustx "${root}")" dev.azure.com/org/project/_git/rustx

    @errors 'An empty repository address' core:git:resolve '' "${root}"
    @errors 'Not a repository address' core:git:resolve 'a b' "${root}"

}
test:core:git:checks-out-commits-and-pushes () {

    local bare="${TMPDIR}/mirror.git" tree="${TMPDIR}/tree" clone="${TMPDIR}/clone" probe="${TMPDIR}/probe"

    mkdir -p "${tree}"
    printf 'one' > "${tree}/file"

    CONFIG[RUN_RETRIES]=1

    @fails core:git:reachable "${bare}"
    @errors 'git clone failed' core:git:clone "${bare}" main "${clone}"
    core:git:bare "${bare}"
    core:git:reachable "${bare}"
    @eq "$(core:git:clone "${bare}" main "${clone}")" new

    core:fs:tree:replace "${clone}" "${tree}"
    @eq "$(core:git:commit "${clone}" 'Track one' 'Core Master' core@example.com)" changed
    @eq "$(core:git:commit "${clone}" 'Track one' 'Core Master' core@example.com)" same
    core:git:push "${clone}" "${bare}" HEAD:refs/heads/main

    rm -rf -- "${clone}"
    @eq "$(core:git:clone "${bare}" main "${clone}")" existing
    printf 'two' > "${tree}/file"
    core:fs:tree:replace "${clone}" "${tree}"
    @eq "$(core:git:commit "${clone}" 'Track two' 'Core Master' core@example.com)" changed
    core:git:tag "${clone}" v0.1.0
    @errors 'already exists' core:git:tag "${clone}" v0.1.0
    @errors 'Not a tag name' core:git:tag "${clone}" 'bad tag'
    core:git:push "${clone}" "${bare}" HEAD:refs/heads/main
    core:git:push "${clone}" "${bare}" refs/tags/v0.1.0

    git clone -q --branch main "${bare}" "${probe}"
    @eq "$(git -C "${probe}" log --format='%s %an' | tr '\n' ';')" 'Track two Core Master;Track one Core Master;'
    @eq "$(cat "${probe}/file")" two
    @eq "$(git -C "${probe}" tag)" v0.1.0
    @eq "$(core:git:ref "${bare}" refs/tags/v0.1.0)" "$(core:git:sha "${probe}" v0.1.0)"
    @fails core:git:ref "${bare}" refs/tags/v9.9.9
    @errors 'No commit nope' core:git:sha "${probe}" nope
    core:git:clean "${probe}"
    printf 'kept\n' > "${probe}/.lab"
    @fails core:git:clean "${probe}"
    @eq "$(core:git:commit "${probe}" 'Track three' t t@t .lab)" same
    @eq "$(core:git:name "${probe}")" mirror
    @eq "$(core:git:name "${TMPDIR}")" "${TMPDIR##*/}"

    rm -rf -- "${TMPDIR}/empty"
    core:git:init "${TMPDIR}/empty" next
    @eq "$(core:git:branch "${TMPDIR}/empty")" next

    rm -rf -- "${clone}"
    @eq "$(core:git:clone "${bare}" other "${clone}")" new
    @errors 'Not a branch name' core:git:clone "${bare}" '-bad' "${clone}"

}
test:core:git:reads-the-author-and-origin () {

    local root=""

    root="$(fixture:core:git:repo)"

    @fails core:git:is "${TMPDIR}"
    core:git:is "${root}"
    @errors 'No origin remote' core:git:origin "${root}"
    @errors 'No commit' core:git:author "${root}"

    git -C "${root}" remote add origin https://github.com/acme/mono.git
    git -C "${root}" -c user.name='A B' -c user.email=a@b.c add -A
    git -C "${root}" -c user.name='A B' -c user.email=a@b.c commit -q -m one

    @eq "$(core:git:origin "${root}")" https://github.com/acme/mono.git
    @eq "$(core:git:author "${root}")" "$(printf 'A B\ta@b.c')"

}
test:core:git:reads-the-release-before-head () {

    local root="${TMPDIR}/released" into="${TMPDIR}/copy"

    mkdir -p "${root}/part" "${into}"
    git -C "${root}" init -q -b main
    printf 'one\n' > "${root}/part/file"
    git -C "${root}" add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m one
    git -C "${root}" tag v0.1.0
    printf 'two\n' > "${root}/part/file"
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -am two
    git -C "${root}" tag v0.2.0

    @eq "$(core:git:baseline "${root}")" v0.1.0
    @eq "$(core:git:prefix "${root}/part")" part/
    core:git:holds "${root}" v0.1.0 part/
    @fails core:git:holds "${root}" v0.1.0 gone/
    core:git:export "${root}" v0.1.0 part/ "${into}"
    @eq "$(cat "${into}/part/file")" one

}
test:core:git:syncs-what-a-tree-ships () {

    local tree="${TMPDIR}/tree" into="${TMPDIR}/into"

    mkdir -p "${tree}/src" "${tree}/target" "${into}/.git" "${into}/target" "${into}/gone/deep"
    printf 'target/\n*.tmp\n!keep.tmp\n' > "${tree}/.gitignore"
    printf 'one\n' > "${tree}/src/file"
    printf 'built\n' > "${tree}/target/out"
    printf 'theirs\n' > "${into}/target/cache"
    printf 'theirs\n' > "${into}/scratch.tmp"
    printf 'stale\n' > "${into}/keep.tmp"
    printf 'stale\n' > "${into}/gone/deep/file"
    printf 'config\n' > "${into}/.git/config"

    @errors 'Not a repository' core:git:sync "${tree}" "${into}"

    core:git:init "${tree}"
    core:git:sync "${tree}" "${into}"

    @eq "$(cat "${into}/src/file")" one
    @eq "$(cat "${into}/target/cache")" theirs
    @eq "$(cat "${into}/scratch.tmp")" theirs
    @eq "$(cat "${into}/.git/config")" config
    [[ ! -e "${into}/target/out" && ! -e "${into}/gone" && ! -e "${into}/keep.tmp" ]] || @err 'the sync kept what the tree does not ship'

    core:git:ignored "${tree}/target"
    @fails core:git:ignored "${tree}/src"

    rm -rf -- "${tree}/src" "${tree}/.gitignore" "${tree}/target"
    @errors 'Nothing ships from' core:git:sync "${tree}" "${into}"

}
