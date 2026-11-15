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

        started="${EPOCHREALTIME//[!0-9]/}"

        for (( round = 0; round < batch; round++ )); do
            "$@" >/dev/null 2>&1 || { core:error:fail "Bench subject failed: ${1}"; return; }
        done

        ended="${EPOCHREALTIME//[!0-9]/}"

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

    local label="${1}" count=0 total=0 sample=0 p25=0 p50=0 p75=0 p95=0 p99=0 unit="" divisor=1
    local -a sorted=()

    shift
    (( $# > 0 )) || { core:error:fail "No samples for ${label}"; return; }

    mapfile -t sorted < <(printf '%s\n' "$@" | sort -n)
    count="${#sorted[@]}"

    for sample in "${sorted[@]}"; do total=$(( total + sample )); done

    p25="$(module:bundle:bench:quantile sorted 25)"
    p50="$(module:bundle:bench:quantile sorted 50)"
    p75="$(module:bundle:bench:quantile sorted 75)"
    p95="$(module:bundle:bench:quantile sorted 95)"
    p99="$(module:bundle:bench:quantile sorted 99)"

    read -r unit divisor <<< "$(module:bundle:bench:unit "${p50}")"

    printf '%-28s p50=%s%s  p95=%s%s  p99=%s%s  min=%s%s  max=%s%s  mean=%s%s  n=%s  p25ns=%s  p50ns=%s  p75ns=%s\n' \
        "${label}" \
        "$(( p50 / divisor ))" "${unit}" "$(( p95 / divisor ))" "${unit}" "$(( p99 / divisor ))" "${unit}" \
        "$(( sorted[0] / divisor ))" "${unit}" "$(( sorted[count - 1] / divisor ))" "${unit}" \
        "$(( total / count / divisor ))" "${unit}" "${count}" "${p25}" "${p50}" "${p75}"

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

    module:bundle:bench:field "${1}" p50ns

}
module:bundle:bench:field () {

    local line="${1}" name="${2}" field=""

    for field in ${line}; do

        [[ "${field}" == "${name}="* ]] || continue

        core:num:natural "${field#"${name}="}" || { core:error:fail "Not a count in ${name}: ${field#"${name}="}"; return; }
        core:log:print "${field#"${name}="}"

        return 0

    done

    core:error:fail "No ${name} in: ${line}"

}
module:bundle:bench:spread () {

    local line="${1}" p25="" p50="" p75=""

    p50="$(module:bundle:bench:field "${line}" p50ns)" || return
    p25="$(module:bundle:bench:field "${line}" p25ns 2>/dev/null)" || p25="${p50}"
    p75="$(module:bundle:bench:field "${line}" p75ns 2>/dev/null)" || p75="${p50}"

    printf '%s\t%s\t%s\n' "${p25}" "${p50}" "${p75}"

}
module:bundle:bench:save () {

    local file="${1}" label="${2}" line="${3}" spread=""

    spread="$(module:bundle:bench:spread "${line}")" || return

    core:fs:file:write "${file}" 644 module:bundle:bench:rows "${file}" "${label}" "${spread}"

}
module:bundle:bench:rows () {

    local file="${1}" label="${2}" spread="${3}" row=""

    if [[ -f "${file}" ]]; then

        while IFS= read -r row || [[ -n "${row}" ]]; do
            [[ "${row}" == "${label}"$'\t'* ]] || core:log:print "${row}"
        done < "${file}"

    fi

    printf '%s\t%s\n' "${label}" "${spread}"

}
module:bundle:bench:compare () {

    local file="${1}" label="${2}" line="${3}" tolerance="${4}" row="" now="" low="" current="" high="" base_low="" baseline="" base_high="" delta=0

    [[ -f "${file}" ]] || { core:log:warn "No baseline for ${label}; run bench --save first"; return 0; }

    row="$(grep -- "^${label}"$'\t' "${file}")" || row=""
    [[ -n "${row}" ]] || { core:log:warn "No baseline for ${label}"; return 0; }

    IFS=$'\t' read -r _ base_low baseline base_high <<< "${row}"
    [[ -n "${baseline}" ]] || { baseline="${base_low}"; base_high="${base_low}"; }
    [[ -n "${base_high}" ]] || base_high="${baseline}"

    if ! core:num:natural "${base_low}" || ! core:num:natural "${baseline}" || ! core:num:natural "${base_high}"; then
        core:error:fail "${file}: ${label} is not a row of counts"
        return
    fi

    now="$(module:bundle:bench:spread "${line}")" || return
    IFS=$'\t' read -r low current high <<< "${now}"

    delta=$(( (current - baseline) * 100 / (baseline > 0 ? baseline : 1) ))

    if (( delta > tolerance && low > base_high )); then
        core:error:fail "${label}: p50 ${current} is ${delta}% slower than the baseline ${baseline} (tolerance ${tolerance}%, p25 ${low} above the baseline p75 ${base_high})"
        return
    fi

    (( delta <= tolerance )) || { core:log:warn "${label}: p50 ${current} is ${delta}% over ${baseline} but inside the noise (p25 ${low} ≤ baseline p75 ${base_high})"; return 0; }

    core:log:info "${label}: p50 ${current} against baseline ${baseline} (${delta}%)"

}
