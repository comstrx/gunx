test:module:bundle:pack:release-excludes-tests () {

    local engine="${INFRA_ENGINE:-}" output="${TMPDIR}/release/infra"

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }

    module:bundle:pack:create "${engine}" "${output}" release src src/main.sh tests infra.toml .env.example
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

    core:parse:toml parsed "${engine}/infra.toml"
    bundle:manifest inlined

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

    @eq "${count}" "$(find "${engine}/src" -name '*.sh' -not -path '*/src/main.sh' | wc -l | tr -d ' ')"

}
