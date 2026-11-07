fixture:module:extract:git:repo () {

    local root="${TMPDIR}/repo"

    mkdir -p "${root}/sub"
    git -C "${root}" init -q -b main
    printf x > "${root}/sub/file"
    printf y > "${root}/ignored"
    printf 'ignored\n' > "${root}/.gitignore"

    @print "${root}"

}
test:module:extract:git:reads-a-tree () {

    local root=""

    root="$(fixture:module:extract:git:repo)"

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
test:module:extract:git:lists-changes () {

    local root=""

    root="$(fixture:module:extract:git:repo)"
    git -C "${root}" -c user.name=t -c user.email=t@t add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m one
    printf z > "${root}/sub/file"

    @eq "$(core:git:changed "${root}" HEAD)" sub/file
    @errors 'Cannot diff' core:git:changed "${root}" nope

}
test:module:extract:git:refuses-to-mirror-blind () {

    local root=""

    root="$(fixture:module:extract:git:repo)"

    @eq "$(module:extract:git:remote github.com/x/y)" https://x-access-token@github.com/x/y.git
    @eq "$(module:extract:git:remote /srv/y.git)" /srv/y.git
    @errors 'has no author to inherit' module:extract:git:identity "${root}"
    @contains "$(GIT_TOKEN=t cat "$(module:extract:git:askpass)")" 'GIT_TOKEN'
    @eq "$(GIT_TOKEN=secret-token module:extract:git:token)" secret-token
    @eq "$(PATH=/nonexistent GIT_TOKEN='' module:extract:git:token 2>&1 || true)" '[-] GIT_TOKEN is not set and gh is not installed'

}
test:module:extract:git:inherits-the-author () {

    local root=""

    root="$(fixture:module:extract:git:repo)"

    @errors 'No commit in' core:git:author "${root}"
    @errors 'has no author to inherit' module:extract:git:identity "${root}"

    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com add -A
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -q -m one

    @eq "$(core:git:author "${root}")" $'Core Master\tcore@example.com'
    @eq "$(module:extract:git:identity "${root}")" $'Core Master\tcore@example.com'
    @eq "$(GIT_CONFIG_NAME=Bot module:extract:git:identity "${root}")" $'Bot\tcore@example.com'
    @eq "$(GIT_CONFIG_NAME=Bot GIT_CONFIG_EMAIL=bot@example.com module:extract:git:identity "${root}")" $'Bot\tbot@example.com'

}
test:module:extract:git:parses-every-address () {

    local owner=""

    owner="$(config:meta:owner)"

    @eq "$(module:extract:git:parse "https://github.com/${owner}/rustx.git")" "github.com/${owner}/rustx"
    @eq "$(module:extract:git:parse "https://github.com/${owner}/rustx/")" "github.com/${owner}/rustx"
    @eq "$(module:extract:git:parse http://git.example.com:8443/team/tool)" git.example.com:8443/team/tool
    @eq "$(module:extract:git:parse "ssh://git@github.com/${owner}/rustx.git")" "github.com/${owner}/rustx"
    @eq "$(module:extract:git:parse "git@github.com:${owner}/rustx.git")" "github.com/${owner}/rustx"
    @eq "$(module:extract:git:parse "github.com/${owner}/rustx")" "github.com/${owner}/rustx"
    @eq "$(module:extract:git:parse /srv/git/rustx.git)" /srv/git/rustx.git
    @errors 'Not a repository address' module:extract:git:parse "${owner}"
    @errors 'Not a repository address' module:extract:git:parse 'https://github.com/a/b;c'

}
test:module:extract:git:resolves-from-the-origin () {

    local root="" mono="gu" owner=""

    mono+="nx"
    owner="$(config:meta:owner)"

    root="$(fixture:module:extract:git:repo)"

    @errors 'no owner' module:extract:git:resolve rustx "${root}"
    @eq "$(module:extract:git:resolve "${owner}/rustx" "${root}")" "github.com/${owner}/rustx"

    git -C "${root}" remote add origin "git@github.com:${owner}/${mono}.git"

    @eq "$(module:extract:git:resolve rustx "${root}")" "github.com/${owner}/rustx"
    @eq "$(module:extract:git:resolve other/rustx "${root}")" github.com/other/rustx
    @eq "$(module:extract:git:resolve gitlab.com/o/rustx "${root}")" gitlab.com/o/rustx
    @eq "$(module:extract:git:resolve https://gitlab.com/o/rustx.git "${root}")" gitlab.com/o/rustx
    @eq "$(module:extract:git:resolve /srv/rustx.git "${root}")" /srv/rustx.git
    @eq "$(module:extract:git:origin "${root}")" "github.com/${owner}/${mono}"

    git -C "${root}" remote set-url origin "https://code.example.com/team/${mono}"
    @eq "$(module:extract:git:resolve rustx "${root}")" code.example.com/team/rustx

    @errors 'An empty repository address' module:extract:git:resolve '' "${root}"
    @errors 'Not a repository address' module:extract:git:resolve 'a b' "${root}"

}
test:module:extract:git:checks-out-commits-and-pushes () {

    local bare="${TMPDIR}/mirror.git" tree="${TMPDIR}/tree" clone="${TMPDIR}/clone" probe="${TMPDIR}/probe"

    mkdir -p "${tree}"
    printf 'one' > "${tree}/file"

    CONFIG[RUN_RETRIES]=1

    @fails module:extract:git:exists "${bare}"
    @eq "$(module:extract:git:checkout "${bare}" main "${clone}")" new
    module:extract:git:exists "${bare}"

    core:fs:tree:replace "${clone}" "${tree}"
    @eq "$(module:extract:git:commit "${clone}" 'Track one' 'Core Master' core@example.com)" changed
    @eq "$(module:extract:git:commit "${clone}" 'Track one' 'Core Master' core@example.com)" same
    module:extract:git:push "${clone}" "${bare}" HEAD:refs/heads/main

    rm -rf -- "${clone}"
    @eq "$(module:extract:git:checkout "${bare}" main "${clone}")" existing
    printf 'two' > "${tree}/file"
    core:fs:tree:replace "${clone}" "${tree}"
    @eq "$(module:extract:git:commit "${clone}" 'Track two' 'Core Master' core@example.com)" changed
    module:extract:git:tag "${clone}" v0.1.0
    @errors 'already exists' module:extract:git:tag "${clone}" v0.1.0
    @errors 'Not a release tag' module:extract:git:tag "${clone}" latest
    module:extract:git:push "${clone}" "${bare}" HEAD:refs/heads/main
    module:extract:git:push "${clone}" "${bare}" refs/tags/v0.1.0

    git clone -q --branch main "${bare}" "${probe}"
    @eq "$(git -C "${probe}" log --format='%s %an' | tr '\n' ';')" 'Track two Core Master;Track one Core Master;'
    @eq "$(cat "${probe}/file")" two
    @eq "$(git -C "${probe}" tag)" v0.1.0

    rm -rf -- "${clone}"
    @eq "$(module:extract:git:checkout "${bare}" other "${clone}")" new
    @errors 'Not a branch name' module:extract:git:checkout "${bare}" '-bad' "${clone}"

}
test:core:git:reads-the-author-and-origin () {

    local root=""

    root="$(fixture:module:extract:git:repo)"

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
