module:bundle:test:list () {

    [[ "${TOOL_BUILD}" == dev ]] || { core:error:fail "Release bundles exclude tests"; return; }

    { module:bundle:expect:discover test:; module:bundle:cfg:sources test; } | sort -u

}
module:bundle:test:isolate () {

    local name="${1:-}"

    [[ "${TOOL_BUILD}" == dev ]] || { core:error:fail "Release bundles exclude tests"; return; }
    [[ "${name}" =~ ^[a-z][a-z0-9:-]+$ ]] || { core:error:fail "Unknown test: ${name}"; return; }

    grep -qx -- "${name}" <(module:bundle:test:list) || { core:error:fail "Unknown test: ${name}"; return; }

    "${name}"

}
module:bundle:test:names () {

    local bundle="${1}" filter="${2}" name=""

    while IFS= read -r name; do

        [[ -n "${name}" && ( -z "${filter}" || "${name}" == *"${filter}"* ) ]] || continue

        core:log:print "${name}"

    done < <(env -i PATH="${PATH}" HOME="${TOOL_TEMP}" TMPDIR="${TOOL_TEMP}" GIT_CEILING_DIRECTORIES="${TOOL_TEMP}" NO_COLOR=1 bash "${bundle}" --root "${TOOL_TEMP}" __tests)

}
module:bundle:test:one () {

    local bundle="${1}" name="${2}" sandbox="" status=0 report=""

    sandbox="$(mktemp -d "${TOOL_TEMP}/test.XXXXXXXX")" || { core:error:fail "Cannot create a test sandbox"; return; }
    report="${sandbox}.log"

    core:process:timeout "${CONFIG[TEST_TIMEOUT]:-120}" \
        env -i PATH="${PATH}" HOME="${sandbox}" TMPDIR="${sandbox}" GIT_CEILING_DIRECTORIES="${TOOL_TEMP}" LC_ALL=C.UTF-8 INFRA_ENGINE="${TOOL_ENGINE}" NO_COLOR=1 \
        bash "${bundle}" --root "${sandbox}" __test "${name}" > "${report}" 2>&1 || status=$?

    rm -rf -- "${sandbox}"

    if (( status == 0 )); then core:log:info "pass ${name}"; rm -f -- "${report}"; return 0; fi

    if (( status == 124 )); then core:log:warn "fail ${name}: timed out after ${CONFIG[TEST_TIMEOUT]:-120}s"
    else core:log:warn "fail ${name}: exit ${status}"
    fi

    sed 's/^/      /' -- "${report}" >&2
    rm -f -- "${report}"

    return 1

}
module:bundle:test:run () {

    local filter="${1:-}" bundle="" name="" pass=0 fail=0
    local -a names=()

    [[ "${TOOL_BUILD}" == dev ]] || { core:error:fail "Release bundles exclude tests"; return; }

    ! core:cli:flag --check || module:bundle:check || return
    bundle="$(module:bundle:build:current)" || return

    mapfile -t names < <(module:bundle:test:names "${bundle}" "${filter}")

    (( ${#names[@]} > 0 )) || { core:error:fail "No tests matched: ${filter}"; return; }

    core:cli:flag --list && { printf '%s\n' "${names[@]}"; return 0; }
    ! core:cli:flag --shuffle || mapfile -t names < <(core:list:shuffle "${names[@]}")

    for name in "${names[@]}"; do

        if module:bundle:test:one "${bundle}" "${name}"; then pass=$(( pass + 1 ))
        else fail=$(( fail + 1 )); ! core:cli:flag --fast || break
        fi

    done

    (( fail == 0 )) || { core:error:fail "tests passed=${pass} failed=${fail} of ${#names[@]}"; return; }

    core:log:succ "tests passed=${pass} failed=${fail}"

}
