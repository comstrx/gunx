test:core:gh:speaks-to-actions () {

    local summary="${TMPDIR}/summary.md" list="${TMPDIR}/list"

    @fails core:gh:actions
    GITHUB_ACTIONS=true core:gh:actions

    printf 'lost\n' | core:gh:summary
    printf 'one\n' | GITHUB_STEP_SUMMARY="${summary}" core:gh:summary
    printf 'two\n' | GITHUB_STEP_SUMMARY="${summary}" core:gh:summary
    @eq "$(cat "${summary}")" $'one\ntwo'

    core:gh:path /x/bin
    GITHUB_PATH="${list}" core:gh:path /x/bin
    @eq "$(cat "${list}")" /x/bin
    GITHUB_PATH="${TMPDIR}/none/list" @errors 'Cannot extend GITHUB_PATH' core:gh:path /x/bin

    @eq "$(core:gh:base)" https://api.github.com
    @eq "$(core:gh:base git.example.com)" https://git.example.com/api/v3

}
test:core:gh:makes-a-repository-exist () {

    local bare="${TMPDIR}/made.git"

    CONFIG[RUN_RETRIES]=1

    @fails core:git:reachable "${bare}"
    @contains "$(core:gh:ensure "${bare}" 2>&1)" 'creating the private repository'
    core:git:reachable "${bare}"
    @eq "$(core:gh:ensure "${bare}" 2>&1)" ''

    @errors 'Not a hosted repository' core:gh:create /srv/x.git
    @eq "$(PATH=/nonexistent core:gh:token 2>&1 || true)" '[-] GIT_TOKEN is not set and gh is not installed'
    @eq "$(GIT_TOKEN=held PATH=/nonexistent core:git:token)" held

}
test:core:gh:releases-a-tag-once () {

    local calls="${TMPDIR}/calls"

    @eq "$(core:gh:hosted github.com/owner/name | tr '\t' ' ')" 'github.com owner/name'
    @errors 'Not a hosted repository' core:gh:hosted /srv/x.git
    @errors 'Not a hosted repository' core:gh:hosted 'github.com/ow ner/name'
    @errors 'Not a hosted repository' core:gh:hosted github.com/owner
    @fails core:gh:released /srv/x.git v1.0.0
    @errors 'A release needs a hosted repository' core:gh:release /srv/x.git v1.0.0
    @errors 'Not a tag name' core:gh:release github.com/owner/name 'bad tag'

    core:gh:api () { printf '%s %s %s\n' "${1}" "${2}" "${3}" >> "${calls}"; [[ "${1}" == POST ]]; }

    core:gh:release github.com/owner/name v1.2.3 'notes of the tag'
    @contains "$(cat "${calls}")" 'GET /repos/owner/name/releases/tags/v1.2.3'
    @contains "$(cat "${calls}")" 'POST /repos/owner/name/releases {"tag_name":"v1.2.3","name":"v1.2.3","body":"notes of the tag"}'

    core:gh:release github.com/owner/name v1.2.4
    @contains "$(cat "${calls}")" '"tag_name":"v1.2.4","name":"v1.2.4","generate_release_notes":true'

    core:gh:api () { [[ "${1}" == GET ]]; }

    core:gh:released github.com/owner/name v1.2.3
    @errors 'already has the release v1.2.3' core:gh:release github.com/owner/name v1.2.3

}
