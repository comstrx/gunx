fixture:core:proc:flaky () {

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
fixture:core:proc:echo () {

    local line=""

    read -r line

    @print "got ${line}"

}
fixture:core:proc:hang () {

    sleep 30

}
test:core:proc:enforces-a-budget () {

    @status 124 core:proc:timeout 1 sleep 5
    core:proc:timeout 5 true
    @status 7 core:proc:timeout 5 bash -c 'exit 7'
    @errors 'positive number of seconds' core:proc:timeout 0 true
    @errors 'positive number of seconds' core:proc:seconds abc Seconds
    @errors 'A command is required' core:proc:timeout 5

}
test:core:proc:budgets-a-function () {

    @eq "$(printf 'in\n' | core:proc:timeout 5 fixture:core:proc:echo)" 'got in'
    @eq "$(core:proc:timeout 5 core:pkg:plan apt refresh | tr '\n' ' ')" 'apt-get update -qq '
    @status 124 core:proc:timeout 1 fixture:core:proc:hang

}
fixture:core:proc:tree () {

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
test:core:proc:stops-the-whole-group () {

    local pids="${TMPDIR}/pids" tree=""

    tree="$(fixture:core:proc:tree)"

    @status 124 core:proc:timeout 1 "${tree}" "${pids}"
    @fails core:proc:alive "$(cat "${pids}")"

    PROC_GRACE=1

    @status 124 core:proc:timeout 1 "${tree}" "${pids}" stubborn
    @fails core:proc:alive "$(cat "${pids}")"
    @eq "${#PROC_GROUPS[@]}" 0 'no group left registered'

}
test:core:proc:backs-off-with-jitter () {

    local delay="" attempt=0

    @eq "$(core:proc:backoff 0 5)" 0.000

    for attempt in 1 2 3; do

        delay="$(core:proc:backoff 2 "${attempt}")"
        delay=$(( 10#${delay/./} ))

        (( delay >= 500 * (1 << attempt) && delay <= 1000 * (1 << attempt) ))

    done

    delay="$(core:proc:backoff 60 12)"
    delay=$(( 10#${delay/./} ))

    (( delay >= 30000 && delay <= 60000 ))

    @errors 'Backoff needs' core:proc:backoff x 1

}
test:core:proc:retries-then-succeeds () {

    local counter="${TMPDIR}/counter"

    core:proc:retry 3 0 "$(fixture:core:proc:flaky)" "${counter}" 2
    @eq "$(cat "${counter}")" 2

}
test:core:proc:gives-up-after-the-tries () {

    local counter="${TMPDIR}/counter"

    @errors 'failed after 2 attempts' core:proc:retry 2 0 "$(fixture:core:proc:flaky)" "${counter}" 5
    @eq "$(cat "${counter}")" 2
    @errors 'positive count' core:proc:retry 0 0 true
    @errors 'number of seconds' core:proc:retry 1 x true

}
test:core:proc:io-reads-the-settings () {

    local counter="${TMPDIR}/counter"

    CONFIG[RUN_RETRIES]=2
    CONFIG[RUN_BACKOFF]=0
    CONFIG[RUN_TIMEOUT]=5

    core:proc:io "$(fixture:core:proc:flaky)" "${counter}" 2
    @eq "$(cat "${counter}")" 2

    CONFIG[RUN_TIMEOUT]=1

    @status 124 core:proc:io sleep 10
    @errors 'sleep failed after 2 attempts' core:proc:io sleep 10

}
test:core:proc:spawns-and-stops () {

    local pid=""

    pid="$(core:proc:spawn sleep 30)"
    core:proc:alive "${pid}"
    core:proc:stop "${pid}" 2
    @fails core:proc:alive "${pid}"
    @errors 'Not a pid' core:proc:wait abc
    @errors 'A command is required' core:proc:spawn
    @errors 'Not a process name' core:proc:find 'a b'
    @errors 'Not a process group' core:proc:group:stop 1
    @fails core:proc:group:alive 0

}
test:core:proc:runs-within-a-directory () {

    mkdir -p "${TMPDIR}/inside"

    @eq "$(core:proc:within "${TMPDIR}/inside" pwd -P)" "$(cd -- "${TMPDIR}/inside" && pwd -P)"
    @eq "${PWD}" "$(pwd)" 'the caller stays where it was'
    @errors 'Not a directory' core:proc:within "${TMPDIR}/none" pwd
    @errors 'A command is required' core:proc:within "${TMPDIR}/inside"

}
