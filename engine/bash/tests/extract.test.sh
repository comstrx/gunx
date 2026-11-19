fixture:module:extract:table () {

    fixture:config:targets:table

    TARGETS+=( [facex]=3 [facex.type]=fragment [facex.path]=product/demo/web [facex.repo]=github.com/x/facex )

    module:extract:table

}
test:module:extract:keep-selects-the-tree () {

    fixture:module:extract:table

    module:extract:keep engine engine/rust engine/rust/Cargo.toml
    @fails module:extract:keep engine engine/rust engine/go/go.work
    module:extract:keep fragment product/demo/web product/demo/web/package.json
    @fails module:extract:keep fragment product/demo/web product/demo/api/pyproject.toml
    @fails module:extract:keep plugin engine/rust engine/rust/Cargo.toml
    module:extract:keep product product/demo engine/rust/Cargo.toml
    module:extract:keep product product/demo product/demo/api/pyproject.toml
    @fails module:extract:keep product product/demo product/other/api/pyproject.toml
    @fails module:extract:keep product product/demo engine/rust/Cargo.toml 'engine/rust|engine/go'
    module:extract:keep product product/demo engine/rusty/Cargo.toml 'engine/rust|engine/go'
    module:extract:keep product product/demo engine/demo/Cargo.toml 'engine/rust|engine/go'

}
test:module:extract:knows-what-stays-behind () {

    fixture:module:extract:table
    TOOL_ROOT="${TMPDIR}"

    @fails module:extract:stays uv.lock
    @fails module:extract:stays engine/demo/Cargo.lock
    @fails module:extract:stays product/demo/web/bun.lock
    module:extract:stays README.md
    module:extract:stays AGENTS.md
    @fails module:extract:stays engine/demo/README.md
    @fails module:extract:stays engine/demo/supply-chain/imports.lock
    @fails module:extract:stays LICENSE
    module:extract:stays tutor/index.md
    module:extract:stays tutor/index.md engine/demo
    @fails module:extract:stays tutor/index.md tutor

    module:extract:travels engine engine/demo .gitignore
    module:extract:travels engine engine/demo Bash.toml
    module:extract:travels engine engine/demo .github/labels.yml
    module:extract:travels engine engine/demo engine/demo/README.md
    @fails module:extract:travels engine engine/demo README.md
    @fails module:extract:travels engine engine/demo CHANGELOG.md
    module:extract:travels engine engine/demo engine/demo/Cargo.lock
    @fails module:extract:travels engine engine/demo engine/rust/Cargo.toml
    module:extract:travels product product/demo CHANGELOG.md
    @fails module:extract:travels product product/demo README.md
    module:extract:travels product product/demo product/demo/api/uv.lock
    @fails module:extract:travels product product/demo tutor/index.md
    @fails module:extract:travels engine engine/demo tutor/index.md

}
test:module:extract:names-the-pieces () {

    TOOL_ROOT="${TMPDIR}"

    fixture:module:extract:table

    TARGETS+=( [demo]=4 [demo.type]=product [demo.path]=product/demo [demo.repo]=x/demo [demo.engines]=1 [demo.engines.0]=demo )
    TARGETS+=( [sidex]=3 [sidex.type]=engine [sidex.path]=engine/go [sidex.repo]=x/sidex )
    module:extract:table

    @eq "$(module:extract:blocks sidex engine engine/rust)" rust
    @eq "$(module:extract:blocks facex fragment product/demo/web)" demo-web=web
    @eq "$(module:extract:blocks demo product product/demo | tr '\n' ' ')" 'demo demo demo-* '
    @eq "$(module:extract:shapes DemoX | tr '\n' ' ')" 'demox DEMOX Demox DemoX demoX '
    @eq "$(module:extract:shapes corex | tr '\n' ' ')" 'corex COREX Corex CoreX coreX '
    @eq "$(module:extract:anycase a.b/c-1)" '[Aa][.][Bb]/[Cc]-1'

    @eq "$(config:targets:get demox name)" demox
    @eq "$(module:extract:row engine/demo)" demox
    TARGETS[demox.repo]=github.com/x/other-name.git
    config:targets:settle
    @eq "$(config:targets:get demox name) $(config:targets:get demox owner)" 'other-name github.com/x'
    TARGETS[demox.name]=chosen
    config:targets:settle
    @eq "$(config:targets:get demox name)" chosen
    TARGETS[demox.name]='bad name'
    @errors 'demox: not a name to extract under: bad name' module:extract:whole demox
    TARGETS[demox.name]=demox
    TARGETS[demox.repo]=github.com/x/demox
    @eq "$(module:extract:left demo)" 'engine/go|engine/notes'
    @eq "$(module:extract:left demox)" ''
    TARGETS+=( [demox.refs]=1 [demox.refs.0.src]=engine/shell [demox.refs.0.repo]=github.com/x/shellx [demox.refs.0.tag]=v1 )
    @eq "$(module:extract:tool demox engine/shell)" $'github.com/x/shellx\tv1'
    @errors 'demox: no reference for engine/none' module:extract:tool demox engine/none
    @eq "$(module:extract:kind engine/demo) $(module:extract:kind product/demo) $(module:extract:kind product/demo/web)" 'engine product fragment'
    @fails module:extract:kind tutor
    @fails module:extract:kind engine/demo/src
    @fails module:extract:kind product/demo/web/src
    module:extract:carries demo engine/demo
    @fails module:extract:carries demo engine/go
    @eq "${EXTRACT_HOMES}" 'engine|product'
    @eq "${EXTRACT_PRODUCTS}" product
    @errors 'No target of [deps] sits at nowhere' module:extract:row nowhere

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
    @eq "$(cat "${tree}/CHANGELOG.md")" $'# Changelog\n\n## Unreleased\n\n### rust\n\n- one\n- two\n\n## v0.1.0\n\n### rust\n\n- old'
    @eq "$(tail -n 1 "${tree}/CHANGELOG.md")" '- old'

    module:extract:changelog "${root}" "${tree}" bun=shown
    @eq "$(cat "${tree}/CHANGELOG.md")" $'# Changelog\n\n## Unreleased\n\n### shown\n\n- three\n\n## v0.1.0'

    printf '# Changelog\n\n## v1\n\n### rust\n\n- r\n\n### go\n\n- g\n\n### demo\n\n- whole\n\n### demo-api\n\n- a\n\n### other-api\n\n- o\n\n### demolition\n\n- d\n' > "${root}/CHANGELOG.md"

    module:extract:changelog "${root}" "${tree}" rust demo 'demo-*'
    @eq "$(cat "${tree}/CHANGELOG.md")" $'# Changelog\n\n## v1\n\n### rust\n\n- r\n\n### demo\n\n- whole\n\n### api\n\n- a'

    printf '## v1\n\n### rust\n\n- cut \350\224\n' > "${root}/CHANGELOG.md"
    module:extract:changelog "${root}" "${tree}" rust
    @eq "$(wc -l < "${tree}/CHANGELOG.md")" 7
    @eq "$(tail -c 3 "${tree}/CHANGELOG.md" | od -An -to1 | tr -d ' ')" '350224012'

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

    rm -f -- "${tree}/note.txt" "${tree}/Cargo.toml"
    module:extract:verify "${tree}" engine

}
test:module:extract:the-logo-of-a-row-opens-its-readme () {

    local tree="${TMPDIR}/tool" block=""

    fixture:module:extract:root
    mkdir -p "${tree}"
    printf '# Demo\n\nbadges\n\n# Later\n' > "${tree}/README.md"

    module:extract:logo "${tree}" demox
    @eq "$(cat "${tree}/README.md")" $'# Demo\n\nbadges\n\n# Later'

    TARGETS[demox.logo]='https://example.com/logo.png'
    block=$'<div align="center">\n  <br/>\n  <img height="150" src="https://example.com/logo.png"/>\n  <br/>\n  <br/>\n</div>'

    module:extract:logo "${tree}" demox
    @eq "$(cat "${tree}/README.md")" $'# Demo\n\n'"${block}"$'\n\nbadges\n\n# Later'

    rm -f -- "${tree}/README.md"
    module:extract:logo "${tree}" demox
    [[ ! -e "${tree}/README.md" ]]

    TARGETS[demox.logo]='http://example.com/a b.png'
    @errors 'logo is an https address' module:extract:logo "${tree}" demox

}
test:module:extract:a-product-leaves-flat () {

    local root="" tree="${TMPDIR}/flat" plan=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${root}/product/demo/api/src" "${tree}/product/api/src" "${tree}/.github"
    printf '# Demo\n' > "${root}/product/demo/README.md"
    printf 'Private\n' > "${root}/product/demo/LICENSE"
    printf 'own\n' > "${root}/product/demo/notes.txt"
    printf '# Api\n' > "${root}/product/demo/api/README.md"
    printf '[project]\n' > "${root}/product/demo/api/pyproject.toml"
    git -C "${root}" add -A >/dev/null 2>&1

    plan="$(module:extract:files "${root}" product product/demo | tr '\t' '>' | tr '\n' ' ')"
    @contains "${plan}" 'product/demo/README.md>README.md '
    @contains "${plan}" 'product/demo/LICENSE>LICENSE '
    @contains "${plan}" 'product/demo/notes.txt>notes.txt '
    @absent "${plan}" ' LICENSE>LICENSE '
    @contains "${plan}" 'SUPPORT.md>SUPPORT.md '
    @contains "${plan}" 'product/demo/api/README.md>product/api/README.md '
    @contains "${plan}" 'product/demo/api/pyproject.toml>product/api/pyproject.toml '
    @contains "${plan}" 'engine/demo/Cargo.toml>engine/demo/Cargo.toml '
    @absent "${plan}" 'product/other'

    plan="$(module:extract:files "${root}" fragment product/demo/api | tr '\t' '>' | tr '\n' ' ')"
    @contains "${plan}" 'product/demo/api/README.md>README.md '

    printf 'one = { path = "../../../engine/demo/src/one" }\ntwo = { path = "../web" }\n' > "${tree}/product/api/pyproject.toml"
    printf '{"deps":"cd ../../../engine/demo && pwd"}\n' > "${tree}/product/api/package.json"
    printf 'import x from "../../engine/local";\n' > "${tree}/product/api/src/code.ts"
    printf 'path:\n  - product/demo/api\n  - product/demo/web/\nglob: product/*/api/**\nother: product/other/api/\n' > "${tree}/.github/flow.yml"

    module:extract:shallow "${tree}" fragment product/demo
    @contains "$(cat "${tree}/product/api/pyproject.toml")" '"../../../engine/demo/src/one"'

    module:extract:shallow "${tree}" product product/demo
    @eq "$(cat "${tree}/product/api/pyproject.toml")" $'one = { path = "../../engine/demo/src/one" }\ntwo = { path = "../web" }'
    @eq "$(cat "${tree}/product/api/package.json")" '{"deps":"cd ../../engine/demo && pwd"}'
    @eq "$(cat "${tree}/product/api/src/code.ts")" 'import x from "../../engine/local";'
    @eq "$(cat "${tree}/.github/flow.yml")" $'path:\n  - product/api\n  - product/web/\nglob: product/api/**\nother: product/other/api/'

}
test:module:extract:verify-refuses-the-files-of-secrets () {

    local tree="${TMPDIR}/tool" name=""

    fixture:module:extract:root
    mkdir -p "${tree}/deep"

    for name in .env.example .secret.example .secrets.example secret.txt secrets.toml; do
        printf 'KEY=\n' > "${tree}/deep/${name}"
    done

    module:extract:verify "${tree}" engine

    for name in .env .env.local .envrc .secret .secret.json .secrets .secrets.yml .secretsrc; do

        printf 'KEY=1\n' > "${tree}/deep/${name}"
        @errors "a secrets file in the tree: deep/${name}" module:extract:verify "${tree}" engine
        rm -f -- "${tree}/deep/${name}"

    done

}
test:module:extract:verify-reads-only-the-papers-of-a-product-part () {

    local tree="${TMPDIR}/part" word="" name=""

    fixture:module:extract:root
    word=mono
    mkdir -p "${tree}/src" "${tree}/.github"

    printf 'issuer = "%s"\n' "${word}" > "${tree}/src/seed.py"
    @errors 'a monorepo or product name in src/seed.py' module:extract:verify "${tree}" engine
    module:extract:verify "${tree}" fragment

    printf 'run: %s\n' "${word}" > "${tree}/.github/flow.txt"
    @errors 'a monorepo or product name in .github/flow.txt' module:extract:verify "${tree}" fragment
    rm -f -- "${tree}/.github/flow.txt"

    for name in notes.md part.toml flow.yml flow.yaml; do

        printf 'made in %s\n' "${word}" > "${tree}/src/${name}"
        @errors "a monorepo or product name in src/${name}" module:extract:verify "${tree}" fragment
        rm -f -- "${tree}/src/${name}"

    done

}
test:module:extract:renames-from-the-widest-to-the-word () {

    local tree="${TMPDIR}/docs" root=""

    fixture:module:extract:root
    root="${TMPDIR}/source"

    mkdir -p "${tree}/deep" "${tree}/.github"
    printf 'See https://github.com/acme/mono and HTTPS://GitHub.com/Acme/Mono/issues\n' > "${tree}/SUPPORT.md"
    printf 'host github.com/acme/mono, short acme/mono, owner acme alone\n' >> "${tree}/SUPPORT.md"
    printf 'mono Mono MonO monO MONO mOnO\n' > "${tree}/deep/README.md"
    printf 'name: mono\n' > "${tree}/deep/flow.yaml"
    printf '[meta]\nalias = "mono"\nrepo = "https://github.com/acme/mono"\n' > "${tree}/deep/tool.toml"
    printf 'mono stays\n' > "${tree}/code.txt"
    printf 'mono owner\n' > "${tree}/.github/CODEOWNERS"

    module:extract:rename "${tree}" demox

    @eq "$(sed -n 1p "${tree}/SUPPORT.md")" 'See https://github.com/acme/demox and https://github.com/acme/demox/issues'
    @eq "$(sed -n 2p "${tree}/SUPPORT.md")" 'host github.com/acme/demox, short acme/demox, owner acme alone'
    @eq "$(cat "${tree}/deep/README.md")" 'demox Demox DemoX demoX DEMOX demox'
    @eq "$(cat "${tree}/deep/flow.yaml")" 'name: demox'
    @eq "$(cat "${tree}/deep/tool.toml")" $'[meta]\nalias = "demox"\nrepo = "https://github.com/acme/demox"'
    @eq "$(cat "${tree}/code.txt")" 'mono stays'
    @eq "$(cat "${tree}/.github/CODEOWNERS")" 'demox owner'

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "movedx = { type = \"engine\", path = \"engine/demo\", repo = \"github.com/team/movedx\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    printf 'by acme, at acme/mono and acme/other, mail acme@example.com acme\n' > "${tree}/NOTES.md"
    module:extract:rename "${tree}" movedx

    @eq "$(cat "${tree}/NOTES.md")" 'by team, at team/movedx and acme/other, mail team@example.com team'

}
test:module:extract:source-is-the-origin () {

    fixture:module:extract:root

    @eq "$(module:extract:source)" mono

    git -C "${TMPDIR}/source" remote remove origin
    @eq "$(module:extract:source)" source

}
test:module:extract:commands-guard-their-usage () {

    local root="${TMPDIR}/source"

    @errors 'extract takes one target' bash "${TOOL_BIN}" extract one two
    @errors '--gates and --no-gates do not meet' bash "${TOOL_BIN}" extract demox --gates --no-gates
    @errors 'is not one' bash "${TOOL_BIN}" --root "${TMPDIR}" extract demox

    fixture:module:extract:root
    cd -- "${root}" || return

    @errors 'Unknown target: nope' module:extract:extract nope

    @eq "$(module:extract:session demox)" "${TOOL_TEMP}/sync/demox"

    CLI_VALUED=( [--timeout]=true )
    CLI_FLAGS=( [--timeout]=x )
    @errors '--timeout must be a positive number' config:settings:timeout
    CLI_FLAGS=()
    @eq "$(config:settings:timeout)" "${CONFIG[RUN_TIMEOUT]}"

    @contains "$(NO_COLOR=1 module:extract:targets 2>/dev/null)" 'engine/demo'
    @absent "$(NO_COLOR=1 module:extract:targets 2>/dev/null)" 'missing'

    rm -rf -- "${root}/engine/demo"
    @contains "$(NO_COLOR=1 module:extract:targets 2>/dev/null)" 'missing'
    @errors 'Targets without a part under' module:extract:targets
    @errors 'Targets without a part under' module:extract:extract
    @errors 'Part does not exist yet: engine/demo' module:extract:extract demox

}
fixture:module:extract:root () {

    local root="${TMPDIR}/source" file=""

    mkdir -p "${root}/engine/demo/src" "${root}/engine/bash/src" "${root}/product/other/web"
    git -C "${root}" init -q -b main
    git -C "${root}" remote add origin https://github.com/acme/mono.git

    printf 'target/\n.env\n' > "${root}/.gitignore"
    printf 'MIT\n' > "${root}/LICENSE"
    printf '# Support\n\nAsk at %s/mono.\n' "$(config:meta:owner)" > "${root}/SUPPORT.md"
    printf '# Changelog\n\n## Unreleased\n\n### demo\n\n- opened\n\n### bun\n\n- other\n' > "${root}/CHANGELOG.md"
    printf '[package]\nname = "demo"\n' > "${root}/engine/demo/Cargo.toml"
    printf 'fn main() {}\n' > "${root}/engine/demo/src/main.rs"
    printf 'secret\n' > "${root}/engine/demo/.env"
    printf 'version = 4\n' > "${root}/engine/demo/Cargo.lock"
    printf '# Mono\n' > "${root}/README.md"
    printf '# Agents of mono\n' > "${root}/AGENTS.md"
    printf 'x\n' > "${root}/product/other/README.md"
    printf '{}\n' > "${root}/product/other/web/package.json"
    printf '[meta]\nname = "tool"\nalias = "mono"\n\n[deps]\nx = { type = "engine", path = "x", repo = "x" }\n' > "${root}/engine/bash/bash.toml"
    printf '' > "${root}/engine/bash/src/main.sh"

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx

    mkdir -p "${root}/.github/workflows" "${root}/.github/ISSUE_TEMPLATE" "${TMPDIR}/corex.git"
    git init -q --bare -b main "${TMPDIR}/corex.git"
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q --allow-empty -m seed
    git -C "${root}" push -q "${TMPDIR}/corex.git" HEAD:refs/heads/main

    printf '* @acme\n' > "${root}/.github/CODEOWNERS"
    printf 'blank_issues_enabled: false\ncontact_links:\n  - name: Questions\n    url: https://github.com/acme/mono/discussions\n' > "${root}/.github/ISSUE_TEMPLATE/config.yml"
    printf -- '- name: demo\n  color: 1\n  description: The demo engine (engine/demo)\n\n- name: ci\n  color: 2\n  description: Workflows\n' > "${root}/.github/labels.yml"
    printf "demo:\n  - changed-files:\n      - any-glob-to-any-file: ['engine/demo/**']\n\nci:\n  - changed-files:\n      - any-glob-to-any-file: ['.github/**']\n" > "${root}/.github/labeler.yml"
    printf '# monorepo note\nversion: 2\n\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n  - package-ecosystem: cargo\n    directory: /engine/demo\n  - package-ecosystem: uv\n    directory: /product/other/api\n' > "${root}/.github/dependabot.yml"
    printf "name: demo\n\non:\n  push:\n    branches: [main]\n    paths: ['engine/demo/**']\n  workflow_call:\n\njobs:\n  gate:\n    steps:\n      - uses: actions/checkout@abc # v7\n      - uses: \$/engine/bash/src/module/gate/template\n      - run: infra gate --part demo\n" > "${root}/.github/workflows/demo.yml"
    printf 'name: python\n\non:\n  workflow_call:\n\njobs:\n  gate:\n    steps:\n      - run: infra gate python\n' > "${root}/.github/workflows/python.yml"
    printf 'name: global\n\non:\n  push:\n    branches: [main]\n\njobs:\n  format:\n    strategy:\n      matrix:\n        path:\n          - engine/demo\n          - engine/gone\n          - .\n\n    steps:\n      - uses: $/engine/bash/src/module/gate/template\n        with:\n          path: \044{{ matrix.path }}\n      - run: infra gate global\n' > "${root}/.github/workflows/global.yml"
    printf 'name: release\n\non:\n  push:\n    tags: [v*]\n\njobs:\n  demo:\n    uses: $/.github/workflows/demo.yml\n  python:\n    uses: $/.github/workflows/python.yml\n  global:\n    uses: $/.github/workflows/global.yml\n  sync:\n    needs: [demo, python, global]\n    steps:\n      - uses: $/engine/bash/src/module/gate/template\n      - run: infra extract --push\n' > "${root}/.github/workflows/release.yml"
    printf 'rules:\n  forbidden-uses:\n    config:\n      allow:\n        - actions/checkout\n' > "${root}/.zizmor.yml"
    printf 'singleQuote: true\n' > "${root}/.prettierrc.yml"

    for file in "${root}"/.github/workflows/*.yml; do
        core:fs:file:edit "${file}" -e "s/run: infra /run: $(config:meta:alias) /"
    done

    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com add -A
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -q -m 'Start up'

    TOOL_ROOT="$(cd -- "${root}" && pwd -P)"
    CONFIG[RUN_RETRIES]=1

    module:gate:within () { printf '%s' "${1:+}"; }
    module:gate:within "${root}"

    module:extract:open

}
fixture:module:extract:build () {

    local name="${1}" tree=""

    tree="$(module:extract:session "${name}")" || return

    module:extract:prepare "${name}" "${tree}" || return

    @print "${tree}"

}
fixture:module:extract:prove () {

    module:extract:verify "${1}" "$(config:targets:get "${2}" type)" "${2}"

}
fixture:module:extract:deps () {

    local demo="${1}" bash="${2}" other="${3}" key=""

    shift 3

    for key in "${!MANIFEST[@]}"; do
        [[ "${key}" != deps && "${key}" != deps.* ]] || unset "MANIFEST[${key}]"
    done

    {
        printf '[deps]\n'
        printf 'demox = { type = "engine", path = "engine/demo", repo = "%s", refs = [{ src = "engine/bash", repo = "%s" }] }\n' "${demo}" "${bash}"
        printf 'corex = { type = "engine", path = "engine/bash", repo = "%s" }\n' "${bash}"
        printf 'otherx = { type = "fragment", path = "product/other/web", repo = "%s", refs = [{ src = "engine/bash", repo = "%s" }] }\n' "${other}" "${bash}"
        (( $# == 0 )) || printf '%s\n' "$@"
    } > "${TMPDIR}/table.toml"

    config:manifest:merge "${TMPDIR}/table.toml"

}
test:module:extract:builds-the-tree () {

    local root="" tree=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    tree="$(fixture:module:extract:build demox)"

    @eq "$(cd "${tree}" && find . -type f -not -path './.github/*' | sort | tr '\n' ' ')" './.gitignore ./.prettierrc.yml ./.zizmor.yml ./CHANGELOG.md ./Cargo.lock ./Cargo.toml ./LICENSE ./SUPPORT.md ./src/main.rs '
    @eq "$(cat "${tree}/SUPPORT.md")" "$(printf '# Support\n\nAsk at %s/demox.' "$(config:meta:owner)")"
    @eq "$(cat "${tree}/CHANGELOG.md")" $'# Changelog\n\n## Unreleased\n\n### demo\n\n- opened'
    @eq "$(module:extract:repository demox)" github.com/acme/demox

    fixture:module:extract:prove "${tree}" demox

    printf 'secret\n' > "${root}/engine/demo/.env.local"
    git -C "${root}" -c user.name=t -c user.email=t@t add -f engine/demo/.env.local
    tree="$(fixture:module:extract:build demox)"
    @errors 'a secrets file in the tree' fixture:module:extract:prove "${tree}" demox

}
test:module:extract:extract-proves-and-to-fills () {

    local root="" into="${TMPDIR}/into"

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${into}/.git" "${into}/stale"

    CLI_VALUED=( [--to]=true )
    CLI_FLAGS=()
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved'

    CLI_FLAGS=( [--no-gates]=true )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: extracted'

    CLI_FLAGS=( [--to]="${into}" )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, placed'
    [[ -d "${into}/.git" && ! -e "${into}/stale" && -f "${into}/Cargo.toml" && -f "${into}/Cargo.lock" ]]

    printf 'mine\n' > "${into}/kept.txt"
    printf 'secret\n' > "${root}/engine/demo/.env.local"
    git -C "${root}" -c user.name=t -c user.email=t@t add -f engine/demo/.env.local

    @errors 'extract of demox failed at extract' module:extract:extract demox
    [[ -f "${into}/kept.txt" && ! -e "${into}/.env.local" ]] || @err 'a refused tree reached the destination'

}
test:module:extract:gates-the-tree-and-ships-what-it-keeps () {

    local tree="${TMPDIR}/tree" into="${TMPDIR}/into"

    mkdir -p "${tree}/src" "${into}/.git" "${into}/node_modules" "${into}/old"
    printf '' > "${tree}/bash.toml"
    printf 'node_modules/\nmade\n' > "${tree}/.gitignore"
    printf 'printf made > made; printf lock > demo.lock\n' > "${tree}/src/main.sh"
    printf 'theirs\n' > "${into}/node_modules/kept.js"
    printf 'stale\n' > "${into}/old/stale.txt"

    module:gate:within () { printf 'bash\t%s\n' "${1}"; }

    core:git:init "${tree}"
    module:extract:gate "${tree}" demox >/dev/null 2>&1 || true

    [[ -f "${tree}/made" && -f "${tree}/demo.lock" ]] || @err 'the gates did not run in the tree'
    @eq "$(printf '%s\n' "${GATE_RESULTS[@]}" | cut -f3 | tr '\n' ' ')" 'fetch check lint test safety audit semver '

    core:git:sync "${tree}" "${into}"

    [[ -f "${into}/demo.lock" && -f "${into}/src/main.sh" && ! -e "${into}/made" ]] || @err 'the delivery is not what the tree ships'
    [[ -d "${into}/.git" && -f "${into}/node_modules/kept.js" && ! -e "${into}/old" ]] || @err 'the delivery did not spare what the tree ignores'

}
test:module:extract:locks-every-chain-of-the-tree-before-the-gates () {

    local tree="${TMPDIR}/tree"

    mkdir -p "${tree}/part"

    module:gate:within () { printf 'demo\t%s\n' "${1}/part"; }
    module:gate:demo:lock () { printf locked > locked; }
    module:gate:demo:fetch () { printf installed > installed; }

    module:extract:lock "${tree}" demox >/dev/null 2>&1

    [[ -f "${tree}/part/locked" && ! -e "${tree}/part/installed" ]] || @err 'the lock step did not run alone in the chain folder'
    @eq "$(printf '%s\n' "${GATE_RESULTS[@]}" | cut -f3,4 | tr '\t\n' '  ')" 'lock passed '

    module:gate:demo:lock () { return 1; }

    @errors 'the lock files of demox could not be brought in line with its manifests' module:extract:lock "${tree}" demox

}
test:module:extract:force-delivers-past-a-failed-gate () {

    local into="${TMPDIR}/into"

    fixture:module:extract:root

    module:extract:gate () { @err "gates failed for ${2}"; }

    CLI_VALUED=( [--to]=true )
    CLI_FLAGS=( [--to]="${into}" )
    @errors 'extract of demox failed at gates' module:extract:extract demox
    [[ ! -e "${into}/Cargo.toml" ]] || @err 'a failed gate still delivered'

    CLI_FLAGS=( [--to]="${into}" [--force]=true )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: gates failed, placed'
    [[ -f "${into}/Cargo.toml" ]]

    CLI_FLAGS=( [--to]="${into}/second" [--no-gates]=true )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: extracted, placed'

    module:extract:lock () { @err "the lock files of ${2} could not be brought in line with its manifests"; }

    CLI_FLAGS=( [--to]="${into}/third" [--no-gates]=true )
    @errors 'extract of demox failed at lock' module:extract:extract demox
    [[ ! -e "${into}/third" ]] || @err 'a failed lock still delivered'

    CLI_FLAGS=( [--to]="${into}/third" [--no-gates]=true [--force]=true )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: lock failed, placed'

    CLI_FLAGS=( [--to]="${into}/third" [--force]=true )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: lock failed, gates failed, placed'

}
test:module:extract:refuses-a-crooked-table () {

    TARGETS=( [a]=3 [a.type]=engine [a.path]=engine/a [a.repo]=o/a )
    module:extract:table
    @eq "${EXTRACT_HOMES}|${EXTRACT_PRODUCTS}" 'engine|product|product'

    TARGETS=( [a]=3 [a.type]=plugin [a.path]=engine/a [a.repo]=o/a )
    @errors 'type is one of engine fragment product, not plugin' module:extract:table

    TARGETS=( [a]=2 [a.type]=engine [a.path]=engine/a )
    module:extract:table
    @errors '[deps] a: no repo nor owner' module:extract:repository a
    @eq "$(config:targets:get a name)" a

    TARGETS=( [shop]=1 [shop.logo]='' )
    module:extract:table
    @eq "$(config:targets:get shop type) $(config:targets:get shop path)" 'product product/shop'

    TARGETS=( [a]=2 [a.type]=engine [a.repo]=o/a )
    @errors '[deps] a: no path; write it in the row or pass --path' module:extract:table

    TARGETS=( [a]=3 [a.type]=fragment [a.path]=web [a.repo]=o/a )
    @errors 'a fragment sits at' module:extract:table

    TARGETS=( [a]=3 [a.type]=fragment [a.path]=product/x/web [a.repo]=o/a [b]=3 [b.type]=fragment [b.path]=apps/y/web [b.repo]=o/b )
    @errors 'the products live under product, not under apps' module:extract:table

    TARGETS=( [a]=3 [a.type]=product [a.path]=flat [a.repo]=o/a )
    @errors 'a product sits at' module:extract:table

    TARGETS=()
    @errors 'No distribution table' module:extract:table

    fixture:module:extract:root

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'lonely = { type = "engine", path = "engine/lonely", repo = "lonely" }'
    @errors 'lonely: its workflows run the bash engine; carry it in engines or give a reference for engine/bash' module:extract:open

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'demo = { type = "product", path = "product/demo", repo = "demo", engines = ["rust"] }'
    @errors 'demo: engines names rust' module:extract:open

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'demo = { type = "product", path = "product/demo", repo = "demo", engines = ["demo"] }'
    @errors 'demo: its workflows run the bash engine' module:extract:open

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx "demo = { type = \"product\", path = \"product/demo\", repo = \"demo\", engines = [\"bash\"], refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open
    module:extract:carries demo engine/bash
    @fails module:extract:local demo engine/bash
    @eq "$(module:extract:tool demo engine/bash | cut -f1)" "${TMPDIR}/corex.git"

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'demo = { type = "product", path = "product/demo", repo = "demo", engines = ["bash"] }'
    module:extract:open
    module:extract:local demo engine/bash

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx "x = { type = \"engine\", path = \"engine/demo\", repo = \"x\", engines = [\"nowhere\"], refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open
    @eq "$(config:targets:engines x)" ''

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx "x = { type = \"engine\", path = \"engine/demo\", repo = \"x\", refs = [{ src = \"engine/nowhere\", repo = \"${TMPDIR}/corex.git\" }] }"
    @errors 'x: a reference replaces a folder of the root, and engine/nowhere is none' module:extract:open

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'x = { type = "engine", path = "engine/demo", repo = "x", deps = [] }'
    @errors 'x: unknown key deps' module:extract:open

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx "demo = { path = \"product/demo\", repo = \"demo\", engines = [\"engine/bash\", \"demo\"] }" "inferx = { path = \"engine/demo\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    mkdir -p "${TMPDIR}/source/product/demo"
    module:extract:open
    @eq "$(config:targets:get demo type) $(config:targets:get inferx type)" 'product engine'
    @eq "$(config:targets:engines demo | tr '\n' ' ')" 'bash demo '

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'oddx = { path = "tools/odd", repo = "oddx" }'
    @errors 'oddx: tools/odd tells no type' module:extract:open

}
test:module:extract:push-mirrors-without-force () {

    local root="" bare="${TMPDIR}/mirror.git" probe="${TMPDIR}/probe"

    fixture:module:extract:root
    root="${TMPDIR}/source"

    fixture:module:extract:deps "${bare}" "${TMPDIR}/corex.git" otherx
    module:extract:open

    CLI_VALUED=( [--branch]=true [--message]=true [--tag]=true [--to]=true )
    CLI_FLAGS=( [--push]=true )

    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, pushed'
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, unchanged'

    printf 'fn main() { }\n' > "${root}/engine/demo/src/main.rs"
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -qam 'Release'

    CLI_FLAGS=( [--tag]=v0.1.0 )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, pushed'

    git clone -q --branch main "${bare}" "${probe}"
    @eq "$(git -C "${probe}" log --format='%s %an' | tr '\n' ';')" 'Track v0.1.0 Core Master;Track '"$(git -C "${root}" rev-parse --short=12 HEAD~1)"' Core Master;'
    @eq "$(git -C "${probe}" tag)" v0.1.0
    @eq "$(cat "${probe}/src/main.rs")" 'fn main() { }'
    @fails test -e "${probe}/.env"
    @eq "$(cat "${probe}/Cargo.lock")" 'version = 4'
    @eq "$(cat "${probe}/.gitignore")" $'target/\n.env'

    @errors 'already carries the tag v0.1.0' module:extract:extract demox

    CLI_FLAGS=( [--push]=true [--branch]=next )
    module:extract:extract demox
    @eq "$(git -C "${probe}" ls-remote --heads origin | wc -l | tr -d ' ')" 2

    printf 'fn main() { more() }\n' > "${root}/engine/demo/src/main.rs"
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -qam 'More'

    MANIFEST[deps.demox.branch]=line
    MANIFEST[deps.demox.tag]=9.9.9-rc.1
    CLI_FLAGS=( [--push]=true [--message]='my commit' [--to]="${TMPDIR}/placed" )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, placed, pushed'

    @eq "$(git -C "${bare}" for-each-ref --format='%(refname)' | tr '\n' ' ')" 'refs/heads/line refs/heads/main refs/heads/next refs/tags/9.9.9-rc.1 refs/tags/v0.1.0 '
    @eq "$(git -C "${bare}" log -1 --format=%s line)" 'my commit'
    @eq "$(cat "${TMPDIR}/placed/src/main.rs")" 'fn main() { more() }'

    @errors 'already carries the tag 9.9.9-rc.1' module:extract:extract demox

    CLI_FLAGS=()
    config:targets:load
    @eq "$(module:extract:tag demox)" 9.9.9-rc.1

    unset 'MANIFEST[deps.demox.tag]'
    CLI_FLAGS=( [--release]=true )
    @errors 'Not a hosted repository' module:extract:extract demox

    CLI_FLAGS=()
    @fails module:extract:pushes
    CLI_FLAGS=( [--tag]=1.0.0 )
    @eq "$(module:extract:tag demox)" 1.0.0
    module:extract:pushes
    CLI_FLAGS=( [--tag]='bad tag' )
    @errors 'not a tag name' module:extract:tag demox

    printf '# Changelog\n\n## Unreleased\n\n- next\n\n## v0.1.0\n\n### demo\n\n- opened\n\n## v0.0.1\n\n- old\n' > "${TMPDIR}/placed/CHANGELOG.md"
    @eq "$(module:extract:notes "${TMPDIR}/placed" v0.1.0)" $'\n### demo\n\n- opened'
    @eq "$(module:extract:notes "${TMPDIR}/placed" v9.0.0)" ''

}
test:module:extract:github-travels-rewritten () {

    local root="" tree="" sha="" flows=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    tree="$(fixture:module:extract:build demox)"
    sha="$(git -C "${TMPDIR}/corex.git" rev-parse main)"

    flows="$(cd "${tree}/.github/workflows" && printf '%s ' *.yml)"
    @eq "${flows}" 'demo.yml global.yml python.yml release.yml '

    @absent "$(cat "${tree}/.github/workflows/demo.yml")" 'paths'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" "uses: ${TMPDIR#/}/corex.git/src/module/gate/template@${sha} # main"
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" "run: corex gate --part demo"
    @contains "$(cat "${tree}/.github/workflows/release.yml")" 'python'
    @absent "$(cat "${tree}/.github/workflows/release.yml")" 'sync'
    @contains "$(cat "${tree}/.github/workflows/release.yml")" 'workflows/demo.yml'
    @absent "$(cat "${tree}/.github/workflows/global.yml")" 'engine/'
    @contains "$(cat "${tree}/.github/workflows/global.yml")" $'path:\n          - .\n'
    @contains "$(cat "${tree}/.github/workflows/global.yml")" $'path: \x24{{ matrix.path }}'
    @absent "$(cat "${tree}/.github/labels.yml")" 'demo'
    @contains "$(cat "${tree}/.github/labels.yml")" 'name: ci'
    @absent "$(cat "${tree}/.github/labeler.yml")" 'engine/'
    @contains "$(cat "${tree}/.github/labeler.yml")" "'.github/**'"
    @eq "$(grep -c 'directory:' "${tree}/.github/dependabot.yml")" 2
    @absent "$(cat "${tree}/.github/dependabot.yml")" 'monorepo note'
    @absent "$(cat "${tree}/.github/dependabot.yml")" 'product/'
    @contains "$(cat "${tree}/.github/dependabot.yml")" 'package-ecosystem: cargo'
    @contains "$(cat "${tree}/.github/ISSUE_TEMPLATE/config.yml")" 'acme/demox/discussions'
    @contains "$(cat "${tree}/.zizmor.yml")" "- ${TMPDIR#/}/corex.git/src/module/gate/template"

    fixture:module:extract:prove "${tree}" demox

    @absent "$(cat "${tree}/.github/workflows/demo.yml")" '$/engine/'
    @absent "$(cat "${tree}/.github/workflows/demo.yml")" ' engine/'
    printf '      - run: bash engine/bash/src/main.sh x\n' >> "${tree}/.github/workflows/demo.yml"

    @errors 'a monorepo path in .github/workflows/demo.yml' fixture:module:extract:prove "${tree}" demox

}
test:module:extract:github-stays-whole-for-a-product () {

    local root="" tree=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${root}/product/demo/api"
    printf '[project]\nname = "api"\n' > "${root}/product/demo/api/pyproject.toml"
    git -C "${root}" -c user.name=t -c user.email=t@t add -A
    git -C "${root}" -c user.name=t -c user.email=t@t commit -q -m product

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx 'demo = { type = "product", path = "product/demo", repo = "demo", engines = ["bash", "demo"] }'
    module:extract:open

    @eq "$(module:extract:repository demo)" github.com/acme/demo

    tree="$(fixture:module:extract:build demo)"

    @contains "$(cd "${tree}/.github/workflows" && printf '%s ' *.yml)" 'python.yml'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'paths'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'uses: $/engine/bash/src/module/gate/template'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'run: demo gate'
    @contains "$(cat "${tree}/.github/workflows/global.yml")" '- engine/demo'
    @absent "$(cat "${tree}/.github/workflows/global.yml")" 'engine/gone'
    @absent "$(cat "${tree}/.github/workflows/release.yml")" 'sync'
    @absent "$(cat "${tree}/.github/dependabot.yml")" 'product/other'
    @contains "$(cat "${tree}/.github/dependabot.yml")" 'directory: /engine/demo'

    printf '# Changelog\n' > "${tree}/CHANGELOG.md"
    fixture:module:extract:prove "${tree}" demo

}
test:module:extract:push-tracks-a-commit-only () {

    local root="" bare="${TMPDIR}/mirror.git"

    fixture:module:extract:root
    root="${TMPDIR}/source"

    fixture:module:extract:deps "${bare}" "${TMPDIR}/corex.git" otherx
    module:extract:open

    CLI_FLAGS=( [--push]=true )

    printf 'fn main() { dirty() }\n' > "${root}/engine/demo/src/main.rs"
    @errors '1 uncommitted files travel (engine/demo/src/main.rs)' module:extract:extract demox
    [[ ! -e "${bare}" ]] || @err 'a refused push touched the mirror'

    git -C "${root}" checkout -q -- engine/demo/src/main.rs
    printf 'note\n' > "${root}/product/other/stray.md"
    module:extract:clean "${root}" demox
    printf 'note\n' > "${root}/stray.md"
    @errors 'stray.md' module:extract:clean "${root}" demox
    rm -f -- "${root}/stray.md"
    printf 'secret\n' > "${root}/SECURITY.md"
    @errors 'SECURITY.md' module:extract:clean "${root}" demox
    rm -f -- "${root}/SECURITY.md" "${root}/product/other/stray.md"

    git -C "${root}" rm -q --cached engine/demo/src/main.rs
    rm -f -- "${root}/engine/demo/src/main.rs"
    @absent "$(core:git:files "${root}" | tr '\0' ' ')" 'engine/demo/src/main.rs'

}
test:module:extract:knows-its-own-engine () {

    fixture:module:extract:root

    @eq "$(module:extract:self)" engine/bash

    rm -f -- "${TMPDIR}/source/engine/bash/src/main.sh"
    @errors 'No target of [deps] is the bash engine' module:extract:self

}
test:module:extract:extracts-every-target-in-order () {

    local report="" all="${TMPDIR}/all" bash="${TMPDIR}/corex.git"

    fixture:module:extract:root

    fixture:module:extract:deps demox "${bash}" otherx \
        "lastx = { type = \"engine\", path = \"engine/demo\", repo = \"lastx\", refs = [{ src = \"product/other/web\", repo = \"otherx\" }, { src = \"engine/bash\", repo = \"${bash}\" }] }"
    module:extract:open

    @eq "$(module:extract:order | tr '\n' ' ')" 'corex demox otherx lastx '
    @eq "$(module:extract:needs lastx | tr '\n' ' ')" 'otherx corex '

    printf 'KEY=1\n' > "${TMPDIR}/source/product/other/web/.secrets"
    git -C "${TMPDIR}/source" add product/other/web/.secrets

    CLI_VALUED=( [--to]=true [--tag]=true )
    CLI_FLAGS=( [--no-gates]=true [--to]="${all}" )

    report="$(module:extract:extract 2>&1)" || true

    @contains "${report}" 'Extract'
    @contains "${report}" 'extracted, placed'
    @contains "${report}" 'failed at extract'
    @contains "${report}" 'skipped: otherx failed'
    @contains "${report}" 'extract failed: otherx (extract), lastx (waits for otherx)'
    [[ -f "${all}/demox/Cargo.toml" && -f "${all}/corex/bash.toml" && ! -e "${all}/otherx" && ! -e "${all}/lastx" ]] || @err 'the run did not isolate the failure'

    TARGETS=(
        [onex]=4 [onex.type]=engine [onex.path]=engine/one [onex.repo]=o/onex [onex.refs]=1 [onex.refs.0.src]=engine/two [onex.refs.0.repo]=o/twox
        [twox]=4 [twox.type]=engine [twox.path]=engine/two [twox.repo]=o/twox [twox.refs]=1 [twox.refs.0.src]=engine/one [twox.refs.0.repo]=o/onex
    )
    @errors 'depend on each other in a circle: onex twox' module:extract:order

}
test:module:extract:flows-keep-the-paths-of-the-tree () {

    local file="${TMPDIR}/ci.yml" labeler="${TMPDIR}/labeler.yml" tree="${TMPDIR}/tree"

    fixture:module:extract:table
    mkdir -p "${tree}/product/demo/web"

    printf 'jobs:\n  gate:\n    strategy:\n      matrix:\n        path:\n          - engine/rust\n          - product/demo/web\n          - .\n        os: [ubuntu-latest]\n\n    runs-on: x\n' > "${file}"

    module:extract:flows:paths "${file}" "${tree}"
    @eq "$(cat "${file}")" $'jobs:\n  gate:\n    strategy:\n      matrix:\n        path:\n          - product/demo/web\n          - .\n        os: [ubuntu-latest]\n\n    runs-on: x'

    module:extract:flows:paths "${file}" "${TMPDIR}"
    @eq "$(cat "${file}")" $'jobs:\n  gate:\n    strategy:\n      matrix:\n        path:\n          - .\n        os: [ubuntu-latest]\n\n    runs-on: x'

    printf "rust:\n  - changed-files:\n      - any-glob-to-any-file: ['engine/rust/**']\n\nci:\n  - changed-files:\n      - any-glob-to-any-file: ['.github/**']\n" > "${labeler}"
    core:parse:yaml:prune "${labeler}" "'(engine|product|tutor)/"
    core:parse:yaml:hollow "${labeler}" '[a-z][a-z0-9-]*'

    @eq "$(cat "${labeler}")" $'ci:\n  - changed-files:\n      - any-glob-to-any-file: [\'.github/**\']'

}
test:module:extract:verify-guards-a-product () {

    local tree="${TMPDIR}/product"

    fixture:module:extract:root
    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx "other = { type = \"product\", path = \"product/other\", repo = \"other\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    mkdir -p "${TMPDIR}/source/product/gamma" "${tree}/product/other" "${tree}/.github"
    printf 'built for gamma\n' > "${tree}/notes.md"

    @errors "another product's name in notes.md" module:extract:verify "${tree}" product other

    printf 'built for other\n' > "${tree}/notes.md"
    module:extract:verify "${tree}" product other

    printf 'tenant = "gamma"\n' > "${tree}/product/other/seed.py"
    module:extract:verify "${tree}" product other

    printf 'built for gamma\n' > "${tree}/product/other/notes.md"
    @errors "another product's name in product/other/notes.md" module:extract:verify "${tree}" product other
    rm -f -- "${tree}/product/other/notes.md"

    printf 'directory: /engine/demo\n' > "${tree}/.github/dependabot.yml"
    @errors 'an engine that stayed behind in .github/dependabot.yml' module:extract:verify "${tree}" product other

}
test:module:extract:a-product-carries-the-engines-it-names () {

    local root="" tree=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${root}/product/demo/api" "${root}/tutor" "${root}/engine/go"
    printf '[project]\nname = "api"\n' > "${root}/product/demo/api/pyproject.toml"
    printf 'lock\n' > "${root}/product/demo/api/uv.lock"
    printf 'contract\n' > "${root}/tutor/index.md"
    printf 'go 1.25\n' > "${root}/engine/go/go.work"
    printf -- '- name: api\n  color: 3\n  description: The backend (product/*/api)\n\n- name: tutor\n  color: 4\n  description: The contract (tutor/)\n\n- name: go\n  color: 5\n  description: The go engine (engine/go)\n' >> "${root}/.github/labels.yml"
    printf "\napi:\n  - changed-files:\n      - any-glob-to-any-file: ['product/*/api/**']\n\ntutor:\n  - changed-files:\n      - any-glob-to-any-file: ['tutor/**']\n\ngo:\n  - changed-files:\n      - any-glob-to-any-file: ['engine/go/**']\n" >> "${root}/.github/labeler.yml"

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "sidex = { type = \"engine\", path = \"engine/go\", repo = \"sidex\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }" \
        'demo = { type = "product", path = "product/demo", repo = "demo", engines = ["bash", "demo"] }'
    module:extract:open

    tree="$(fixture:module:extract:build demo)"

    @contains "$(cat "${tree}/engine/bash/bash.toml")" 'alias = "demo"'
    @absent "$(cat "${tree}/engine/bash/bash.toml")" '[deps]'
    [[ -f "${tree}/engine/demo/Cargo.toml" && -f "${tree}/product/api/pyproject.toml" && -f "${tree}/LICENSE" && -f "${tree}/CHANGELOG.md" ]]
    [[ ! -e "${tree}/tutor" && ! -e "${tree}/product/other" && ! -e "${tree}/engine/go" ]] || @err 'the product carries what it did not name'
    @contains "$(cat "${tree}/.github/labels.yml")" '(product/api)'
    @contains "$(cat "${tree}/.github/labels.yml")" '(engine/demo)'
    @absent "$(cat "${tree}/.github/labels.yml")" 'tutor'
    @absent "$(cat "${tree}/.github/labels.yml")" 'engine/go'
    @contains "$(cat "${tree}/.github/labeler.yml")" "'product/api/**'"
    @contains "$(cat "${tree}/.github/labeler.yml")" "'engine/demo/**'"
    @absent "$(cat "${tree}/.github/labeler.yml")" 'tutor'
    @absent "$(cat "${tree}/.github/labeler.yml")" 'engine/go'
    [[ ! -e "${tree}/README.md" && ! -e "${tree}/AGENTS.md" && ! -e "${tree}/product/demo" ]] || @err 'a root readme went with the product'
    [[ -f "${tree}/product/api/uv.lock" && -f "${tree}/engine/demo/Cargo.lock" ]] || @err 'a lock stayed behind'

}
test:module:extract:a-product-reaches-the-bash-engine-by-the-mirror () {

    local root="" tree="" sha=""

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${root}/product/demo/api"
    printf '[project]\nname = "api"\n' > "${root}/product/demo/api/pyproject.toml"
    sha="$(git -C "${TMPDIR}/corex.git" rev-parse main)"

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "demo = { type = \"product\", path = \"product/demo\", repo = \"demo\", engines = [\"demo\"], refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    tree="$(fixture:module:extract:build demo)"

    [[ ! -e "${tree}/engine/bash" && -f "${tree}/engine/demo/Cargo.toml" ]] || @err 'the bash engine went with a product that names its mirror'
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" "uses: ${TMPDIR#/}/corex.git/src/module/gate/template@${sha} # main"
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" "run: corex gate --part demo"
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'paths'
    @absent "$(cat "${tree}/.github/workflows/release.yml")" 'sync'
    @contains "$(cat "${tree}/.zizmor.yml")" "- ${TMPDIR#/}/corex.git/src/module/gate/template"

    printf '# Changelog\n' > "${tree}/CHANGELOG.md"
    fixture:module:extract:prove "${tree}" demo

}
test:module:extract:the-bash-mirror-drops-what-is-private () {

    local tree=""

    fixture:module:extract:root
    printf '' > "${TMPDIR}/source/engine/bash/src/main.sh"

    tree="$(fixture:module:extract:build corex)"

    @contains "$(cat "${tree}/bash.toml")" 'alias = "corex"'
    @absent "$(cat "${tree}/bash.toml")" 'deps'
    @eq "$(grep -c '^alias' "${tree}/bash.toml")" 1
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'uses: $/src/module/gate/template'

}
test:module:extract:a-fragment-reaches-its-engine-by-the-mirror () {

    local root="" tree="" file="" up="../../.." engine="${TMPDIR}/demox.git"

    fixture:module:extract:root
    root="${TMPDIR}/source"
    mkdir -p "${root}/product/other/api/src/one"

    {
        printf '[project]\nname = "api"\n\n[tool.uv.sources]\n'
        printf 'api-one = { workspace = true }\n'
        printf 'engine = { path = "%s/engine/demo/src/engine", editable = true }\n' "${up}"
        printf 'engine-log = { path = "%s/engine/demo/src/log", editable = true }\n' "${up}"
        printf 'whole = { path = "%s/engine/demo" }\n' "${up}"
    } > "${root}/product/other/api/pyproject.toml"

    fixture:module:extract:deps "${engine}" "${TMPDIR}/corex.git" otherx \
        "partx = { type = \"fragment\", path = \"product/other/api\", repo = \"partx\", refs = [{ src = \"engine/demo\", repo = \"${engine}\" }, { src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    @errors 'has no tag nor a default branch to stand on' fixture:module:extract:build partx

    git init -q --bare -b main "${engine}"
    git -C "${root}" push -q "${engine}" HEAD:refs/heads/main

    @eq "$(core:git:default "${engine}")" main
    @fails core:git:default "${TMPDIR}/none.git"

    tree="$(fixture:module:extract:build partx)"
    file="$(cat "${tree}/pyproject.toml")"

    @contains "${file}" "engine = { git = \"file://${engine}\", subdirectory = \"src/engine\" }"
    @contains "${file}" "engine-log = { git = \"file://${engine}\", subdirectory = \"src/log\" }"
    @contains "${file}" "whole = { git = \"file://${engine}\" }"
    @contains "${file}" 'api-one = { workspace = true }'
    @absent "${file}" '../'

    git -C "${root}" tag v0.2.0
    git -C "${root}" tag v0.10.0
    git -C "${root}" push -q "${engine}" v0.2.0 v0.10.0
    git -C "${root}" tag v7.0.0

    @eq "$(core:git:newest "${engine}")" v0.10.0
    @fails core:git:newest "${TMPDIR}/none.git"

    tree="$(fixture:module:extract:build partx)"
    @contains "$(cat "${tree}/pyproject.toml")" "engine = { git = \"file://${engine}\", subdirectory = \"src/engine\", tag = \"v0.10.0\" }"

    TARGETS[partx.refs.0.tag]=0.2.0
    tree="$(fixture:module:extract:build partx)"
    @contains "$(cat "${tree}/pyproject.toml")" "subdirectory = \"src/engine\", tag = \"0.2.0\" }"

}
test:module:extract:an-owner-stands-in-for-the-repository () {

    local into="${TMPDIR}/placed"

    fixture:module:extract:root

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "plainx = { type = \"engine\", path = \"engine/demo\", owner = \"acme\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }" \
        "namedx = { name = \"chosen\", type = \"engine\", path = \"engine/demo\", owner = \"acme\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    @eq "$(config:targets:get plainx name)" plainx
    @eq "$(config:targets:get namedx name)" chosen
    @eq "$(module:extract:repository plainx)" github.com/acme/plainx
    @eq "$(module:extract:repository namedx)" github.com/acme/chosen
    @contains "$(NO_COLOR=1 module:extract:targets 2>/dev/null)" 'chosen'

    CLI_VALUED=( [--to]=true [--tag]=true )
    CLI_FLAGS=( [--no-gates]=true [--to]="${into}" )
    @contains "$(module:extract:extract plainx 2>&1)" 'plainx: extracted, placed'
    @eq "$(cat "${into}/SUPPORT.md")" "$(printf '# Support\n\nAsk at %s/plainx.' "$(config:meta:owner)")"

    CLI_FLAGS=( [--no-gates]=true [--to]="${into}.named" )
    module:extract:extract namedx >/dev/null 2>&1
    @eq "$(cat "${into}.named/SUPPORT.md")" "$(printf '# Support\n\nAsk at %s/chosen.' "$(config:meta:owner)")"

}
test:module:extract:a-row-without-a-repo-extracts-but-does-not-push () {

    local into="${TMPDIR}/placed"

    fixture:module:extract:root

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "barex = { type = \"engine\", path = \"engine/demo\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    @eq "$(config:targets:get barex name)" barex
    @errors '[deps] barex: no repo nor owner' module:extract:repository barex

    CLI_VALUED=( [--to]=true [--tag]=true )
    CLI_FLAGS=( [--no-gates]=true [--to]="${into}" )
    @contains "$(module:extract:extract barex 2>&1)" 'barex: extracted, placed'
    @eq "$(cat "${into}/SUPPORT.md")" "$(printf '# Support\n\nAsk at %s/barex.' "$(config:meta:owner)")"

    CLI_FLAGS=( [--no-gates]=true [--push]=true )
    @errors '[deps] barex: no repo nor owner' module:extract:extract barex

}
test:module:extract:flags-write-over-a-row-or-open-one () {

    fixture:module:extract:root

    CLI_VALUED=( [--type]=true [--path]=true [--repo]=true [--owner]=true [--name]=true [--logo]=true [--engines]=true [--refs]=true [--tag]=true [--branch]=true )

    CLI_FLAGS=( [--repo]=acme/elsewhere [--name]=chosen )
    module:extract:open demox
    @eq "$(module:extract:repository demox)" github.com/acme/elsewhere
    @eq "$(config:targets:get demox name)" chosen
    @eq "$(config:targets:get demox path)" engine/demo

    CLI_FLAGS=( [--path]=engine/demo [--owner]=acme [--refs]="engine/bash:${TMPDIR}/corex.git" )
    module:extract:open freshx
    @eq "$(module:extract:repository freshx)" github.com/acme/freshx
    @eq "$(config:targets:get freshx type)" engine
    @eq "$(config:targets:refs freshx | cut -f1,2 | tr '\t' '=')" "engine/bash=${TMPDIR}/corex.git"

    CLI_FLAGS=( [--type]=engine [--owner]=acme )
    @errors '[deps] freshx: no path; write it in the row or pass --path' module:extract:open freshx

    CLI_FLAGS=( [--type]=engine [--path]=engine/demo [--refs]="engine/bash:${TMPDIR}/corex.git" )
    module:extract:open freshx
    @errors '[deps] freshx: no repo nor owner' module:extract:repository freshx

    CLI_FLAGS=( [--type]=engine [--path]=../out [--owner]=acme )
    @errors 'must name a path inside the root' module:extract:open freshx

    CLI_FLAGS=( [--type]=engine )
    @errors '--type describes one target' module:extract:open

    CLI_FLAGS=( [--tag]=v9 )
    module:extract:open
    @eq "$(config:targets:get demox tag) $(config:targets:get corex tag)" 'v9 v9'

    CLI_FLAGS=( [--engines]=bash,demo )
    module:extract:open shopx
    @eq "$(config:targets:get shopx type) $(config:targets:get shopx path)" 'product product/shopx'

    CLI_FLAGS=()
    @errors 'nosuch: its workflows run the bash engine' module:extract:open nosuch

}
test:module:extract:reads-a-reference-in-every-form () {

    fixture:module:extract:root

    module:extract:flags:refs onex 'engine/bash:acme/corex, engine/demo:github.com/acme/sidex ,engine/go:https://github.com/acme/basex,product/other/web:git@github.com:acme/lastx.git,engine/rust:/srv/pathx.git/,engine/python:namex'

    @eq "$(config:targets:refs onex | cut -f1,2 | tr '\t\n' '= ')" \
        'engine/bash=acme/corex engine/demo=github.com/acme/sidex engine/go=https://github.com/acme/basex product/other/web=git@github.com:acme/lastx.git engine/rust=/srv/pathx.git/ engine/python=namex '

    @errors 'onex: namex names no owner' config:targets:settle

    TARGETS[onex.owner]=acme

    config:targets:settle

    @eq "$(config:targets:refs onex | cut -f1,2 | tr '\t\n' '= ')" \
        'engine/bash=github.com/acme/corex engine/demo=github.com/acme/sidex engine/go=github.com/acme/basex product/other/web=github.com/acme/lastx engine/rust=/srv/pathx.git engine/python=github.com/acme/namex '

    unset 'TARGETS[onex.owner]'
    TARGETS[onex.repo]=https://gitlab.com/group/onex
    module:extract:flags:refs onex 'engine/bash:namex'
    config:targets:settle
    @eq "$(config:targets:refs onex | cut -f2)" gitlab.com/group/namex

    module:extract:flags:engines onex ' one, engine/two ,,three '
    @eq "$(config:targets:engines onex | tr '\n' ' ')" 'one engine/two three '

    module:extract:flags:refs onex ''
    @eq "$(config:targets:refs onex)" ''

    @errors '--refs takes src:repo' module:extract:flags:refs onex 'acme/corex'
    @errors '--refs takes src:repo' module:extract:flags:refs onex 'https://github.com/acme/corex'
    @errors '--refs takes src:repo' module:extract:flags:refs onex '../out:acme/corex'
    @errors '--refs takes src:repo' module:extract:flags:refs onex 'engine/bash:'

}
test:module:extract:renames-across-hosts () {

    local tree="${TMPDIR}/hosts" line='A https://github.com/acme/mono B github.com/acme/mono C acme/mono D acme E MonO mono MONO F acme/kept'

    fixture:module:extract:root

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "labx = { type = \"engine\", path = \"engine/demo\", repo = \"gitlab.com/group/sub/labx\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }" \
        "azurex = { type = \"engine\", path = \"engine/demo\", repo = \"https://dev.azure.com/org/project/_git/azurex\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }" \
        "portx = { name = \"ported\", type = \"engine\", path = \"engine/demo\", repo = \"git.corp.example:8443/Team/portx\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"
    module:extract:open

    mkdir -p "${tree}"

    printf '%s\n' "${line}" > "${tree}/x.toml"
    module:extract:rename "${tree}" labx
    @eq "$(cat "${tree}/x.toml")" 'A https://gitlab.com/group/sub/labx B gitlab.com/group/sub/labx C group/sub/labx D group E LabX labx LABX F acme/kept'

    printf '%s\n' "${line}" > "${tree}/x.toml"
    module:extract:rename "${tree}" azurex
    @eq "$(cat "${tree}/x.toml")" 'A https://dev.azure.com/org/project/_git/azurex B dev.azure.com/org/project/_git/azurex C org/project/_git/azurex D org E AzureX azurex AZUREX F acme/kept'

    printf '%s\n' "${line}" > "${tree}/x.toml"
    module:extract:rename "${tree}" portx
    @eq "$(cat "${tree}/x.toml")" 'A https://git.corp.example:8443/Team/portx B git.corp.example:8443/Team/portx C Team/portx D Team E PorteD ported PORTED F acme/kept'

    printf '%s\n' "${line}" > "${tree}/x.toml"
    module:extract:rename "${tree}" demox
    @eq "$(cat "${tree}/x.toml")" 'A https://github.com/acme/demox B github.com/acme/demox C acme/demox D acme E DemoX demox DEMOX F acme/kept'

}
test:module:extract:releases-after-the-push () {

    local root="" bare="${TMPDIR}/mirror.git" calls="${TMPDIR}/released"

    fixture:module:extract:root
    root="${TMPDIR}/source"

    fixture:module:extract:deps "${bare}" "${TMPDIR}/corex.git" otherx
    module:extract:open

    printf '# Changelog\n\n## v1.0.0\n\n### demo\n\n- first release\n' > "${root}/CHANGELOG.md"
    git -C "${root}" -c user.name='Core Master' -c user.email=core@example.com commit -qam notes

    core:gh:hosted () { printf 'example.com\towner/name\n'; }
    core:gh:released () { [[ -f "${calls}.done" ]]; }
    core:gh:release () { printf '%s|%s|%s\n' "${1}" "${2}" "${3}" >> "${calls}"; }

    CLI_VALUED=( [--tag]=true )

    CLI_FLAGS=( [--release]=true )
    @errors 'has no tag to release' module:extract:extract demox
    [[ ! -e "${bare}" ]] || @err 'a refused release touched the mirror'

    CLI_FLAGS=( [--release]=true [--tag]=v1.0.0 )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, pushed, released'
    @contains "$(cat "${calls}")" "${bare}|v1.0.0|"
    @contains "$(cat "${calls}")" '- first release'
    @eq "$(git -C "${bare}" tag)" v1.0.0

    CLI_FLAGS=( [--release]=true )
    module:extract:extract demox >/dev/null 2>&1
    @eq "$(grep -c '|v1.0.0|' "${calls}")" 2

    : > "${calls}.done"
    @errors 'already has the release v1.0.0' module:extract:extract demox

}
test:module:extract:the-rename-spares-what-the-workflows-call () {

    local root="" tree="" kit="${TMPDIR}/mono-kit/mono.git" sha=""

    fixture:module:extract:root
    root="${TMPDIR}/source"

    mkdir -p "${kit%/*}"
    git init -q --bare -b main "${kit}"
    git -C "${root}" push -q "${kit}" HEAD:refs/heads/main
    sha="$(git -C "${kit}" rev-parse main)"

    fixture:module:extract:deps demox "${kit}" otherx
    module:extract:open

    tree="$(fixture:module:extract:build demox)"

    @contains "$(cat "${tree}/.github/workflows/demo.yml")" "uses: ${kit#/}/src/module/gate/template@${sha} # main"
    @contains "$(cat "${tree}/.github/workflows/demo.yml")" 'run: mono gate --part demo'
    @contains "$(cat "${tree}/.zizmor.yml")" "- ${kit#/}/src/module/gate/template"
    @absent "$(cat "${tree}/.github/workflows/demo.yml")" '__0__'
    @absent "$(cat "${tree}/.github/workflows/demo.yml")" '__1__'
    @absent "$(cat "${tree}/.zizmor.yml")" '__1__'

}
test:module:extract:own-flags-need-their-target () {

    local key=""

    fixture:module:extract:root

    for key in "${EXTRACT_OWN[@]}"; do

        CLI_VALUED=( ["--${key}"]=true )
        CLI_FLAGS=( ["--${key}"]=x )

        @errors "--${key} describes one target" module:extract:open
        @status 2 module:extract:open

    done

}
test:module:extract:every-flag-wins-over-its-row () {

    local key=""
    local -A wanted=( [name]=chosen [type]=engine [path]=engine/demo [repo]=acme/elsewhere [owner]=acme [logo]=https://example.com/logo.png [branch]=release [tag]=v7 )

    fixture:module:extract:root

    fixture:module:extract:deps demox "${TMPDIR}/corex.git" otherx \
        "rowx = { name = \"old\", type = \"engine\", path = \"engine/demo\", repo = \"acme/old\", owner = \"old\", logo = \"https://example.com/old.png\", branch = \"old\", tag = \"v1\", refs = [{ src = \"engine/bash\", repo = \"${TMPDIR}/corex.git\" }] }"

    for key in "${!wanted[@]}"; do

        CLI_VALUED=( ["--${key}"]=true )
        CLI_FLAGS=( ["--${key}"]="${wanted[${key}]}" )

        module:extract:open rowx

        if [[ "${key}" == repo ]]; then @eq "$(module:extract:repository rowx)" github.com/acme/elsewhere
        else @eq "$(config:targets:get rowx "${key}")" "${wanted[${key}]}"
        fi

    done

    CLI_VALUED=()
    CLI_FLAGS=()
    module:extract:open rowx

    @eq "$(config:targets:get rowx tag) $(config:targets:get rowx branch) $(config:targets:get rowx name)" 'v1 old old'

}
test:module:extract:refuses-flags-that-would-bend-the-table () {

    fixture:module:extract:root

    CLI_VALUED=( [--type]=true [--path]=true [--engines]=true [--refs]=true [--logo]=true [--name]=true )

    CLI_FLAGS=( [--refs]='engine/bash:acme/base x' )
    @errors 'each one word' module:extract:open demox

    CLI_FLAGS=( [--refs]='engine/nowhere:acme/basex' )
    @errors 'demox: a reference replaces a folder of the root, and engine/nowhere is none' module:extract:open demox

    CLI_FLAGS=( [--engines]=engine/demo/src )
    module:extract:open demox
    @eq "$(config:targets:engines demox)" ''

    CLI_FLAGS=( [--type]=plugin )
    @errors 'type is one of engine fragment product, not plugin' module:extract:open demox

    CLI_FLAGS=( [--path]=/etc )
    @errors 'must name a path inside the root' module:extract:open demox

    CLI_FLAGS=( [--path]='engine/de mo' )
    @errors 'must name a path inside the root' module:extract:open demox

    CLI_FLAGS=( [--name]='two words' )
    @errors 'demox: not a name to extract under: two words' module:extract:open demox

    CLI_FLAGS=( [--logo]=$'https://example.com/a\nb' )
    @errors 'holds a control character' module:extract:open demox

    CLI_FLAGS=()
    @errors 'not a target name' module:extract:open '../demox'
    @errors 'not a target name' module:extract:open 'de.mox'

}
test:module:extract:the-lock-step-stands-between-the-tree-and-its-delivery () {

    local into="${TMPDIR}/into"

    fixture:module:extract:root

    module:extract:lock () { printf 'locked\n' >> "${1}/Cargo.lock"; }
    module:extract:gate () { @contains "$(cat "${1}/Cargo.lock")" locked; }

    CLI_VALUED=( [--to]=true )

    CLI_FLAGS=( [--to]="${into}" [--no-gates]=true )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: extracted, placed'
    @eq "$(cat "${into}/Cargo.lock")" $'version = 4\nlocked'

    CLI_FLAGS=( [--to]="${into}/second" )
    @contains "$(module:extract:extract demox 2>&1)" 'demox: proved, placed'

    module:extract:lock () { printf 'half\n' >> "${1}/Cargo.lock"; return 1; }

    CLI_FLAGS=( [--to]="${into}/third" [--no-gates]=true )
    @errors 'extract of demox failed at lock' module:extract:extract demox
    [[ ! -e "${into}/third" ]] || @err 'a tree with a broken lock was delivered'

}
test:module:extract:the-map-holds-what-the-steps-know () {

    local tree="${TMPDIR}/tree" name=""

    mkdir -p "${tree}/${EXTRACT_FLOWS}"

    printf 'a\n' > "${tree}/${EXTRACT_FLOWS}/one.yml"
    printf 'a\n' > "${tree}/${EXTRACT_FLOWS}/two.yaml"
    printf 'a\n' > "${tree}/${EXTRACT_FLOWS}/notes.md"
    mkdir -p "${tree}/${EXTRACT_FLOWS}/folder.yml"

    @eq "$(module:extract:flows:files "${tree}" | sed "s|${tree}/${EXTRACT_FLOWS}/||" | tr '\n' ' ')" 'one.yml two.yaml '

    @eq "${EXTRACT_KINDS[*]}" 'engine fragment product'

    for name in "${EXTRACT_KINDS[@]}"; do
        [[ "${name}" == "${EXTRACT_KIND}" || "${name}" == engine || "${name}" == fragment ]] || @err "an unknown kind: ${name}"
    done

    for name in "${EXTRACT_SAMPLES[@]}"; do
        [[ "${name}" == "${EXTRACT_SECRETS[0]}"* || "${name}" == "${EXTRACT_SECRETS[1]}"* ]] || @err "a sample that is no secrets name: ${name}"
    done

    for name in "${EXTRACT_LABELS[@]}" "${EXTRACT_LABELER}" "${EXTRACT_UPDATES}" "${EXTRACT_FLOWS}"; do
        [[ "${name}" == "${EXTRACT_FORGE}"/* ]] || @err "a forge file outside ${EXTRACT_FORGE}: ${name}"
    done

    @eq "$(module:extract:kind "${EXTRACT_ENGINES}/x") $(module:extract:kind "${EXTRACT_HOME}/x") $(module:extract:kind "${EXTRACT_HOME}/x/y")" 'engine product fragment'

}
test:module:extract:verify-reads-its-secrets-from-the-map () {

    local tree="${TMPDIR}/tree" name=""

    fixture:module:extract:root

    mkdir -p "${tree}/sub"

    for name in "${EXTRACT_SAMPLES[@]}"; do printf 'x\n' > "${tree}/${name}"; done

    fixture:module:extract:prove "${tree}" demox

    for name in "${EXTRACT_SECRETS[@]}"; do

        printf 'x\n' > "${tree}/sub/${name}.local"
        @errors "a secrets file in the tree: sub/${name}.local" fixture:module:extract:prove "${tree}" demox
        rm -f -- "${tree}/sub/${name}.local"

    done

}
