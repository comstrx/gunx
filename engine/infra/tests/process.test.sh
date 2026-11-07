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
test:core:process:enforces-a-budget () {

    @status 124 core:process:timeout 1 sleep 5
    core:process:timeout 5 true
    @errors 'positive number of seconds' core:process:timeout 0 true
    @errors 'positive number of seconds' core:process:seconds abc Seconds

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
    @status 124 core:process:io sleep 10

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

}
