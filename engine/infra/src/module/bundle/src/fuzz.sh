module:bundle:fuzz:run () {

    local seconds="${1:-10}" file="" name="" input="" status=0 runs=0 started=0 failed=0
    local -a names=()

    seconds="$(core:process:seconds "${seconds}" Seconds)" || return
    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Fuzz runs from the source checkout"; return; }

    while IFS= read -r -d '' file; do
        source "${file}" || return
    done < <(core:fs:tree:files "${TOOL_ENGINE}/${MANIFEST[paths.fuzz]}" .fuzz.sh)

    mapfile -t names < <({ module:bundle:expect:discover fuzz:; module:bundle:cfg:sources fuzz; } | sort -u)

    (( ${#names[@]} > 0 )) || { core:error:fail "No fuzz targets"; return; }
    input="$(core:fs:temp:file)" || return

    for name in "${names[@]}"; do

        runs=0
        started="${EPOCHSECONDS}"

        while (( EPOCHSECONDS - started < seconds )); do

            head -c "$(( RANDOM % 513 ))" /dev/urandom > "${input}"
            status=0

            ( "${name}" "${input}" ) >/dev/null 2>&1 || status=$?

            (( status <= 1 )) || {

                core:error:fail "${name}: exit ${status} on $(core:fs:file:hash "${input}")"
                cp -- "${input}" "${TOOL_ROOT}/${MANIFEST[paths.build]}/fuzz-${name//:/-}-crash" 2>/dev/null

                failed=1
                break

            }

            runs=$(( runs + 1 ))

        done

        core:log:print "${name}  runs=${runs}  seconds=${seconds}  $( (( failed == 0 )) && printf ok || printf CRASH )"

    done

    (( failed == 0 )) || { core:error:fail "Fuzz found a crash; inputs saved under ${MANIFEST[paths.build]}"; return; }

}
