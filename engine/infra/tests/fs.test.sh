test:core:fs:writes-atomically () {

    local directory="${TMPDIR}/fs" digest=""

    printf original | core:fs:file:write "${directory}/deep/file"
    @eq "$(core:fs:file:mode "${directory}/deep/file")" 600
    @eq "$(core:fs:file:mode "${directory}/deep")" 700

    digest="$(core:fs:file:hash "${directory}/deep/file")"
    @eq "${#digest}" 64

    printf changed | core:fs:file:write "${directory}/deep/file" 644
    @eq "$(core:fs:file:read "${directory}/deep/file")" changed
    @eq "$(core:fs:file:mode "${directory}/deep/file")" 644

    ln -s "${directory}/deep/file" "${directory}/link"

    @errors 'Refusing symlink destination' core:fs:file:write "${directory}/link" < /dev/null
    @errors 'Regular file required' core:fs:file:read "${directory}/link"
    @eq "$(find "${directory}" -name '*.tmp.*' | wc -l | tr -d ' ')" 0 'no staging leftovers'

}
test:core:fs:judges-paths () {

    core:fs:path:relative src/main.sh
    @fails core:fs:path:relative /etc/passwd
    @fails core:fs:path:relative 'src/../main.sh'
    @fails core:fs:path:relative ''

}
test:core:fs:copies-a-list () {

    local root="${TMPDIR}/root" tree="${TMPDIR}/tree" count=0

    mkdir -p "${root}/a/b"
    printf one > "${root}/a/b/one"
    printf two > "${root}/two"

    count="$(printf 'a/b/one\tx/one\ntwo\ttwo\n' | core:fs:tree:copy "${root}" "${tree}")"

    @eq "${count}" 2
    @eq "$(cat "${tree}/x/one")" one
    @errors 'Nothing to copy' core:fs:tree:copy "${root}" "${tree}" < /dev/null

}
test:core:fs:clears-but-keeps-git () {

    local directory="${TMPDIR}/place"

    mkdir -p "${directory}/.git" "${directory}/old"
    printf x > "${directory}/file"

    core:fs:dir:clear "${directory}"

    [[ -d "${directory}/.git" && ! -e "${directory}/old" && ! -e "${directory}/file" ]]
    @errors 'Not a directory' core:fs:dir:clear "${directory}/nothing"

}
test:core:fs:lists-and-temps () {

    local root="${TMPDIR}/list" file="" directory=""

    mkdir -p "${root}/b"
    printf x > "${root}/b/z.sh"
    printf x > "${root}/a.sh"
    printf x > "${root}/a.txt"

    @eq "$(core:fs:tree:files "${root}" .sh | tr '\0' ' ')" "${root}/a.sh ${root}/b/z.sh "
    @eq "$(core:fs:tree:files "${root}/nothing" | wc -c | tr -d ' ')" 0

    file="$(core:fs:temp:file)"
    directory="$(core:fs:temp:dir)"
    [[ -f "${file}" && -d "${directory}" ]]

}
test:core:fs:edits-in-place () {

    local file="${TMPDIR}/edit.txt"

    printf 'alpha\nbeta\n' | core:fs:file:write "${file}" 644
    core:fs:file:edit "${file}" -e 's/alpha/one/' -e '/beta/d'

    @eq "$(cat "${file}")" one
    @eq "$(core:fs:file:mode "${file}")" 644
    @errors 'Regular file required' core:fs:file:edit "${TMPDIR}/none" -e p

}
test:core:fs:locks-by-directory () {

    local lock="${TMPDIR}/lab/lock/one"

    core:fs:lock "${lock}" 1
    @eq "$(cat "${lock}/pid")" "$$"
    core:fs:lock "${lock}" 1
    core:fs:unlock "${lock}"
    [[ ! -e "${lock}" ]]

    mkdir -p "${lock}"
    printf '%s\n' 2147483646 > "${lock}/pid"
    core:fs:lock "${lock}" 1
    @eq "$(cat "${lock}/pid")" "$$"
    core:fs:unlock "${lock}"

    mkdir -p "${lock}"
    printf '%s\n' 1 > "${lock}/pid"
    @errors 'Locked by 1' core:fs:lock "${lock}" 1
    core:fs:unlock "${lock}"
    [[ -e "${lock}" ]]

}
test:core:fs:owns-a-directory () {

    local own="${TMPDIR}/own" link="${TMPDIR}/link"

    core:fs:dir:own "${own}" 700
    @eq "$(core:fs:file:mode "${own}")" 700
    core:fs:dir:own "${own}" 700

    chmod 770 "${own}"
    @errors 'Writable by others (770)' core:fs:dir:own "${own}"

    ln -s "${own}" "${link}"
    @errors 'Refusing a symlink' core:fs:dir:own "${link}"

}
