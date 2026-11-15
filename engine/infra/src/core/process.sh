declare -gA PROCESS_GROUPS=()
declare -g PROCESS_GRACE=10

core:process:seconds () {

    local value="${1:-}" name="${2:-value}"

    if ! core:num:natural "${value}" || (( value == 0 )); then core:error:fail "${name} must be a positive number of seconds: ${value}"; return; fi

    core:log:print "${value}"

}
core:process:timeout () {

    local seconds="" group=0 watch=0 status=0 fired=0 guarded=false monitor=false

    seconds="$(core:process:seconds "${1:-}" timeout)" || return
    shift

    (( $# > 0 )) || { core:error:fail "A command is required"; return; }

    [[ "${ERROR_TRAPS:-}" == "${BASHPID}" ]] || { guarded=true; core:error:guard; }

    [[ "${-}" != *m* ]] || monitor=true
    set -m

    if [[ -t 0 ]]; then "$@" < /dev/null &
    else "$@" &
    fi

    group=$!
    PROCESS_GROUPS["${group}"]=""

    core:process:watch "${group}" "${seconds}" < /dev/null > /dev/null 2>&1 &
    watch=$!
    PROCESS_GROUPS["${group}"]="${watch}"

    [[ "${monitor}" == true ]] || set +m

    wait "${group}" || status=$?

    kill -TERM -- "-${watch}" 2>/dev/null || true
    wait "${watch}" 2>/dev/null || fired=$?

    (( fired != 124 )) || status=124

    unset "PROCESS_GROUPS[${group}]"

    [[ "${guarded}" == false ]] || trap - INT TERM

    return "${status}"

}
core:process:watch () {

    local group="${1}" seconds="${2}"

    sleep "${seconds}" || exit 0

    trap '' TERM

    core:process:group:stop "${group}" "${PROCESS_GRACE}" || true

    exit 124

}
core:process:halt () {

    local group=""

    for group in "${!PROCESS_GROUPS[@]}"; do

        [[ -z "${PROCESS_GROUPS[${group}]}" ]] || kill -TERM -- "-${PROCESS_GROUPS[${group}]}" 2>/dev/null || true
        core:process:group:stop "${group}" "${PROCESS_GRACE}" || true

    done

    PROCESS_GROUPS=()

}
core:process:backoff () {

    local base="${1:-0}" attempt="${2:-1}" step=0 delay=0 cap=60000

    if ! core:num:natural "${base}" || ! core:num:natural "${attempt}"; then core:error:fail "Backoff needs seconds and an attempt: ${base} ${attempt}"; return; fi

    step=$(( attempt > 7 ? 6 : attempt - 1 ))
    (( step >= 0 )) || step=0

    delay=$(( base * 1000 * (1 << step) ))
    (( delay <= cap )) || delay="${cap}"
    (( delay == 0 )) || delay=$(( delay / 2 + ((RANDOM << 15 | RANDOM) % (delay / 2 + 1)) ))

    printf '%d.%03d\n' "$(( delay / 1000 ))" "$(( delay % 1000 ))"

}
core:process:retry () {

    local tries="${1:-}" backoff="${2:-}" attempt=1 status=0 delay="" label=""

    if ! core:num:natural "${tries}" || (( tries == 0 )); then core:error:fail "Retries must be a positive count: ${tries}"; return; fi
    core:num:natural "${backoff}" || { core:error:fail "Backoff must be a number of seconds: ${backoff}"; return; }

    shift 2

    (( $# > 0 )) || { core:error:fail "A command is required"; return; }

    label="${1}"
    [[ "${1}" != core:process:timeout ]] || label="${3:-${1}}"

    while true; do

        status=0
        "$@" || status=$?

        (( status != 0 )) || return 0
        (( attempt < tries )) || break

        delay="$(core:process:backoff "${backoff}" "${attempt}")" || return

        core:log:warn "attempt ${attempt} of ${tries} failed with ${status}: ${label}; retrying in ${delay}s"
        sleep "${delay}"

        attempt=$(( attempt + 1 ))

    done

    core:error:fail "${label} failed after ${tries} attempts with ${status}" || return "${status}"

}
core:process:io () {

    core:process:retry "${CONFIG[RUN_RETRIES]:-3}" "${CONFIG[RUN_BACKOFF]:-2}" core:process:timeout "${CONFIG[RUN_TIMEOUT]:-300}" "$@"

}
core:process:within () {

    local directory="${1:-}"

    shift

    [[ -d "${directory}" ]] || { core:error:fail "Not a directory: ${directory}"; return; }
    (( $# > 0 )) || { core:error:fail "A command is required"; return; }

    ( cd -- "${directory}" && "$@" )

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
core:process:group:alive () {

    core:num:natural "${1:-}" || return 1
    (( ${1} > 1 )) || return 1

    kill -0 -- "-${1}" 2>/dev/null

}
core:process:group:stop () {

    local group="${1:-}" grace="${2:-${PROCESS_GRACE}}" waited=0

    if ! core:num:natural "${group}" || (( group <= 1 )); then core:error:fail "Not a process group: ${group}"; return; fi
    core:num:natural "${grace}" || { core:error:fail "Grace must be a number of seconds: ${grace}"; return; }

    kill -TERM -- "-${group}" 2>/dev/null || return 0
    kill -CONT -- "-${group}" 2>/dev/null || true

    while core:process:group:alive "${group}"; do

        (( waited < grace * 10 )) || { kill -KILL -- "-${group}" 2>/dev/null || true; return 0; }

        sleep 0.1
        waited=$(( waited + 1 ))

    done

}
core:process:find () {

    local name="${1:-}"

    [[ -n "${name}" && "${name}" != *[!A-Za-z0-9_.:-]* ]] || { core:error:fail "Not a process name: ${name}"; return; }

    pgrep -x -- "${name}" 2>/dev/null || return 1

}
