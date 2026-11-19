declare -gA FS_LOCKS=()

core:fs:path:relative () {

    [[ "${1:-}" =~ ^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$ && "/${1}/" != */../* ]]

}
core:fs:path:parent () {

    local path="${1:-}" parent="."

    [[ "${path}" != */* ]] || parent="${path%/*}"
    [[ -n "${parent}" ]] || parent=/

    core:log:print "${parent}"

}
core:fs:dir:new () {

    local directory="${1}" mode="${2:-700}"

    [[ -n "${directory}" ]] || { core:error:fail "Directory required"; return; }
    [[ -d "${directory}" ]] && return 0

    mkdir -m "${mode}" -- "${directory}" 2>/dev/null && return 0

    if ! { mkdir -p -- "${directory}" && chmod -- "${mode}" "${directory}"; }; then
        core:error:fail "Cannot create directory: ${directory}"
        return
    fi

}
core:fs:dir:own () {

    local directory="${1}" mode="${2:-700}" actual="" fresh=false

    [[ ! -L "${directory}" ]] || { core:error:fail "Refusing a symlink: ${directory}"; return; }
    [[ -e "${directory}" ]] || fresh=true

    core:fs:dir:new "${directory}" "${mode}" || return

    [[ -O "${directory}" ]] || { core:error:fail "Not owned by this user: ${directory}"; return; }
    [[ "${fresh}" == false ]] || return 0

    actual="$(core:fs:file:mode "${directory}")" || return
    [[ "${actual: -2}" == [0-5][0-5] ]] || { core:error:fail "Writable by others (${actual}): ${directory}"; return; }

}
core:fs:dir:clear () {

    local directory="${1}" entry=""

    [[ -d "${directory}" ]] || { core:error:fail "Not a directory: ${directory}"; return; }

    while IFS= read -r -d '' entry; do
        [[ "${entry##*/}" == .git ]] || rm -rf -- "${entry}"
    done < <(find "${directory}" -mindepth 1 -maxdepth 1 -print0)

}
core:fs:file:mode () {

    local path="${1}"

    stat -c '%a' -- "${path}" 2>/dev/null || stat -f '%Lp' -- "${path}" 2>/dev/null || { core:error:fail "Cannot read mode: ${path}"; return; }

}
core:fs:file:write () {

    local path="${1}" mode="${2:-600}" staging="" status=0

    shift "$(( $# < 2 ? $# : 2 ))"

    [[ ! -L "${path}" ]] || { core:error:fail "Refusing symlink destination: ${path}"; return; }
    [[ ! -d "${path}" ]] || { core:error:fail "A directory is in the way: ${path}"; return; }

    core:fs:dir:new "$(core:fs:path:parent "${path}")" || return

    staging="$(mktemp "${path}.tmp.XXXXXXXX")" || { core:error:fail "Cannot stage: ${path}"; return; }

    if (( $# > 0 )); then "$@" > "${staging}" || status=$?
    else cat > "${staging}" || status=$?
    fi

    if (( status != 0 )); then

        rm -f -- "${staging}"
        core:error:fail "Write failed: ${path}"
        return

    fi
    if ! { chmod -- "${mode}" "${staging}" && mv -f -- "${staging}" "${path}"; }; then

        rm -f -- "${staging}"
        core:error:fail "Write failed: ${path}"
        return

    fi

}
core:fs:file:read () {

    local path="${1}"

    [[ -f "${path}" && ! -L "${path}" ]] || { core:error:fail "Regular file required: ${path}"; return; }

    cat -- "${path}"

}
core:fs:file:edit () {

    local path="${1}" mode=""

    shift

    [[ -f "${path}" && ! -L "${path}" ]] || { core:error:fail "Regular file required: ${path}"; return; }

    mode="$(core:fs:file:mode "${path}")" || return

    core:fs:file:write "${path}" "${mode}" sed "$@" -- "${path}"

}
core:fs:file:hash () {

    local path="${1}" digest=""

    [[ -f "${path}" ]] || { core:error:fail "Regular file required: ${path}"; return; }

    if core:sys:has sha256sum; then digest="$(sha256sum -- "${path}")" || { core:error:fail "Hash failed: ${path}"; return; }
    else digest="$(shasum -a 256 -- "${path}")" || { core:error:fail "Hash failed: ${path}"; return; }
    fi

    core:log:print "${digest%% *}"

}
core:fs:tree:files () {

    local root="${1}" suffix="${2:-}"

    [[ -d "${root}" ]] || return 0

    find "${root}" -type f -name "*${suffix}" -print0 | sort -z

}
core:fs:tree:copy () {

    local root="${1}" tree="${2}" source="" target="" prefix="" list="" count=0 status=0
    local -A lists=()

    core:fs:dir:new "${tree}" 755 || return

    while IFS=$'\t' read -r source target; do

        [[ -n "${source}" && -n "${target}" ]] || { core:error:fail "A copy line needs a source and a target"; return; }
        [[ ! -L "${root}/${source}" ]] || { core:error:fail "A symlink never travels: ${source}"; return; }
        [[ -f "${root}/${source}" ]] || { core:error:fail "Copy failed: ${source}"; return; }

        if [[ "${source}" == "${target}" ]]; then prefix=.
        elif [[ "${source}" == */"${target}" ]]; then prefix="${source%/"${target}"}"
        else

            core:fs:dir:new "$(core:fs:path:parent "${tree}/${target}")" 755 || return
            cp -p -- "${root}/${source}" "${tree}/${target}" || { core:error:fail "Copy failed: ${source}"; return; }

            count=$(( count + 1 ))
            continue

        fi

        if [[ -z "${lists[${prefix}]+x}" ]]; then
            lists["${prefix}"]="$(core:fs:temp:file)" || return
        fi

        printf '%s\0' "${target}" >> "${lists[${prefix}]}" || { core:error:fail "Cannot list ${source}"; return; }

        count=$(( count + 1 ))

    done

    (( count > 0 )) || { core:error:fail "Nothing to copy"; return; }

    for prefix in "${!lists[@]}"; do

        list="${lists[${prefix}]}"
        status=0

        tar -C "${root}/${prefix}" --null -T "${list}" -cf - | ( umask 022 && tar -C "${tree}" -xpf - ) || status=$?

        rm -f -- "${list}"
        (( status == 0 )) || { core:error:fail "Copy failed from ${prefix}"; return; }

    done

    core:log:print "${count}"

}
core:fs:tree:replace () {

    local target="${1}" tree="${2}" stage="" old="" entry="" failed=0

    [[ -d "${tree}" ]] || { core:error:fail "Not a directory: ${tree}"; return; }

    core:fs:dir:new "${target}" 755 || return

    stage="$(mktemp -d "${target}/.stage.XXXXXXXX")" || { core:error:fail "Cannot stage ${target}"; return; }
    old="$(mktemp -d "${target}/.old.XXXXXXXX")" || { rm -rf -- "${stage}"; core:error:fail "Cannot stage ${target}"; return; }

    cp -a -- "${tree}/." "${stage}/" || { rm -rf -- "${stage}" "${old}"; core:error:fail "Cannot fill ${target}"; return; }
    rm -rf -- "${stage}/.git"

    while IFS= read -r -d '' entry; do

        case "${entry##*/}" in
            .git|"${stage##*/}"|"${old##*/}") continue ;;
        esac

        mv -- "${entry}" "${old}/" || { failed=1; break; }

    done < <(find "${target}" -mindepth 1 -maxdepth 1 -print0)

    if (( failed == 0 )); then

        while IFS= read -r -d '' entry; do
            mv -- "${entry}" "${target}/" || { failed=2; break; }
        done < <(find "${stage}" -mindepth 1 -maxdepth 1 -print0)

    fi

    if (( failed > 0 )); then

        core:fs:tree:restore "${target}" "${stage}" "${old}" "${failed}"
        core:error:fail "Cannot swap ${target}; the old tree is back"
        return

    fi

    rm -rf -- "${stage}" "${old}"

}
core:fs:tree:restore () {

    local target="${1}" stage="${2}" old="${3}" phase="${4:-1}" entry=""

    if (( phase == 2 )); then

        while IFS= read -r -d '' entry; do

            case "${entry##*/}" in
                .git|"${stage##*/}"|"${old##*/}") continue ;;
            esac

            rm -rf -- "${entry}"

        done < <(find "${target}" -mindepth 1 -maxdepth 1 -print0)

    fi

    while IFS= read -r -d '' entry; do
        mv -- "${entry}" "${target}/" 2>/dev/null || true
    done < <(find "${old}" -mindepth 1 -maxdepth 1 -print0)

    rm -rf -- "${stage}" "${old}"

}
core:fs:temp:file () {

    local file=""

    file="$(mktemp "${TOOL_TEMP:-${TMPDIR:-/tmp}}/infra.XXXXXXXX")" \
        || { core:error:fail "Cannot create a temporary file"; return; }

    core:log:print "${file}"

}
core:fs:temp:dir () {

    local directory=""

    directory="$(mktemp -d "${TOOL_TEMP:-${TMPDIR:-/tmp}}/infra.XXXXXXXX")" \
        || { core:error:fail "Cannot create a temporary directory"; return; }

    core:log:print "${directory}"

}
core:fs:lock () {

    local path="${1}" seconds="${2:-30}" waited=0 owner=""

    core:num:natural "${seconds}" || { core:error:fail "Seconds must be a number: ${seconds}"; return; }
    core:fs:dir:own "$(core:fs:path:parent "${path}")" 700 || return

    while true; do

        [[ ! -d "${path}" || -L "${path}" ]] || { core:error:fail "Not a lock: ${path}"; return; }

        ln -s -- "$$" "${path}" 2>/dev/null && break

        owner="$(readlink -- "${path}" 2>/dev/null)" || owner=""

        if [[ -z "${owner}" ]]; then

            [[ -e "${path}" || -L "${path}" ]] || continue

            core:error:fail "Not a lock: ${path}"
            return

        fi

        [[ "${owner}" != "$$" ]] || break

        ! core:proc:alive "${owner}" && core:fs:lock:break "${path}" "${owner}" && continue

        (( waited < seconds * 10 )) || { core:fs:lock:refuse "${path}" "${owner}"; return; }

        sleep 0.1
        waited=$(( waited + 1 ))

    done

    FS_LOCKS["${path}"]=1

}
core:fs:lock:break () {

    local path="${1}" owner="${2}" breaker="${1}.break"

    ln -s -- "$$" "${breaker}" 2>/dev/null || return 1

    [[ "$(readlink -- "${path}" 2>/dev/null)" != "${owner}" ]] || rm -f -- "${path}"

    rm -f -- "${breaker}"

}
core:fs:lock:refuse () {

    local path="${1}" owner="${2}" breaker=""

    breaker="$(readlink -- "${path}.break" 2>/dev/null)" || breaker=""

    if [[ -n "${breaker}" ]] && ! core:proc:alive "${owner}" && ! core:proc:alive "${breaker}"; then
        core:error:fail "A dead run ${breaker} left ${path}.break; remove it to free ${path}"
        return
    fi

    core:error:fail "Locked by ${owner}: ${path}"

}
core:fs:unlock () {

    local path="${1}"

    [[ "$(readlink -- "${path}" 2>/dev/null)" == "$$" ]] || return 0

    rm -f -- "${path}"
    unset "FS_LOCKS[${path}]"

}
core:fs:release () {

    local path=""

    for path in "${!FS_LOCKS[@]}"; do
        core:fs:unlock "${path}"
    done

    return 0

}
