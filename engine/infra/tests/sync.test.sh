test:module:extract:keep-selects-the-tree () {

    module:extract:keep engine engine/rust engine/rust/Cargo.toml
    @fails module:extract:keep engine engine/rust engine/go/go.work
    module:extract:keep fragment product/demo/web product/demo/web/package.json
    @fails module:extract:keep fragment product/demo/web product/demo/api/pyproject.toml
    module:extract:keep tutor tutor tutor/index.md
    @fails module:extract:keep tutor tutor tutor/stack/product/demo/index.md
    module:extract:keep product product/demo engine/rust/Cargo.toml
    module:extract:keep product product/demo product/demo/api/pyproject.toml
    module:extract:keep product product/demo tutor/stack/product/demo/index.md
    @fails module:extract:keep product product/demo product/other/api/pyproject.toml
    @fails module:extract:keep product product/demo tutor/stack/product/other/index.md

}
test:module:extract:governance-selects-the-root-files () {

    module:extract:governance .gitignore
    module:extract:governance LICENSE
    module:extract:governance SECURITY.md
    @fails module:extract:governance README.md
    @fails module:extract:governance AGENTS.md
    @fails module:extract:governance CHANGELOG.md
    @fails module:extract:governance .github/labels.yml
    @fails module:extract:governance engine/rust/Cargo.toml

}
test:module:extract:names-the-pieces () {

    fixture:config:targets:table

    @eq "$(module:extract:block engine engine/rust)" rust
    @eq "$(module:extract:block tutor tutor)" tutor
    @eq "$(module:extract:block fragment product/demo/web)" demo-web
    @eq "$(module:extract:kind product/demo)" product
    @eq "$(module:extract:kind demox)" engine
    @eq "$(module:extract:part product/demo)" product/demo
    @eq "$(module:extract:title product/demo)" demo
    @eq "$(module:extract:title demox)" DemoX

}
test:module:extract:changelog-cuts-one-block () {

    local root="${TMPDIR}/repo" tree="${TMPDIR}/tree"

    mkdir -p "${root}" "${tree}"
    printf '# Changelog\n\nIntro.\n\n## Unreleased\n\n### rust\n\n- one\n- two\n\n### bun\n\n- three\n\n## v0.1.0\n\n### rust\n\n- old\n' > "${root}/CHANGELOG.md"

    module:extract:changelog "${root}" "${tree}" rust

    @contains "$(cat "${tree}/CHANGELOG.md")" '- one'
    @contains "$(cat "${tree}/CHANGELOG.md")" '- old'
    @absent "$(cat "${tree}/CHANGELOG.md")" '- three'
    @absent "$(cat "${tree}/CHANGELOG.md")" 'Intro'

}
test:module:extract:verify-refuses-what-must-not-leave () {

    local tree="${TMPDIR}/tool" word=""

    fixture:module:extract:root
    word=mono
    mkdir -p "${tree}"
    printf '[package]\nname = "x"\n' > "${tree}/Cargo.toml"
    module:extract:verify "${tree}" engine

    printf 'the %s word\n' "${word}" > "${tree}/note.txt"
    @errors 'a monorepo or product name' module:extract:verify "${tree}" engine

    printf 'path = "%s/engine/rust"\n' '../..' > "${tree}/note.txt"
    @errors 'a path out of the tree' module:extract:verify "${tree}" engine

    rm -f -- "${tree}/note.txt"
    printf 'SECRET=1\n' > "${tree}/.env.local"
    @errors 'an env file in the tree' module:extract:verify "${tree}" engine

    rm -f -- "${tree}/.env.local" "${tree}/Cargo.toml"
    @errors 'no manifest' module:extract:verify "${tree}" engine

}
test:module:extract:docs-rename-the-tool () {

    local tree="${TMPDIR}/docs" owner=""

    owner="$(config:meta:owner)"
    mkdir -p "${tree}"
    printf 'Welcome to MonoX and MONOX at %s/monox\n' "${owner}" > "${tree}/SUPPORT.md"
    printf 'monox stays\n' > "${tree}/README.md"

    module:extract:docs "${tree}" rustx RustX monox

    @eq "$(cat "${tree}/SUPPORT.md")" "Welcome to RustX and RustX at ${owner}/rustx"
    @eq "$(cat "${tree}/README.md")" 'monox stays'
    @errors 'Not a source name' module:extract:docs "${tree}" rustx RustX 'a b'

}
test:module:extract:source-is-the-origin () {

    fixture:module:extract:root

    @eq "$(module:extract:source)" mono

    git -C "${TMPDIR}/source" remote remove origin
    @eq "$(module:extract:source)" source

}
test:module:extract:commands-guard-their-usage () {

    fixture:config:targets:table

    @errors 'extract NAME' bash "${TOOL_BIN}" extract
    @errors 'place NAME DIR' bash "${TOOL_BIN}" place demox
    @errors 'push NAME' bash "${TOOL_BIN}" push
    @errors 'Unknown target: nope' bash "${TOOL_BIN}" extract nope
    @errors 'Part does not exist yet: engine/demo' module:extract:extract demox
    @eq "$(module:extract:session product/demo)" "${TOOL_TEMP}/sync/product-demo"

    CLI_VALUED=( [--timeout]=true )
    CLI_FLAGS=( [--timeout]=x )
    @errors '--timeout must be a positive number' module:extract:timeout
    CLI_FLAGS=()
    @eq "$(module:extract:timeout)" 1800

    @contains "$(module:extract:targets 2>/dev/null)" 'engine  engine/demo  github.com/x/demox  (inherit)  missing'
    @errors 'Targets without a part under' module:extract:targets
    @errors 'Targets without a part under' module:extract:all
    TARGETS=()
    @errors 'No distribution table' module:extract:ready

}
fixture:module:extract:root () {

    local root="${TMPDIR}/source"

    mkdir -p "${root}/engine/demo/src" "${root}/product/other"
    git -C "${root}" init -q -b main
    git -C "${root}" remote add origin https://github.com/acme/mono.git

    printf 'target/\n.env\n' > "${root}/.gitignore"
    printf 'MIT\n' > "${root}/LICENSE"
    printf '# Support\n\nAsk at %s/mono.\n' "$(config:meta:owner)" > "${root}/SUPPORT.md"
    printf '# Changelog\n\n## Unreleased\n\n### demo\n\n- opened\n\n### bun\n\n- other\n' > "${root}/CHANGELOG.md"
    printf '[package]\nname = "demo"\n' > "${root}/engine/demo/Cargo.toml"
    printf 'fn main() {}\n' > "${root}/engine/demo/src/main.rs"
    printf 'secret\n' > "${root}/engine/demo/.env"
    printf 'x\n' > "${root}/product/other/README.md"

    mkdir -p "${root}/.github/workflows" "${root}/.github/ISSUE_TEMPLATE" "${TMPDIR}/infrax.git"
    git init -q --bare -b main "${TMPDIR}/infrax.git"
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q --allow-empty -m seed
    git -C "${root}" push -q "${TMPDIR}/infrax.git" HEAD:refs/heads/main

    printf '* @acme\n' > "${root}/.github/CODEOWNERS"
    printf 'blank_issues_enabled: false\ncontact_links:\n  - name: Questions\n    url: https://github.com/acme/mono/discussions\n' > "${root}/.github/ISSUE_TEMPLATE/config.yml"
    printf -- '- name: demo\n  color: 1\n  description: The demo engine (engine/demo)\n\n- name: ci\n  color: 2\n  description: Workflows\n' > "${root}/.github/labels.yml"
    printf "demo:\n  - changed-files:\n      - any-glob-to-any-file: ['engine/demo/**']\n\nci:\n  - changed-files:\n      - any-glob-to-any-file: ['.github/**']\n" > "${root}/.github/labeler.yml"
    printf '# monorepo note\nversion: 2\n\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n  - package-ecosystem: cargo\n    directory: /engine/demo\n  - package-ecosystem: uv\n    directory: /product/other/api\n' > "${root}/.github/dependabot.yml"
    printf "name: demo\n\non:\n  push:\n    branches: [main]\n    paths: ['engine/demo/**']\n  workflow_call:\n\njobs:\n  gate:\n    steps:\n      - uses: actions/checkout@abc # v7\n      - uses: \$/engine/infra/src/module/gate/template\n      - run: infra gate --part demo\n" > "${root}/.github/workflows/demo.yml"
    printf 'name: python\n\non:\n  workflow_call:\n\njobs:\n  gate:\n    steps:\n      - run: infra gate python\n' > "${root}/.github/workflows/python.yml"
    printf 'name: global\n\non:\n  push:\n    branches: [main]\n\njobs:\n  format:\n    steps:\n      - uses: oven-sh/setup-bun@def # v2\n        with:\n          bun-version-file: engine/bun/package.json\n      - uses: $/engine/infra/src/module/gate/template\n      - run: infra gate global\n' > "${root}/.github/workflows/global.yml"
    printf 'name: release\n\non:\n  push:\n    tags: [v*]\n\njobs:\n  demo:\n    uses: $/.github/workflows/demo.yml\n  python:\n    uses: $/.github/workflows/python.yml\n  global:\n    uses: $/.github/workflows/global.yml\n  sync:\n    needs: [demo, python, global]\n    steps:\n      - uses: $/engine/infra/src/module/gate/template\n      - run: infra sync --moment tag\n' > "${root}/.github/workflows/release.yml"
    printf 'rules:\n  forbidden-uses:\n    config:\n      allow:\n        - actions/checkout\n' > "${root}/.zizmor.yml"
    printf 'singleQuote: true\n' > "${root}/.prettierrc.yml"

    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com add -A
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -q -m 'Start up'

    TARGETS=(
        [demox]=3 [demox.type]=engine [demox.path]=engine/demo [demox.repo]=demox
        [infrax]=3 [infrax.type]=engine [infrax.path]=engine/infra [infrax.repo]="${TMPDIR}/infrax.git"
    )
    TOOL_ENGINE="${root}"
    CONFIG[RUN_RETRIES]=1

}
test:module:extract:builds-the-tree () {

    local root="" tree=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    tree="$(module:extract:build demox)"

    @eq "$(cd "${tree}" && find . -type f -not -path './.github/*' | sort | tr '\n' ' ')" './.gitignore ./.prettierrc.yml ./.zizmor.yml ./CHANGELOG.md ./Cargo.toml ./LICENSE ./SUPPORT.md ./src/main.rs '
    @eq "$(cat "${tree}/SUPPORT.md")" "$(printf '# Support\n\nAsk at %s/demox.' "$(config:meta:owner)")"
    @eq "$(cat "${tree}/CHANGELOG.md")" $'# Changelog\n\n## Unreleased\n\n### demo\n\n- opened'
    @eq "$(module:extract:repository demox)" github.com/acme/demox
    CLI_VALUED=( [--repository]=true )
    CLI_FLAGS=( [--repository]=/srv/x.git )
    @eq "$(module:extract:repository demox)" /srv/x.git
    CLI_FLAGS=()

    module:extract:prove "${tree}" demox

    printf 'secret\n' > "${root}/engine/demo/.env.local"
    git -C "${root}" -c user.name=t -c user.email=t@t add -f engine/demo/.env.local
    tree="$(module:extract:build demox)"
    @errors 'an env file in the tree' module:extract:prove "${tree}" demox

}
test:module:extract:extract-keeps-and-into-fills () {

    local root="" tree="" into="${TMPDIR}/into"

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${into}/.git" "${into}/stale"

    TOOL_KEEP=false
    tree="$(module:extract:extract demox)"
    @eq "${tree}" "${TOOL_TEMP}/sync/demox"

    CLI_VALUED=( [--into]=true )
    CLI_FLAGS=( [--into]="${into}" )
    @eq "$(module:extract:extract demox)" "${into}"
    [[ -d "${into}/.git" && ! -e "${into}/stale" && -f "${into}/Cargo.toml" ]]

}
test:module:extract:place-fills-a-folder () {

    local root="" target="${TMPDIR}/placed"

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${target}/.git" "${target}/old"

    module:extract:place demox "${target}"

    [[ -d "${target}/.git" && ! -e "${target}/old" && -f "${target}/src/main.rs" ]]
    @errors 'place NAME DIR' module:extract:place demox

}
test:module:extract:push-mirrors-without-force () {

    local root="" bare="${TMPDIR}/mirror.git" probe="${TMPDIR}/probe"

    fixture:module:extract:root
    root="${TMPDIR}/source"

    CLI_VALUED=( [--repository]=true [--branch]=true )
    CLI_FLAGS=( [--repository]="${bare}" [--dry-run]=true )

    @contains "$(module:extract:push demox)" 'not pushed'
    [[ ! -e "${bare}" ]] || @fails git -C "${bare}" rev-parse --verify refs/heads/main

    CLI_FLAGS=( [--repository]="${bare}" )
    module:extract:push demox
    module:extract:push demox

    git -C "${root}" tag v0.1.0
    printf 'fn main() { }\n' > "${root}/engine/demo/src/main.rs"
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -qam 'Release'
    git -C "${root}" tag -f v0.1.0

    module:extract:push demox

    git clone -q --branch main "${bare}" "${probe}"
    @eq "$(git -C "${probe}" log --format='%s %an' | tr '\n' ';')" 'Track v0.1.0 Core Master;Track '"$(git -C "${root}" rev-parse --short=12 HEAD~1)"' Core Master;'
    @eq "$(git -C "${probe}" tag)" v0.1.0
    @eq "$(cat "${probe}/src/main.rs")" 'fn main() { }'
    @fails test -e "${probe}/.env"
    @eq "$(cat "${probe}/.gitignore")" $'target/\n.env'

    @errors 'already exists' module:extract:push demox

    CLI_FLAGS=( [--repository]="${bare}" [--branch]=next )
    git -C "${root}" tag -d v0.1.0 >/dev/null
    module:extract:push demox
    @eq "$(git -C "${probe}" ls-remote --heads origin | wc -l | tr -d ' ')" 2

}
test:module:extract:github-travels-rewritten () {

    local root="" tree="" sha="" flows=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    tree="$(module:extract:build demox)"
    sha="$(git -C "${TMPDIR}/infrax.git" rev-parse main)"

    flows="$(cd "${tree}/.github/workflows" && printf '%s ' *.yml)"
    @eq "${flows}" 'demo.yml global.yml python.yml release.yml '

    @absent "$(cat "${tree}/.github/workflows/demo.yml")" 'paths'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" "uses: ${TMPDIR#/}/infrax.git/src/module/gate/template@${sha} # main"
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'run: infra gate --part demo'
    @contains "$(cat "${tree}/.github/workflows/release.yml")" 'python'
    @absent "$(cat "${tree}/.github/workflows/release.yml")" 'sync'
    @contains "$(cat "${tree}/.github/workflows/release.yml")" 'workflows/demo.yml'
    @absent "$(cat "${tree}/.github/workflows/global.yml")" 'bun-version-file'
    @absent "$(cat "${tree}/.github/workflows/global.yml")" 'with:'
    @absent "$(cat "${tree}/.github/labels.yml")" 'demo'
    @contains "$(cat "${tree}/.github/labels.yml")" 'name: ci'
    @absent "$(cat "${tree}/.github/labeler.yml")" 'engine/'
    @contains "$(cat "${tree}/.github/labeler.yml")" "'.github/**'"
    @eq "$(grep -c 'directory:' "${tree}/.github/dependabot.yml")" 2
    @absent "$(cat "${tree}/.github/dependabot.yml")" 'monorepo note'
    @absent "$(cat "${tree}/.github/dependabot.yml")" 'product/'
    @contains "$(cat "${tree}/.github/dependabot.yml")" 'package-ecosystem: cargo'
    @contains "$(cat "${tree}/.github/ISSUE_TEMPLATE/config.yml")" 'acme/demox/discussions'
    @contains "$(cat "${tree}/.zizmor.yml")" "- ${TMPDIR#/}/infrax.git/src/module/gate/template"

    module:extract:prove "${tree}" demox

    @absent "$(cat "${tree}/.github/workflows/demo.yml")" '$/engine/'
    @absent "$(cat "${tree}/.github/workflows/demo.yml")" ' engine/'
    printf '      - run: bash engine/infra/src/main.sh x\n' >> "${tree}/.github/workflows/demo.yml"

    @errors 'a monorepo path in .github/workflows/demo.yml' module:extract:prove "${tree}" demox

}
test:module:extract:github-stays-whole-for-a-product () {

    local root="" tree=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${root}/product/demo/infra"
    printf '[meta]\nname = "demo"\nversion = "0.1.0"\nlicense = "MIT"\nauthors = ["t"]\nrepo = "demo"\n' > "${root}/product/demo/infra/infra.toml"
    printf 'AGENTS\n' > "${root}/AGENTS.md"
    git -C "${root}" -c user.name=t -c user.email=t@t add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m product

    tree="$(module:extract:build product/demo)"

    @contains "$(cd "${tree}/.github/workflows" && printf '%s ' *.yml)" 'python.yml'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'paths'
    @absent "$(cat "${tree}/.github/dependabot.yml")" 'product/other'
    @contains "$(cat "${tree}/.github/dependabot.yml")" 'directory: /engine/demo'

}
test:module:extract:names-the-gate () {

    @eq "$(module:extract:gatename engine engine/rust)" rust
    @eq "$(module:extract:gatename fragment product/demo/web)" web
    @eq "$(module:extract:gatename tutor tutor)" tutor
    @errors 'Unknown kind' module:extract:gatename other x

}
