test:module:bundle:pack:release-excludes-tests () {

    local engine="${INFRA_ENGINE:-}" output="${TMPDIR}/release/infra"

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }

    module:bundle:pack:create "${engine}" "${output}" release src src/main.sh tests infra.toml .env.example
    @absent "$(cat "${output}")" 'test:module:bundle:pack:release-excludes-tests ()'
    @absent "$(cat "${output}")" 'core:fs:file:hash:agrees-with-the-tool ()'
    @eq "$(bash "${output}" hello)" 'hello world'
    @errors 'Release bundles exclude tests' bash "${output}" test
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
