core:fs:path:relative () {

    [[ "${1:-}" =~ ^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$ && "/${1}/" != */../* ]]

}
core:fs:dir:new () {

    local directory="${1}" mode="${2:-700}"

    [[ -n "${directory}" ]] || { core:error:fail "Directory required"; return; }
    [[ -d "${directory}" ]] && return 0

    if ! { mkdir -p -- "${directory}" && chmod "${mode}" -- "${directory}"; }; then
        core:error:fail "Cannot create directory: ${directory}"
        return
    fi

}
core:fs:dir:own () {

    local directory="${1}" mode="${2:-700}" actual=""

    [[ ! -L "${directory}" ]] || { core:error:fail "Refusing a symlink: ${directory}"; return; }

    core:fs:dir:new "${directory}" "${mode}" || return

    [[ -O "${directory}" ]] || { core:error:fail "Not owned by this user: ${directory}"; return; }

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

    local path="${1}" mode=""

    if mode="$(stat -c '%a' -- "${path}" 2>/dev/null)"; then core:log:print "${mode}"; return 0; fi

    mode="$(stat -f '%Lp' -- "${path}")" || { core:error:fail "Cannot read mode: ${path}"; return; }

    core:log:print "${mode}"

}
core:fs:file:write () {

    local path="${1}" mode="${2:-600}" staging=""

    [[ ! -L "${path}" ]] || { core:error:fail "Refusing symlink destination: ${path}"; return; }

    core:fs:dir:new "${path%/*}" || return

    staging="$(mktemp "${path}.tmp.XXXXXXXX")" || { core:error:fail "Cannot stage: ${path}"; return; }

    if ! cat > "${staging}"; then

        rm -f -- "${staging}"
        core:error:fail "Write failed: ${path}"
        return

    fi
    if ! { chmod "${mode}" -- "${staging}" && mv -f -- "${staging}" "${path}"; }; then

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

    sed "$@" -- "${path}" | core:fs:file:write "${path}" "${mode}"

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

    local root="${1}" tree="${2}" source="" target="" count=0

    while IFS=$'\t' read -r source target; do

        core:fs:dir:new "${tree}/$(dirname -- "${target}")" 755 || return
        cp -p -- "${root}/${source}" "${tree}/${target}" || { core:error:fail "Copy failed: ${source}"; return; }

        count=$(( count + 1 ))

    done

    (( count > 0 )) || { core:error:fail "Nothing to copy"; return; }

    core:log:print "${count}"

}
core:fs:tree:replace () {

    local target="${1}" tree="${2}"

    core:fs:dir:new "${target}" 755 || return
    core:fs:dir:clear "${target}" || return

    cp -a -- "${tree}/." "${target}/" || { core:error:fail "Cannot fill ${target}"; return; }

}
core:fs:temp:file () {

    local file=""

    file="$(mktemp "${TOOL_TEMP:-${TMPDIR:-/tmp}}/infra.XXXXXXXX")" || { core:error:fail "Cannot create a temporary file"; return; }

    core:log:print "${file}"

}
core:fs:temp:dir () {

    local directory=""

    directory="$(mktemp -d "${TOOL_TEMP:-${TMPDIR:-/tmp}}/infra.XXXXXXXX")" || { core:error:fail "Cannot create a temporary directory"; return; }

    core:log:print "${directory}"

}
core:fs:lock () {

    local path="${1}" seconds="${2:-30}" waited=0 owner=""

    core:fs:dir:own "${path%/*}" 700 || return

    while ! mkdir -- "${path}" 2>/dev/null; do

        owner="$(cat -- "${path}/pid" 2>/dev/null)" || owner=""

        [[ "${owner}" != "$$" ]] || return 0

        if [[ -n "${owner}" ]] && ! core:process:alive "${owner}"; then
            rm -rf -- "${path}"
            continue
        fi

        (( waited < seconds )) || { core:error:fail "Locked by ${owner:-another run}: ${path}"; return; }

        sleep 1
        waited=$(( waited + 1 ))

    done

    printf '%s\n' "$$" > "${path}/pid"

}
core:fs:unlock () {

    local path="${1}"

    [[ "$(cat -- "${path}/pid" 2>/dev/null)" == "$$" ]] || return 0

    rm -rf -- "${path}"

}
