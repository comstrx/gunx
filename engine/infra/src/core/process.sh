core:process:seconds () {

    local value="${1:-}" name="${2:-value}"

    if ! core:num:natural "${value}" || (( value == 0 )); then core:error:fail "${name} must be a positive number of seconds: ${value}"; return; fi

    core:log:print "${value}"

}
core:process:timeout () {

    local seconds=""

    seconds="$(core:process:seconds "${1:-}" timeout)" || return
    shift

    if core:sys:has timeout; then timeout --foreground --kill-after=15 "${seconds}" "$@"
    elif core:sys:has gtimeout; then gtimeout --foreground --kill-after=15 "${seconds}" "$@"
    else core:log:warn "No timeout command; running without a budget"; "$@"
    fi

}
core:process:retry () {

    local tries="${1:-}" backoff="${2:-}" attempt=1 status=0

    if ! core:num:natural "${tries}" || (( tries == 0 )); then core:error:fail "Retries must be a positive count: ${tries}"; return; fi
    core:num:natural "${backoff}" || { core:error:fail "Backoff must be a number of seconds: ${backoff}"; return; }

    shift 2

    while true; do

        status=0
        "$@" || status=$?

        (( status != 0 )) || return 0
        (( attempt < tries )) || break

        core:log:warn "attempt ${attempt} of ${tries} failed with ${status}: ${1}; retrying in $(( backoff * attempt ))s"
        sleep "$(( backoff * attempt ))"

        attempt=$(( attempt + 1 ))

    done

    core:error:fail "${1} failed after ${tries} attempts with ${status}" || return "${status}"

}
core:process:io () {

    core:process:retry "${CONFIG[RUN_RETRIES]:-3}" "${CONFIG[RUN_BACKOFF]:-2}" core:process:timeout "${CONFIG[RUN_TIMEOUT]:-300}" "$@"

}
core:process:spawn () {

    (( $# > 0 )) || { core:error:fail "A command is required"; return; }

    "$@" >/dev/null 2>&1 &

    core:log:print "$!"

}
core:process:alive () {

    core:num:natural "${1:-}" || return 1

    kill -0 "${1}" 2>/dev/null || ps -p "${1}" -o pid= >/dev/null 2>&1

}
core:process:wait () {

    local pid="${1:-}" seconds="${2:-30}" waited=0

    core:num:natural "${pid}" || { core:error:fail "Not a pid: ${pid}"; return; }

    while core:process:alive "${pid}"; do
        (( waited < seconds )) || { core:error:fail "Process ${pid} is still alive after ${seconds}s"; return; }
        sleep 1
        waited=$(( waited + 1 ))
    done

}
core:process:stop () {

    local pid="${1:-}" grace="${2:-10}"

    core:process:alive "${pid}" || return 0

    kill -TERM "${pid}" 2>/dev/null || true
    core:process:wait "${pid}" "${grace}" 2>/dev/null && return 0

    kill -KILL "${pid}" 2>/dev/null || true
    core:process:wait "${pid}" 5

}
core:process:find () {

    local name="${1:-}"

    [[ -n "${name}" && "${name}" != *[!A-Za-z0-9_.:-]* ]] || { core:error:fail "Not a process name: ${name}"; return; }

    pgrep -x -- "${name}" 2>/dev/null || return 1

}
