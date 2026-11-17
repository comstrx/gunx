module:bundle:fuzz:run () {

    local seconds="${1:-}" count=0 budget=0 file="" name="" input="" result="" runs="" code="" status=0 verdict="" saved="" crashes="" failed=0
    local -a names=()

    count="$(core:cli:value --count)" || count=0
    core:num:natural "${count}" || { core:error:fail "--count must be a count of runs: ${count}"; return; }

    if [[ -z "${seconds}" ]] && (( count > 0 )); then seconds=0 budget=86400
    else

        seconds="$(core:proc:seconds "${seconds:-10}" Seconds)" || return
        budget=$(( seconds + 5 ))

    fi

    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Fuzz runs from the source checkout"; return; }

    while IFS= read -r -d '' file; do
        source "${file}" || return
    done < <(core:fs:tree:files "${TOOL_ENGINE}/${MANIFEST[paths.fuzz]}" .fuzz.sh)

    mapfile -t names < <({ module:bundle:expect:discover fuzz:; module:bundle:cfg:sources fuzz; } | sort -u)

    (( ${#names[@]} > 0 )) || { core:error:fail "No fuzz targets"; return; }

    input="$(core:fs:temp:file)" || return
    crashes="${TOOL_ENGINE}/${MANIFEST[paths.build]}/fuzz"

    for name in "${names[@]}"; do

        status=0
        result="$(core:proc:timeout "${budget}" module:bundle:fuzz:loop "${name}" "${input}" "${seconds}" "${count}")" || status=$?

        read -r runs code <<< "${result:-? 124}"

        case "${status}" in
            0)   verdict=ok ;;
            124) verdict=HANG ;;
            *)   verdict="CRASH ${code}" ;;
        esac

        if [[ "${verdict}" != ok ]]; then

            saved="${crashes}/${name//:/-}-$(core:fs:file:hash "${input}")"

            if ! core:fs:dir:new "${crashes}" 755 || ! cp -- "${input}" "${saved}"; then
                core:error:fail "${name}: cannot keep the input that broke it under ${crashes}"
                return
            fi

            [[ ! -s "${input}.err" ]] || cp -- "${input}.err" "${saved}.err" || true

            verdict+=" ${saved#"${TOOL_ENGINE}/"}"
            failed=1

        fi

        core:log:print "${name}  runs=${runs}  ${verdict}"

    done

    rm -f -- "${input}.err"

    (( failed == 0 )) || { core:error:fail "Fuzz broke a target; the inputs are under ${crashes#"${TOOL_ENGINE}/"}"; return; }

}
module:bundle:fuzz:loop () {

    local name="${1}" input="${2}" seconds="${3}" count="${4}" runs=0 started="${EPOCHSECONDS}" status=0 size=0

    while (( (seconds == 0 || EPOCHSECONDS - started < seconds) && (count == 0 || runs < count) )); do

        size=$(( RANDOM % 513 ))

        if (( runs % 2 == 0 )); then head -c "${size}" /dev/urandom > "${input}"
        else LC_ALL=C tr -dc '[:print:]\n\t' < /dev/urandom 2>/dev/null | head -c "${size}" > "${input}" || true
        fi

        status=0

        ( "${name}" "${input}" ) >/dev/null 2>"${input}.err" || status=$?

        (( status <= 1 )) || { core:log:print "${runs} exit-${status}"; return 2; }

        [[ ! -s "${input}.err" ]] || ! grep -qE ': line [0-9]+: ' -- "${input}.err" || { core:log:print "${runs} bash-error"; return 2; }

        runs=$(( runs + 1 ))

    done

    core:log:print "${runs} 0"

}
