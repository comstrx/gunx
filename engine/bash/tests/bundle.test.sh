fixture:module:bundle:audit:manifest () {

    MANIFEST=(
        [name]=infra
        [version]=0.1.0
        [tools.shellcheck]=0.11.0
        [archive.shellcheck_linux_x86_64]=https://x/a.tar.xz
        [downloads.shellcheck_linux_x86_64]="$(printf 'a%.0s' {1..64})"
        [downloads.x]="$(printf 'a%.0s' {1..64})"
        [images.redis]="redis:8@sha256:$(printf 'b%.0s' {1..64})"
    )

}
test:module:bundle:audit:manifest-accepts-pins () {

    fixture:module:bundle:audit:manifest
    module:bundle:audit:manifest

}
test:module:bundle:audit:manifest-refuses-loose-pins () {

    fixture:module:bundle:audit:manifest
    MANIFEST[tools.bash]=latest
    @errors 'not a pinned version' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[tools.bash]='^1.2.0'
    @errors 'not a pinned version' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[tools.bash]=0.0.0-20261113113407-e3970619a1a4
    module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[downloads.y]=deadbeef
    @errors 'not a SHA-256 digest' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[images.redis]='redis:8'
    @errors 'not pinned by digest' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[archive.trivy_linux_x86_64]='http://x/t.tar.gz'
    @errors 'needs an https URL and a digest' module:bundle:audit:manifest

}
test:module:bundle:audit:schema-refuses-secret-defaults () {

    local file="${TMPDIR}/schema.env"

    printf 'DB_PASSWORD=\nDB_USER=engine\n' > "${file}"
    module:bundle:audit:schema "${file}"

    printf 'DB_PASSWORD=sw0rdfish\n' > "${file}"
    @errors 'a secret default is never written' module:bundle:audit:schema "${file}"

}
test:module:bundle:audit:sources-refuse-secret-values () {

    local root="${TMPDIR}/sources"

    mkdir -p "${root}/core"
    printf 'core:cfg:token () {\n\n    core:cfg:set API_TOKEN "%s"\n\n}\n' "\${1}" > "${root}/core/cfg.sh"
    module:bundle:audit:sources "${root}"

    printf 'core:cfg:token () {\n\n    API_TOKEN="secretsecretsecret"\n\n}\n' > "${root}/core/cfg.sh"
    @errors 'a secret-shaped value in a source' module:bundle:audit:sources "${root}"

}
test:module:bundle:bench:samples-and-reports () {

    local line=""
    local -a samples=()

    mapfile -t samples < <(module:bundle:bench:samples 5 3 true)
    @eq "${#samples[@]}" 5

    [[ "${samples[0]}" =~ ^[0-9]+$ ]]

    line="$(module:bundle:bench:report demo 300 100 200 900 500)"

    @contains "${line}" 'p50=300ns'
    @contains "${line}" 'min=100ns'
    @contains "${line}" 'max=900ns'
    @contains "${line}" 'n=5'
    @contains "${line}" 'p50ns=300'
    @eq "$(module:bundle:bench:p50 "${line}")" 300
    @errors 'No p50ns' module:bundle:bench:p50 'demo p95=1'

    @errors 'No samples' module:bundle:bench:report demo
    @errors 'Bench subject failed' module:bundle:bench:samples 1 1 false

}
test:module:bundle:bench:scales-units () {

    @eq "$(module:bundle:bench:unit 999)" 'ns 1'
    @eq "$(module:bundle:bench:unit 20000)" 'µs 1000'
    @eq "$(module:bundle:bench:unit 20000000)" 'ms 1000000'
    @contains "$(@measure demo 10 2 true)" 'n=10'

}
test:module:bundle:bench:keeps-a-baseline () {

    local file="${TMPDIR}/baseline.tsv"

    module:bundle:bench:save "${file}" demo 'demo p50=1ns p50ns=100'
    module:bundle:bench:save "${file}" other 'other p50=1ns p25ns=40 p50ns=50 p75ns=60'
    module:bundle:bench:save "${file}" demo 'demo p50=1ns p25ns=110 p50ns=120 p75ns=130'

    @eq "$(cat "${file}")" $'other\t40\t50\t60\ndemo\t110\t120\t130'

    module:bundle:bench:compare "${file}" demo 'demo p50ns=130' 25
    @errors 'slower than the baseline' module:bundle:bench:compare "${file}" demo 'demo p25ns=190 p50ns=200 p75ns=210' 25
    @contains "$(module:bundle:bench:compare "${file}" demo 'demo p25ns=120 p50ns=200 p75ns=400' 25 2>&1)" 'inside the noise'

    printf 'legacy\t100\n' >> "${file}"
    @errors 'slower than the baseline' module:bundle:bench:compare "${file}" legacy 'legacy p50ns=200' 25
    module:bundle:bench:compare "${file}" unknown 'unknown p50ns=1' 25
    module:bundle:bench:compare "${TMPDIR}/none" demo 'demo p50ns=1' 25

}
test:module:bundle:boot:serves-the-tool-commands () {

    @eq "$(module:bundle:usage:handler hello)" module:bundle:hello
    @eq "$(module:bundle:usage:handler build)" module:gate:build
    @eq "$(module:bundle:usage:handler self)" module:bundle:self
    @eq "$(module:bundle:usage:handler check)" module:gate:kind
    @eq "$(module:bundle:usage:handler fuzz)" module:gate:kind
    @eq "$(module:bundle:usage:handler fetch)" module:bundle:fetch

}
test:module:bundle:boot:serves-changes () {

    @eq "$(module:bundle:usage:handler changes)" module:gate:changes
    @contains "$(module:bundle:usage:flags changes)" '--base|REF|'

}
test:module:bundle:boot:serves-the-gate () {

    @eq "$(module:bundle:usage:handler gate)" module:gate:run
    @eq "$(module:bundle:usage:handler lint)" module:gate:kind
    @errors 'lint does not take --type' bash "${TOOL_BIN}" lint --type x
    @errors 'self build|check|lint|test|bench|fuzz|audit' bash "${TOOL_BIN}" self nope
    @contains "$(module:bundle:usage:flags gate)" '--type|T|'
    @contains "$(module:bundle:usage:flags gate)" '--path|P|'
    @contains "$(module:bundle:usage:flags test)" '--only-changed||'

}
test:module:bundle:boot:serves-the-distribution () {

    @eq "$(module:bundle:usage:handler extract)" module:extract:extract
    @eq "$(module:bundle:usage:handler push)" ''
    @eq "$(module:bundle:usage:handler sync)" ''
    @contains "$(module:bundle:usage:flags extract)" '--to|DIR|'
    @contains "$(module:bundle:usage:flags extract)" '--tag|T|'
    @contains "$(module:bundle:usage:flags extract)" '--release||'
    @contains "$(module:bundle:usage:flags extract)" '--no-gates||'

}
test:module:bundle:boot:routes-every-registered-command () {

    local name="" handler=""

    while IFS= read -r name; do
        handler="$(module:bundle:usage:handler "${name}")"
        declare -F "${handler}" >/dev/null || { @err "${name} routes to a missing ${handler}"; return; }
    done < <(module:bundle:usage:names)

}
test:module:bundle:boot:commands-are-the-recorded-surface () {

    local recorded="hello checksum fetch self help version config meta system notify gate changes toolchains build run install update remove deps check lint test safety audit semver quality security bench fuzz targets extract"

    @eq "$(module:bundle:usage:names | tr '\n' ' ' | sed 's/ $//')" "${recorded}"

}
test:module:bundle:boot:global-flags-are-the-recorded-surface () {

    @eq "$(printf '%s\n' "${!UI_GLOBALS[@]}" | sort | tr '\n' ' ' | sed 's/ $//')" "--config --no-config --root -e"

}
test:module:bundle:boot:refuses-the-unknown () {

    @errors 'did you mean hello' bash "${TOOL_BIN}" hellp
    @errors 'does not take --list' bash "${TOOL_BIN}" hello --list
    @status 2 bash "${TOOL_BIN}" hellp
    @status 2 bash "${TOOL_BIN}" hello --list
    @errors 'Not a directory' bash "${TOOL_BIN}" --root "${TMPDIR}/nothing" hello

}
test:module:bundle:boot:serves-fetch () {

    @eq "$(module:bundle:usage:handler fetch)" module:bundle:fetch
    @eq "$(module:bundle:usage:handler build)" module:gate:build

}
test:module:bundle:boot:roots-at-the-repository () {

    local root="" bare="${TMPDIR}/bare"

    root="$(fixture:module:gate:repo)"
    mkdir -p "${bare}/deep"

    @contains "$(cd -- "${root}/engine/rust" && bash "${TOOL_BIN}" system 2>/dev/null)" "${root}/.infra"
    [[ ! -e "${root}/.infra/.gitignore" ]] || @err 'the lab still seals itself'
    @contains "$(cd -- "${bare}/deep" && bash "${TOOL_BIN}" system 2>/dev/null)" "${bare}/deep/.infra"
    @contains "$(cd -- "${bare}/deep" && bash "${TOOL_BIN}" --root "${bare}" system 2>/dev/null)" "${bare}/.infra"

}
test:module:bundle:boot:merges-the-project-manifest () {

    local root="" file="${TMPDIR}/other.toml" tool=o/selfx key=""

    root="$(fixture:module:gate:repo)"

    for key in "${!MANIFEST[@]}"; do

        [[ "${key}" == deps.*.type && "${MANIFEST[${key}]}" == engine && "${MANIFEST[${key%.type}.deps]:-0}" == 0 ]] || continue

        tool="${MANIFEST[${key%.type}.repo]:-${tool}}"

    done

    {
        printf '[deps]\n'
        printf 'selfx = { type = "engine", path = "engine/bash", repo = "%s" }\n' "${tool}"
        printf 'onex = { type = "engine", path = "engine/rust", repo = "o/onex", deps = [{ name = "engine", repo = "%s" }] }\n' "${tool}"
    } > "${root}/Infra.toml"

    {
        printf '[deps]\n'
        printf 'selfx = { type = "engine", path = "engine/bash", repo = "%s" }\n' "${tool}"
        printf 'twox = { type = "engine", path = "engine/go", repo = "o/twox", deps = [{ name = "engine", repo = "%s" }] }\n' "${tool}"
    } > "${file}"

    cd -- "${root}/engine/rust" || return

    @contains "$(NO_COLOR=1 bash "${TOOL_BIN}" targets 2>/dev/null)" onex
    @absent "$(NO_COLOR=1 bash "${TOOL_BIN}" --no-config targets 2>/dev/null)" onex
    @contains "$(NO_COLOR=1 bash "${TOOL_BIN}" --config "${file}" targets 2>/dev/null)" twox
    @absent "$(NO_COLOR=1 bash "${TOOL_BIN}" --config "${file}" targets 2>/dev/null)" onex
    @errors 'No such manifest' bash "${TOOL_BIN}" --config "${TMPDIR}/nope.toml" version

}
test:module:bundle:build:names-the-output () {

    @eq "$(module:bundle:build:output dev)" "${TOOL_ENGINE}/target/dev/$(config:meta:alias)"
    @eq "$(module:bundle:build:output release)" "${TOOL_ENGINE}/target/release/$(config:meta:alias)"
    @eq "$(module:bundle:build:current)" "${TOOL_BIN}"
    @errors 'Builds require the source checkout' module:bundle:build:dev
    TOOL_ENGINE="${TMPDIR}" @errors 'Regular file required' module:bundle:build:checksum

}
test:module:bundle:hello () {

    @eq "$(module:bundle:hello)" 'hello world'
    @eq "$(bash "${TOOL_BIN}" hello)" 'hello world'
    @eq "$(bash "${TOOL_BIN}" --version)" "$(module:bundle:view:version)"

}
test:module:bundle:install-guards () {

    local into="${TMPDIR}/bin" output="${TMPDIR}/release"

    CLI_VALUED=( [--alias]=true [--into]=true )
    CLI_FLAGS=( [--alias]=Gun )
    @errors 'An alias is a lowercase name' module:bundle:install
    @errors 'An alias is a lowercase name' module:bundle:build:alias

    CLI_FLAGS=( [--alias]=gun [--into]="${into}" )
    @eq "$(module:bundle:build:alias)" gun
    @eq "$(module:bundle:build:output release)" "${TOOL_ENGINE}/target/release/gun"

    module:bundle:install >/dev/null 2>&1 < /dev/null
    cmp -s "${TOOL_BIN}" "${into}/gun" || @err 'a bundle did not install itself'

    CLI_FLAGS=()
    @eq "$(module:bundle:build:alias)" "$(config:meta:alias)"

    CLI_FLAGS=( [--dev]=true [--release]=true )
    @errors '--dev and --release do not meet' module:bundle:build:pick

    CLI_FLAGS=()
    printf 'first\n' > "${output}"

    @errors 'No release bundle to install' module:bundle:install:place "${TMPDIR}/none" "${into}" tool true

    @eq "$(module:bundle:install:place "${output}" "${into}" tool true 2>/dev/null)" "${into}/tool"
    @eq "$(cat "${into}/tool")" first
    @eq "$(core:fs:file:mode "${into}/tool")" 755

    printf 'second\n' > "${output}"
    @errors 'exists already; pass --yes to replace it' module:bundle:install:place "${output}" "${into}" tool true < /dev/null
    @eq "$(cat "${into}/tool")" first

    module:bundle:install:place "${output}" "${into}" tool false >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${into}/tool")" second

    printf 'third\n' > "${output}"
    CLI_FLAGS=( [--yes]=true )
    module:bundle:install:place "${output}" "${into}" tool true >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${into}/tool")" third

}
test:module:bundle:update-rebuilds-the-installed-command () {

    local into="${TMPDIR}/bin" built="${TMPDIR}/built" source="${TMPDIR}/source" known=""

    known="$(config:meta:alias)"
    mkdir -p "${into}" "${source}/src"
    printf 'old\n' > "${into}/${known}"

    CLI_VALUED=( [--alias]=true [--into]=true )
    CLI_FLAGS=()

    module:bundle:build:pick () { printf 'new\n' > "${built}"; @print "${built}"; }

    TOOL_BUNDLED=false
    PATH="${into}:${PATH}"
    chmod 755 "${into}/${known}"

    module:bundle:update >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${into}/${known}")" new

    printf 'theirs\n' > "${into}/other"
    CLI_FLAGS=( [--alias]=other )
    @errors 'exists already; pass --yes to replace it' module:bundle:update < /dev/null
    @eq "$(cat "${into}/other")" theirs
    [[ -f "${into}/${known}" ]] || @err 'a refused update removed the installed command'

    CLI_FLAGS=( [--alias]=next )
    module:bundle:update >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${into}/next")" new
    [[ ! -e "${into}/${known}" ]] || @err 'the old name stayed after the update renamed the tool'

    CLI_FLAGS=( [--into]="${TMPDIR}/elsewhere" )
    module:bundle:update >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${TMPDIR}/elsewhere/${known}")" new

    TOOL_BUNDLED=true
    TOOL_BIN="${into}/next"
    MANIFEST[meta.build]=release
    MANIFEST[meta.src]="${source}"
    unset 'MANIFEST[meta.repo]'
    CLI_FLAGS=()

    printf 'printf "%%s\\n" "$*" > "%s/asked"\n' "${TMPDIR}" > "${source}/src/main.sh"
    module:bundle:update >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${TMPDIR}/asked")" "self install --alias next --into ${into} --yes"

    MANIFEST[meta.build]=dev
    module:bundle:update >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${TMPDIR}/asked")" "self install --alias next --into ${into} --yes --dev"
    MANIFEST[meta.build]=release

    CLI_FLAGS=( [--alias]=again )
    module:bundle:update >/dev/null 2>&1 < /dev/null
    @eq "$(cat "${TMPDIR}/asked")" "self install --alias again --into ${into}"
    [[ ! -e "${into}/next" ]] || @err 'the installed tool kept its old name'

    printf 'exit 7\n' > "${source}/src/main.sh"
    TOOL_BIN="${into}/again"
    CLI_FLAGS=()
    @errors "The update from ${source} failed" module:bundle:update

    rm -rf -- "${source}"
    @errors 'this build knows no source folder and no repository' module:bundle:update

    MANIFEST[meta.repo]=https://example.com/o/r
    @errors 'Remote install and update are not available yet (https://example.com/o/r)' module:bundle:update

    @contains "$(module:bundle:usage:flags self)" '--alias|NAME|'
    @contains "$(module:bundle:usage:flags self)" '--src|DIR|'
    @contains "$(module:bundle:usage:flags self)" '--repo|URL|'
    @contains "$(module:bundle:usage:flags self)" '--yes||'
    @eq "$(module:bundle:usage:handler install)" module:gate:install
    @eq "$(module:bundle:usage:handler remove)" module:gate:remove

}
test:module:bundle:remove-deletes-only-its-own-build () {

    local into="${TMPDIR}/bin" known=""

    known="$(config:meta:alias)"
    mkdir -p "${into}"
    printf '#!/usr/bin/env bash\nTOOL_BUNDLED=true\n' > "${into}/mine"
    printf '#!/usr/bin/env bash\necho other\n' > "${into}/theirs"

    TOOL_BIN="${into}/theirs"
    @errors 'is not a build of this tool; it stays' module:bundle:remove
    [[ -f "${into}/theirs" ]]

    TOOL_BIN="${into}/nothing"
    @errors 'No installed command at' module:bundle:remove

    TOOL_BIN="${into}/mine"
    module:bundle:remove 2>/dev/null
    [[ ! -e "${into}/mine" && -f "${into}/theirs" ]]

    TOOL_BUNDLED=false
    printf '#!/usr/bin/env bash\nTOOL_BUNDLED=true\n' > "${into}/${known}"
    chmod 755 "${into}/${known}"
    PATH="${into}:${PATH}"

    module:bundle:remove 2>/dev/null
    [[ ! -e "${into}/${known}" ]]

    @eq "$(module:bundle:usage:flags remove)" '--path|P|The directory of the tool, the working directory by default'

}
test:module:bundle:build-stamps-the-meta () {

    local dir="${TMPDIR}/elsewhere" tilde="~"

    mkdir -p "${dir}"
    CLI_VALUED=( [--src]=true [--repo]=true )

    CLI_FLAGS=()
    unset 'MANIFEST[meta.repo]'
    module:bundle:build:stamps release
    @eq "${PACK_STAMPS[meta.build]}" release
    @eq "${PACK_STAMPS[meta.src]}" "$(config:meta:src)"
    @eq "${PACK_STAMPS[meta.repo]:-none}" none

    CLI_FLAGS=( [--src]="${dir}" [--repo]=https://example.com/o/r )
    module:bundle:build:stamps dev
    @eq "${PACK_STAMPS[meta.build]}" dev
    @eq "${PACK_STAMPS[meta.src]}" "$(cd "${dir}" && pwd -P)"
    @eq "${PACK_STAMPS[meta.repo]}" https://example.com/o/r

    CLI_FLAGS=( [--src]="${TMPDIR}/nowhere" )
    @errors '--src names no folder' module:bundle:build:stamps release

    CLI_FLAGS=( [--repo]='not a repo' )
    @errors '--repo is a repository address' module:bundle:build:stamps release

    CLI_FLAGS=( [--repo]=owner/tool )
    module:bundle:build:stamps release
    @eq "${PACK_STAMPS[meta.repo]}" owner/tool

    @eq "$(config:meta:build)" dev
    MANIFEST[meta.install]="${tilde}/tools/bin"
    @eq "$(config:meta:install)" "${HOME}/tools/bin"
    unset 'MANIFEST[meta.install]'
    @eq "$(XDG_BIN_HOME=/x/bin config:meta:install)" /x/bin

    @contains "$(NO_COLOR=1 bash "${TOOL_BIN}" meta)" 'src'
    @contains "$(grep -c "\['meta.build'\]='dev'" "${TOOL_BIN}")" 1

}
test:module:bundle:expect:compares () {

    @eq a a
    @errors "Expected 'b' but got 'a'" @eq a b
    @contains hello ell
    @errors "Missing 'x'" @contains hello x
    @absent hello x
    @errors "Unexpected 'ell'" @absent hello ell

}
test:module:bundle:expect:judges-runs () {

    @status 0 true
    @status 3 bash -c 'exit 3'
    @fails false
    @errors 'Expected failure' @fails true
    @errors 'broken' core:error:fail broken
    @errors 'Expected failure' @errors x true

}
test:module:bundle:expect:discovers () {

    @contains "$(module:bundle:expect:discover test:module:bundle:expect:)" test:module:bundle:expect:discovers
    @eq "$(module:bundle:expect:discover nothing:)" ''

}
fixture:module:bundle:fuzz:crash () {

    return 3

}
fixture:module:bundle:fuzz:hang () {

    sleep 30

}
fixture:module:bundle:fuzz:fine () {

    [[ -f "${1}" ]]

}
fixture:module:bundle:fuzz:broken () {

    local -A table=()
    local key=""

    table["${key}"]=1

}
test:module:bundle:fuzz:loop-names-crash-and-hang () {

    local input="${TMPDIR}/input" status=0 result=""

    result="$(module:bundle:fuzz:loop fixture:module:bundle:fuzz:crash "${input}" 5 0)" || status=$?
    @eq "${status} ${result}" '2 0 exit-3'

    status=0
    result="$(core:proc:timeout 2 module:bundle:fuzz:loop fixture:module:bundle:fuzz:hang "${input}" 1 0)" || status=$?
    @eq "${status}" 124

    result="$(module:bundle:fuzz:loop fixture:module:bundle:fuzz:fine "${input}" 1 0)"
    [[ "${result}" =~ ^[1-9][0-9]*\ 0$ ]]

    @eq "$(module:bundle:fuzz:loop fixture:module:bundle:fuzz:fine "${input}" 0 25)" '25 0'

    status=0
    result="$(module:bundle:fuzz:loop fixture:module:bundle:fuzz:broken "${input}" 5 0)" || status=$?
    @eq "${status} ${result}" '2 0 bash-error'

}
test:module:bundle:help:prints () {

    @contains "$(bash "${TOOL_BIN}" help extract)" '--to DIR'
    @contains "$(bash "${TOOL_BIN}" help)" 'Commands'
    @contains "$(bash "${TOOL_BIN}" --help self)" '--shuffle'
    @contains "$(bash "${TOOL_BIN}" help hello)" 'Say hello world'
    @absent "$(bash "${TOOL_BIN}" help hello)" 'Flags'
    @errors 'did you mean' bash "${TOOL_BIN}" help hellp

}
fixture:module:bundle:law:tree () {

    local root="${TMPDIR}/tree"

    mkdir -p "${root}/src/core" "${root}/src/app" "${root}/tests" "${root}/benches" "${root}/fuzz"

    printf 'core:log:say () {\n\n    out "%s"\n\n}\n' "\${1}" > "${root}/src/core/log.sh"
    printf 'app:hello:world () {\n\n    core:log:say hi\n\n}\n' > "${root}/src/app/hello.sh"
    printf 'app:boot:main () {\n\n    app:hello:world\n\n}\n' > "${root}/src/app/boot.sh"
    printf 'notes () {\n\n    out ignored\n\n}\n' > "${root}/tests/helper.sh"

    fixture:module:bundle:law:proofs "${root}" core:log log core:log:say
    fixture:module:bundle:law:proofs "${root}" app:hello hello app:hello:world
    fixture:module:bundle:law:proofs "${root}" app:boot boot app:boot:main

    @print "${root}"

}
fixture:module:bundle:law:proofs () {

    local root="${1}" prefix="${2}" name="${3}" call="${4}"

    printf 'test:%s:works () {\n\n    %s hi\n\n}\n' "${prefix}" "${call}" > "${root}/tests/${name}.test.sh"
    printf 'bench:%s:works () {\n\n    %s hi\n\n}\n' "${prefix}" "${call}" > "${root}/benches/${name}.bench.sh"
    printf 'fuzz:%s:works () {\n\n    %s hi\n\n}\n' "${prefix}" "${call}" > "${root}/fuzz/${name}.fuzz.sh"

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
    @eq "$(module:bundle:law:prefix src/app/boot.sh)" app:boot
    @eq "$(module:bundle:law:prefix src/app/index.sh)" ''
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
    fixture:module:bundle:law:proofs "${root}" app:again again app:again:world
    @errors 'already defined' module:bundle:law:check "${root}"

}
test:module:bundle:law:demands-a-test-per-domain () {

    local root=""

    root="$(fixture:module:bundle:law:tree)"

    rm -f -- "${root}/tests/hello.test.sh"
    @errors 'no test:app:hello:* case and no #cfg[test] function' module:bundle:law:check "${root}"

    printf '#cfg[test]\napp:hello:world:proves () {\n\n    app:hello:world\n\n}\n' >> "${root}/src/app/hello.sh"
    module:bundle:law:check "${root}"

    rm -f -- "${root}/benches/boot.bench.sh"
    @errors 'no bench:app:boot:* case and no #cfg[bench] function' module:bundle:law:check "${root}"
    fixture:module:bundle:law:proofs "${root}" app:boot boot app:boot:main

    rm -f -- "${root}/fuzz/log.fuzz.sh"
    @errors 'no fuzz:core:log:* case and no #cfg[fuzz] function' module:bundle:law:check "${root}"
    fixture:module:bundle:law:proofs "${root}" core:log log core:log:say

    printf 'test:app:boot:stray () {\n\n    app:boot:main\n\n}\n' > "${root}/tests/extra.test.sh"
    @errors 'test:app:boot:stray lives in tests/boot.test.sh; one proof file per domain' module:bundle:law:check "${root}"

    printf 'fuzz:app:nothing:here () {\n\n    app:boot:main\n\n}\n' > "${root}/tests/extra.test.sh"
    printf 'fuzz:app:nothing:here () {\n\n    app:boot:main\n\n}\n' > "${root}/fuzz/nothing.fuzz.sh"
    rm -f -- "${root}/tests/extra.test.sh"
    @errors 'fuzz:app:nothing:here proves no domain of the source' module:bundle:law:check "${root}"
    rm -f -- "${root}/fuzz/nothing.fuzz.sh"

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
    fixture:module:bundle:law:proofs "${root}" module:gate gate '@say'
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
test:module:bundle:law:checks-syntax () {

    local root="${TMPDIR}/tree"

    mkdir -p "${root}/src" "${root}/tests" "${root}/benches" "${root}/fuzz"
    printf 'x () {\n\n    out ok\n\n}\n' > "${root}/src/ok.sh"
    module:bundle:syntax "${root}"

    printf 'x () {\n' > "${root}/tests/broken.sh"
    @errors 'Syntax check failed' module:bundle:syntax "${root}"

}
test:module:bundle:pack:release-excludes-tests () {

    local engine="${INFRA_ENGINE:-}" output="${TMPDIR}/release/infra"

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }

    module:bundle:pack:create "${engine}" "${output}" release src src/main.sh tests bash.toml .env.example
    @absent "$(cat "${output}")" 'test:module:bundle:pack:release-excludes-tests ()'
    @absent "$(cat "${output}")" 'core:fs:file:hash:agrees-with-the-tool ()'
    @eq "$(bash "${output}" hello)" 'hello world'
    @errors 'Release bundles exclude tests' bash "${output}" self test
    @errors 'Unknown bundle mode' module:bundle:pack:create "${engine}" "${output}" other src src/main.sh tests

}
test:module:bundle:pack:embeds-assets-byte-for-byte () {

    local root="${TMPDIR}/assets" script=""

    mkdir -p "${root}"
    printf 'no newline' > "${root}/a.txt"
    printf 'with newline\n' > "${root}/b.txt"

    script="$(module:bundle:pack:assets "${root}" a.txt b.txt)"
    source <(printf '%s\n' "${script}")

    @eq "$(bundle:asset a.txt)" 'no newline'
    @eq "$(bundle:asset b.txt | wc -c | tr -d ' ')" 13
    @eq "$(bundle:assets | tr '\n' ' ')" 'a.txt b.txt '
    @errors 'Invalid asset name' module:bundle:pack:assets "${root}" ../a.txt

}
test:module:bundle:pack:strips-cfg-blocks () {

    @eq "$(printf 'a () {\n\n    :\n\n}\n#cfg[test]\nb () {\n\n    :\n\n}\nc () {\n\n    :\n\n}\n' | module:bundle:pack:strip | grep -c ' () {')" 2
    @eq "$(printf 'x=1\n' | module:bundle:pack:strip)" 'x=1'

}
test:module:bundle:pack:strips-the-entry () {

    local entry="${TMPDIR}/main.sh"

    printf '#!/usr/bin/env bash\nset -o errexit\nsource x\nrun "$@"\n' > "${entry}"
    @eq "$(module:bundle:pack:entry "${entry}")" 'run "$@"'

}
test:module:bundle:pack:embeds-the-parsed-data () {

    local engine="${INFRA_ENGINE:-}" key="" code=""
    local -A parsed=() inlined=() pairs=()
    local -a order=()

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }
    declare -F bundle:manifest >/dev/null || { @err "The test runs inside the bundle"; return; }

    core:parse:toml parsed "${engine}/bash.toml"
    bundle:manifest inlined

    @eq "${inlined[meta.build]}" dev
    @eq "${inlined[meta.src]}" "${engine}"

    unset 'inlined[meta.build]' 'inlined[meta.src]'

    @eq "${#inlined[@]}" "${#parsed[@]}" 'every manifest key is embedded'

    for key in "${!parsed[@]}"; do
        @eq "${inlined[${key}]-missing}" "${parsed[${key}]}" "manifest ${key}"
    done

    bundle:schema pairs order
    @contains " ${order[*]} " ' LOG_LEVEL '

    code="$(module:bundle:pack:pair odd $'it\'s "q" $(x) \\ \n line')"

    declare -gA FIXTURE_PAIR=()
    source <(printf '%s\n' "FIXTURE_PAIR=(" "${code}" ")")

    @eq "${FIXTURE_PAIR[odd]}" $'it\'s "q" $(x) \\ \n line'
    @errors 'cannot be embedded' module:bundle:pack:pair "a'b" x

}
test:module:bundle:assets-match () {

    local name="" engine="${INFRA_ENGINE:-}"

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }
    declare -F bundle:asset >/dev/null || { @err "The test runs inside the bundle"; return; }

    while IFS= read -r name; do
        @eq "$(bundle:asset "${name}")" "$(cat "${engine}/${name}")" "asset ${name}"
    done < <(bundle:assets)

    @eq "$(bundle:assets | wc -l | tr -d ' ')" 2

}
test:module:bundle:sources-match () {

    local name="" engine="${INFRA_ENGINE:-}" count=0

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }

    while IFS= read -r name; do

        [[ -f "${engine}/src/${name}" ]] || { @err "embedded ${name} has no file"; return; }
        count=$(( count + 1 ))

    done < <(bundle:sources)

    @eq "${count}" "$(find "${engine}/src" -name '*.sh' -not -path '*/src/main.sh' -not -path "*/${LAW_FIRST}" | wc -l | tr -d ' ')"

}
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
test:module:bundle:usage:keeps-one-arity-per-flag () {

    @errors 'takes a value in one command and none in another' module:bundle:usage:flag gate '--path' 'A plain switch with the name of a valued one'
    module:bundle:usage:flag gate '--path P' 'The same arity twice is fine'

}
test:module:bundle:usage:keeps-raw-arguments () {

    @eq "${CLI_RAW[build]:-}" 1
    @eq "${CLI_RAW[run]:-}" 1
    @eq "${CLI_RAW[gate]:-}" ''
    @errors 'Raw arguments for an unknown command: nope' module:bundle:usage:raw nope

}
test:module:bundle:test:lists-and-isolates () {

    @contains "$(module:bundle:test:list)" test:module:bundle:test:lists-and-isolates
    @errors 'Unknown test: nope' module:bundle:test:isolate nope
    @errors 'Unknown test: test:no:such' module:bundle:test:isolate test:no:such
    @eq "$(module:bundle:test:isolate test:app:hello:world)" ''

}
test:module:bundle:test:runs-through-the-bundle () {

    @contains "$(bash "${TOOL_BIN}" self test --list bundle:hello)" test:module:bundle:hello
    @contains "$(bash "${TOOL_BIN}" self test bundle:hello 2>&1)" 'pass test:module:bundle:hello'
    @errors 'No tests matched: zzz' bash "${TOOL_BIN}" self test zzz

}
test:module:bundle:test:refuses-from-a-bundle () {

    @errors 'Benches run from the source checkout' module:bundle:bench:run
    @errors 'Fuzz runs from the source checkout' module:bundle:fuzz:run 1
    @errors 'Audit runs from the source checkout' module:bundle:audit:run
    @errors 'Seconds must be a positive number' bash "${TOOL_BIN}" self fuzz zero

}
fixture:module:bundle:tool:fake () {

    local name="${1}" version="${2}" home=""

    home="$(module:bundle:tool:home)"
    mkdir -p "${home}"
    printf '#!/usr/bin/env bash\nprintf "%s version %s (release)\\n"\n' "${name}" "${version}" > "${home}/${name}"
    chmod 755 "${home}/${name}"

}
test:module:bundle:tool:reads-versions () {

    fixture:module:bundle:tool:fake shellcheck 0.11.0
    fixture:module:bundle:tool:fake trivy v9.9.9

    @eq "$(module:bundle:tool:version "$(module:bundle:tool:home)/shellcheck")" 0.11.0
    @eq "$(module:bundle:tool:version "$(module:bundle:tool:home)/trivy")" 9.9.9
    module:bundle:tool:pinned shellcheck
    @errors 'trivy 9.9.9 is not the pinned' module:bundle:tool:pinned trivy

    printf '#!/usr/bin/env bash\nprintf "nothing\\n"\n' > "$(module:bundle:tool:home)/trivy"
    @errors 'Version unreadable' module:bundle:tool:pinned trivy

}
test:module:bundle:tool:finds-and-lists () {

    @eq "$(module:bundle:tool:home)" "${TOOL_LAB}/tools"
    @errors 'Unknown tool: nope' module:bundle:tool:binary nope
    @errors 'Unknown tool: nope' module:bundle:install:tool nope

    fixture:module:bundle:tool:fake zizmor 1.32.0
    @eq "$(module:bundle:tool:binary zizmor)" "$(module:bundle:tool:home)/zizmor"
    @eq "$(module:bundle:tool:run zizmor --flag)" 'zizmor version 1.32.0 (release)'

}
test:module:bundle:tool:runs-a-pinned-package () {

    @eq "$(config:tools:get prettier runner)" bunx
    @eq "$(config:tools:version prettier)" "${MANIFEST[tools.prettier.version]}"
    PATH=/nonexistent @fails module:bundle:tool:ready prettier
    @fails module:bundle:tool:ready no-such-tool

}
test:module:bundle:view:prints-config () {

    @contains "$(bash "${TOOL_BIN}" config)" 'LOG_LEVEL'
    @eq "$(bash "${TOOL_BIN}" config LOG_LEVEL)" info
    @eq "$(bash "${TOOL_BIN}" -e LOG_LEVEL=warn config --changed | tr -s ' ')" ' LOG_LEVEL warn (cli)'
    @errors 'config [KEY]' bash "${TOOL_BIN}" config A B

}
test:module:bundle:bash:compares-versions () {

    module:bundle:bash:enough 5.2 5.2
    module:bundle:bash:enough 5.2 5.3
    module:bundle:bash:enough 4.4 5.0
    module:bundle:bash:enough 5 5.0
    @fails module:bundle:bash:enough 5.3 5.2
    @fails module:bundle:bash:enough 6.0 5.9
    @fails module:bundle:bash:enough 5.2 3.2
    @fails module:bundle:bash:enough 5.2 garbage
    module:bundle:bash:enough '' 3.2
    module:bundle:bash:enough 'not a version' 3.2
    module:bundle:bash:enough 5..2 3.2

}
test:module:bundle:bash:reads-the-manifest-and-finds-a-shell () {

    local dir="${TMPDIR}/engine" path=""

    mkdir -p "${dir}"
    printf '[meta]\nname = "x"\nbash_version = "5.1"\n' > "${dir}/BASH.toml"

    @eq "$(module:bundle:bash:wanted "${dir}")" 5.1
    @eq "$(module:bundle:bash:wanted "${TMPDIR}")" ''

    path="$(module:bundle:bash:find 5.0)"
    [[ -x "${path}" ]]
    @fails module:bundle:bash:find 99.0

    module:bundle:bash:ensure "${dir}" "${TMPDIR}/none.sh"
    module:bundle:bash:ensure 3.2 "${TMPDIR}/none.sh"

    @eq "$(sed -n 3p "${TOOL_BIN}")" 'module:bundle:bash:wanted () {'
    @contains "$(grep -m 1 "^module:bundle:bash:ensure '" "${TOOL_BIN}")" "module:bundle:bash:ensure '${MANIFEST[meta.bash_version]}'"

}
test:module:bundle:bash:stays-within-the-old-shell () {

    local file="${INFRA_ENGINE:-}/src/${LAW_FIRST}" text=""

    [[ -f "${file}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }

    text="$(cat "${file}")"

    @absent "${text}" 'declare -'
    @absent "${text}" 'local -'
    @absent "${text}" 'mapfile'
    @absent "${text}" '[['
    @absent "${text}" '(('
    @absent "${text}" ',,}'
    @absent "${text}" '^^}'
    @absent "${text}" '&>'
    @absent "${text}" 'core:'
    @absent "${text}" 'config:'

}
test:module:bundle:bench:writes-the-report () {

    local line="" row="" out="${TMPDIR}/deep/report.json"

    line="$(module:bundle:bench:report 'a label' 300 100 200 400 500)"
    row="$(module:bundle:bench:row bench:core:str:trim core:str "${line}")"

    @eq "$(module:bundle:bench:member bench:module:gate:types:all)" module:gate
    @contains "${row}" '"name":"bench:core:str:trim"'
    @contains "${row}" '"label":"a label"'
    @contains "${row}" '"n":5'
    @contains "${row}" '"min":100'
    @contains "${row}" '"max":500'
    @contains "${row}" '"mean":300'

    mkdir -p "${out%/*}"
    module:bundle:bench:document "${row}" "${row}" > "${out}"

    @contains "$(cat "${out}")" "\"tool\": \"${MANIFEST[meta.name]}\""
    @contains "$(cat "${out}")" '"unit": "ns"'
    @eq "$(grep -c '"name":"bench:core:str:trim"' "${out}")" 2
    @eq "$(tail -n 2 "${out}" | tr -d ' \n')" ']}'

    @contains "$(module:bundle:usage:flags self)" '--out|FILE|'
    @contains "$(module:bundle:usage:flags self)" '--count|N|'

}
test:module:bundle:load:refuses-a-bad-path () {

    @errors 'Invalid module name' module:bundle:load:use 'Core::Log'
    @errors 'Invalid module name' module:bundle:load:use 'core/log'
    @errors 'Invalid module name' module:bundle:load:use '::core'
    @errors 'Nothing to use as core::nothing' module:bundle:load:use core::nothing
    module:bundle:load:resolve core
    @eq "${LOAD_PATH}" core/index.sh
    module:bundle:load:resolve core/log
    @eq "${LOAD_PATH}" core/log.sh
    module:bundle:load:resolve module/gate
    @eq "${LOAD_PATH}" module/gate/index.sh

}
test:module:bundle:load:lists-a-folder () {

    @contains "$(module:bundle:load:list core)" core/log.sh
    @absent "$(module:bundle:load:list core)" app/
    @errors 'Invalid source folder' module:bundle:load:list 'core/'

}
test:module:bundle:load:loads-once () {

    @use core::log
    @use module::gate
    @eq "${LOAD_STATE[core/log.sh]} ${LOAD_STATE[module/gate/index.sh]}" 'loaded loaded'

}
