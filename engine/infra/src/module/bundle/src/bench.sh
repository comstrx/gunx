module:bundle:bench:run () {

    local filter="${1:-}" file="" name="" line="" count=0 baseline="" failed=0

    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Benches run from the source checkout"; return; }

    baseline="${TOOL_ROOT}/${MANIFEST[paths.build]}/bench/baseline.tsv"

    while IFS= read -r -d '' file; do
        source "${file}" || return
    done < <(core:fs:tree:files "${TOOL_ENGINE}/${MANIFEST[paths.benches]}" .bench.sh)

    while IFS= read -r name; do

        [[ -z "${filter}" || "${name}" == *"${filter}"* ]] || continue

        line="$("${name}")" || return
        core:log:print "${line}"

        count=$(( count + 1 ))

        ! core:cli:flag --save || module:bundle:bench:save "${baseline}" "${name}" "${line}" || return
        ! core:cli:flag --compare || module:bundle:bench:compare "${baseline}" "${name}" "${line}" "${CONFIG[BENCH_TOLERANCE]:-25}" || failed=1

    done < <({ module:bundle:expect:discover bench:; module:bundle:cfg:sources bench; } | sort -u)

    (( count > 0 )) || { core:error:fail "No benches matched: ${filter}"; return; }
    (( failed == 0 )) || { core:error:fail "A bench regressed against ${baseline}"; return; }

}
module:bundle:bench:samples () {

    local rounds="${1}" batch="${2}" index=0 round=0 started=0 ended=0

    [[ "${rounds}" =~ ^[0-9]+$ && "${rounds}" -gt 0 ]] || { core:error:fail "Rounds must be a positive count: ${rounds}"; return; }
    [[ "${batch}" =~ ^[0-9]+$ && "${batch}" -gt 0 ]] || { core:error:fail "Batch must be a positive count: ${batch}"; return; }

    shift 2

    for (( index = 0; index < rounds; index++ )); do

        started="$(core:sys:now)"

        for (( round = 0; round < batch; round++ )); do
            "$@" >/dev/null 2>&1 || { core:error:fail "Bench subject failed: ${1}"; return; }
        done

        ended="$(core:sys:now)"

        core:log:print $(( (ended - started) * 1000 / batch ))

    done

}
module:bundle:bench:quantile () {

    local -n _sorted="${1}"
    local percent="${2}" count="${#_sorted[@]}" index=0

    index=$(( count * percent / 100 ))
    (( index < count )) || index=$(( count - 1 ))

    core:log:print "${_sorted[${index}]}"

}
module:bundle:bench:unit () {

    local p50="${1}"

    if (( p50 < 10000 )); then core:log:print "ns 1"
    elif (( p50 < 10000000 )); then core:log:print "µs 1000"
    else core:log:print "ms 1000000"
    fi

}
module:bundle:bench:report () {

    local label="${1}" count=0 total=0 sample=0 p50=0 p95=0 p99=0 unit="" divisor=1
    local -a sorted=()

    shift
    (( $# > 0 )) || { core:error:fail "No samples for ${label}"; return; }

    mapfile -t sorted < <(printf '%s\n' "$@" | sort -n)
    count="${#sorted[@]}"

    for sample in "${sorted[@]}"; do total=$(( total + sample )); done

    p50="$(module:bundle:bench:quantile sorted 50)"
    p95="$(module:bundle:bench:quantile sorted 95)"
    p99="$(module:bundle:bench:quantile sorted 99)"

    read -r unit divisor <<< "$(module:bundle:bench:unit "${p50}")"

    printf '%-28s p50=%s%s  p95=%s%s  p99=%s%s  min=%s%s  max=%s%s  mean=%s%s  n=%s  p50ns=%s\n' \
        "${label}" \
        "$(( p50 / divisor ))" "${unit}" "$(( p95 / divisor ))" "${unit}" "$(( p99 / divisor ))" "${unit}" \
        "$(( sorted[0] / divisor ))" "${unit}" "$(( sorted[count - 1] / divisor ))" "${unit}" \
        "$(( total / count / divisor ))" "${unit}" "${count}" "${p50}"

}
module:bundle:bench:measure () {

    local label="${1}" rounds="${2}" batch="${3}" warmup=0
    local -a samples=()

    shift 3

    warmup=$(( rounds / 10 > 0 ? rounds / 10 : 1 ))

    module:bundle:bench:samples "${warmup}" "${batch}" "$@" >/dev/null || return
    mapfile -t samples < <(module:bundle:bench:samples "${rounds}" "${batch}" "$@") || return

    (( ${#samples[@]} == rounds )) || { core:error:fail "Bench ${label} lost samples"; return; }

    module:bundle:bench:report "${label}" "${samples[@]}"

}
module:bundle:bench:p50 () {

    local line="${1}" field=""

    for field in ${line}; do
        [[ "${field}" != p50ns=* ]] || { core:log:print "${field#p50ns=}"; return 0; }
    done

    core:error:fail "No p50ns in: ${line}"

}
module:bundle:bench:save () {

    local file="${1}" label="${2}" line="${3}" kept=""

    [[ ! -f "${file}" ]] || kept="$(grep -v -- "^${label}"$'\t' "${file}" || true)"

    {
        [[ -z "${kept}" ]] || printf '%s\n' "${kept}"; printf '%s\t%s\n' "${label}" "$(module:bundle:bench:p50 "${line}")"
    } | core:fs:file:write "${file}" 644

}
module:bundle:bench:compare () {

    local file="${1}" label="${2}" line="${3}" tolerance="${4}" current="" baseline="" delta=0

    [[ -f "${file}" ]] || { core:log:warn "No baseline for ${label}; run bench --save first"; return 0; }

    baseline="$(grep -- "^${label}"$'\t' "${file}" | cut -f2)" || true
    [[ -n "${baseline}" ]] || { core:log:warn "No baseline for ${label}"; return 0; }

    current="$(module:bundle:bench:p50 "${line}")" || return

    delta=$(( (current - baseline) * 100 / (baseline > 0 ? baseline : 1) ))

    (( delta <= tolerance )) || {
        core:error:fail "${label}: p50 ${current} is ${delta}% slower than the baseline ${baseline} (tolerance ${tolerance}%)"
        return
    }

    core:log:info "${label}: p50 ${current} against baseline ${baseline} (${delta}%)"

}
