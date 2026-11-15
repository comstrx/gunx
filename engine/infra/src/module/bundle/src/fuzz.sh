module:bundle:fuzz:run () {

    local seconds="${1:-10}" file="" name="" input="" result="" runs="" code="" status=0 verdict="" saved="" crashes="" failed=0
    local -a names=()

    seconds="$(core:process:seconds "${seconds}" Seconds)" || return
    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Fuzz runs from the source checkout"; return; }

    while IFS= read -r -d '' file; do
        source "${file}" || return
    done < <(core:fs:tree:files "${TOOL_ENGINE}/${MANIFEST[paths.fuzz]}" .fuzz.sh)

    mapfile -t names < <({ module:bundle:expect:discover fuzz:; module:bundle:cfg:sources fuzz; } | sort -u)

    (( ${#names[@]} > 0 )) || { core:error:fail "No fuzz targets"; return; }

    input="$(core:fs:temp:file)" || return
    crashes="${TOOL_ROOT}/${MANIFEST[paths.build]}/fuzz"

    for name in "${names[@]}"; do

        status=0
        result="$(core:process:timeout "$(( seconds + 5 ))" module:bundle:fuzz:loop "${name}" "${input}" "${seconds}")" || status=$?

        read -r runs code <<< "${result:-? 124}"

        case "${status}" in
            0)   verdict=ok ;;
            124) verdict=HANG ;;
            *)   verdict="CRASH exit ${code}" ;;
        esac

        if [[ "${verdict}" != ok ]]; then

            saved="${crashes}/${name//:/-}-$(core:fs:file:hash "${input}")"

            if ! core:fs:dir:new "${crashes}" 755 || ! cp -- "${input}" "${saved}"; then
                core:error:fail "${name}: cannot keep the input that broke it under ${crashes}"
                return
            fi

            verdict+=" ${saved#"${TOOL_ROOT}/"}"
            failed=1

        fi

        core:log:print "${name}  runs=${runs}  seconds=${seconds}  ${verdict}"

    done

    (( failed == 0 )) || { core:error:fail "Fuzz broke a target; the inputs are under ${crashes#"${TOOL_ROOT}/"}"; return; }

}
module:bundle:fuzz:loop () {

    local name="${1}" input="${2}" seconds="${3}" runs=0 started="${EPOCHSECONDS}" status=0

    while (( EPOCHSECONDS - started < seconds )); do

        head -c "$(( RANDOM % 513 ))" /dev/urandom > "${input}"
        status=0

        ( "${name}" "${input}" ) >/dev/null 2>&1 || status=$?

        (( status <= 1 )) || { core:log:print "${runs} ${status}"; return 2; }

        runs=$(( runs + 1 ))

    done

    core:log:print "${runs} 0"

}
