fixture:core:process:flaky () {

    local script="${TMPDIR}/flaky.sh"

    cat > "${script}" <<'FLAKY'
#!/usr/bin/env bash
count=0
[[ ! -f "${1}" ]] || count="$(cat "${1}")"
count=$(( count + 1 ))
printf %s "${count}" > "${1}"
(( count >= ${2} ))
FLAKY
    chmod 755 "${script}"

    @print "${script}"

}
fixture:core:process:echo () {

    local line=""

    read -r line

    @print "got ${line}"

}
fixture:core:process:hang () {

    sleep 30

}
test:core:process:enforces-a-budget () {

    @status 124 core:process:timeout 1 sleep 5
    core:process:timeout 5 true
    @status 7 core:process:timeout 5 bash -c 'exit 7'
    @errors 'positive number of seconds' core:process:timeout 0 true
    @errors 'positive number of seconds' core:process:seconds abc Seconds
    @errors 'A command is required' core:process:timeout 5

}
test:core:process:budgets-a-function () {

    @eq "$(printf 'in\n' | core:process:timeout 5 fixture:core:process:echo)" 'got in'
    @eq "$(core:process:timeout 5 core:pkg:plan apt refresh | tr '\n' ' ')" 'apt-get update -qq '
    @status 124 core:process:timeout 1 fixture:core:process:hang

}
fixture:core:process:tree () {

    local script="${TMPDIR}/tree.sh"

    cat > "${script}" <<'TREE'
#!/usr/bin/env bash
[[ "${2:-}" != stubborn ]] || trap '' TERM
sleep 30 &
printf '%s\n' "$!" > "${1}"
wait
TREE
    chmod 755 "${script}"

    @print "${script}"

}
test:core:process:stops-the-whole-group () {

    local pids="${TMPDIR}/pids" tree=""

    tree="$(fixture:core:process:tree)"

    @status 124 core:process:timeout 1 "${tree}" "${pids}"
    @fails core:process:alive "$(cat "${pids}")"

    PROCESS_GRACE=1

    @status 124 core:process:timeout 1 "${tree}" "${pids}" stubborn
    @fails core:process:alive "$(cat "${pids}")"
    @eq "${#PROCESS_GROUPS[@]}" 0 'no group left registered'

}
test:core:process:backs-off-with-jitter () {

    local delay="" attempt=0

    @eq "$(core:process:backoff 0 5)" 0.000

    for attempt in 1 2 3; do

        delay="$(core:process:backoff 2 "${attempt}")"
        delay=$(( 10#${delay/./} ))

        (( delay >= 500 * (1 << attempt) && delay <= 1000 * (1 << attempt) ))

    done

    delay="$(core:process:backoff 60 12)"
    delay=$(( 10#${delay/./} ))

    (( delay >= 30000 && delay <= 60000 ))

    @errors 'Backoff needs' core:process:backoff x 1

}
test:core:process:retries-then-succeeds () {

    local counter="${TMPDIR}/counter"

    core:process:retry 3 0 "$(fixture:core:process:flaky)" "${counter}" 2
    @eq "$(cat "${counter}")" 2

}
test:core:process:gives-up-after-the-tries () {

    local counter="${TMPDIR}/counter"

    @errors 'failed after 2 attempts' core:process:retry 2 0 "$(fixture:core:process:flaky)" "${counter}" 5
    @eq "$(cat "${counter}")" 2
    @errors 'positive count' core:process:retry 0 0 true
    @errors 'number of seconds' core:process:retry 1 x true

}
test:core:process:io-reads-the-settings () {

    local counter="${TMPDIR}/counter"

    CONFIG[RUN_RETRIES]=2
    CONFIG[RUN_BACKOFF]=0
    CONFIG[RUN_TIMEOUT]=5

    core:process:io "$(fixture:core:process:flaky)" "${counter}" 2
    @eq "$(cat "${counter}")" 2

    CONFIG[RUN_TIMEOUT]=1

    @status 124 core:process:io sleep 10
    @errors 'sleep failed after 2 attempts' core:process:io sleep 10

}
test:core:process:spawns-and-stops () {

    local pid=""

    pid="$(core:process:spawn sleep 30)"
    core:process:alive "${pid}"
    core:process:stop "${pid}" 2
    @fails core:process:alive "${pid}"
    @errors 'Not a pid' core:process:wait abc
    @errors 'A command is required' core:process:spawn
    @errors 'Not a process name' core:process:find 'a b'
    @errors 'Not a process group' core:process:group:stop 1
    @fails core:process:group:alive 0

}
test:core:process:runs-within-a-directory () {

    mkdir -p "${TMPDIR}/inside"

    @eq "$(core:process:within "${TMPDIR}/inside" pwd -P)" "$(cd -- "${TMPDIR}/inside" && pwd -P)"
    @eq "${PWD}" "$(pwd)" 'the caller stays where it was'
    @errors 'Not a directory' core:process:within "${TMPDIR}/none" pwd
    @errors 'A command is required' core:process:within "${TMPDIR}/inside"

}
