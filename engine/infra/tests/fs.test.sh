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
test:core:fs:locks-by-link () {

    local lock="${TMPDIR}/lab/lock/one"

    core:fs:lock "${lock}" 1
    @eq "$(readlink -- "${lock}")" "$$"
    core:fs:lock "${lock}" 1
    core:fs:unlock "${lock}"
    [[ ! -e "${lock}" && ! -L "${lock}" ]]

    ln -s 2147483646 "${lock}"
    core:fs:lock "${lock}" 1
    @eq "$(readlink -- "${lock}")" "$$"
    [[ ! -L "${lock}.break" ]]
    core:fs:unlock "${lock}"

    ln -s 1 "${lock}"
    @errors 'Locked by 1' core:fs:lock "${lock}" 1
    core:fs:unlock "${lock}"
    [[ -L "${lock}" ]]
    rm -f -- "${lock}"

    ln -s 2147483646 "${lock}"
    ln -s 2147483645 "${lock}.break"
    @errors "remove it to free ${lock}" core:fs:lock "${lock}" 1
    @eq "$(readlink -- "${lock}")" 2147483646 'a dead breaker never lets two runs in'
    rm -f -- "${lock}" "${lock}.break"

    mkdir -p "${lock}"
    @errors 'Not a lock' core:fs:lock "${lock}" 1
    rmdir -- "${lock}"

}
test:core:fs:releases-every-lock () {

    local lab="${TMPDIR}/lab/lock"

    core:fs:lock "${lab}/one" 1
    core:fs:lock "${lab}/two" 1
    @eq "${#FS_LOCKS[@]}" 2

    core:fs:release

    [[ ! -L "${lab}/one" && ! -L "${lab}/two" ]]
    @eq "${#FS_LOCKS[@]}" 0

}
test:core:fs:never-publishes-a-failed-write () {

    local file="${TMPDIR}/kept.txt"

    printf 'kept\n' | core:fs:file:write "${file}" 644

    @errors 'Write failed' core:fs:file:write "${file}" 644 false
    @eq "$(cat "${file}")" kept
    @errors 'Write failed' core:fs:file:edit "${file}" -e 'bad sed {'
    @eq "$(cat "${file}")" kept
    @eq "$(find "${TMPDIR}" -name '*.tmp.*' | wc -l | tr -d ' ')" 0 'no staging leftovers'

    core:fs:file:write "${file}" 600 printf 'made\n'
    @eq "$(cat "${file}")" made

    mkdir -p "${TMPDIR}/dir"
    @errors 'A directory is in the way' core:fs:file:write "${TMPDIR}/dir" < /dev/null

    ( cd -- "${TMPDIR}" && printf bare | core:fs:file:write bare.txt )
    @eq "$(cat "${TMPDIR}/bare.txt")" bare 'a bare file name lands in the current directory'
    @eq "$(core:fs:path:parent /x)" /
    @eq "$(core:fs:path:parent a/b/c)" a/b

}
test:core:fs:replaces-a-tree-whole () {

    local target="${TMPDIR}/target" tree="${TMPDIR}/tree"

    mkdir -p "${target}/.git" "${target}/old" "${tree}/new"
    printf head > "${target}/.git/HEAD"
    printf old > "${target}/old/file"
    printf new > "${tree}/new/file"

    core:fs:tree:replace "${target}" "${tree}"

    @eq "$(cat "${target}/new/file")" new
    @eq "$(cat "${target}/.git/HEAD")" head
    [[ ! -e "${target}/old" ]]
    @eq "$(find "${target}" -maxdepth 1 -name '.stage.*' -o -maxdepth 1 -name '.old.*' | wc -l | tr -d ' ')" 0

    chmod 000 "${tree}/new/file"
    @errors 'Cannot fill' core:fs:tree:replace "${target}" "${tree}"
    chmod 644 "${tree}/new/file"
    @eq "$(cat "${target}/new/file")" new 'a failed copy leaves the old tree whole'
    @errors 'Not a directory' core:fs:tree:replace "${target}" "${TMPDIR}/none"

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
test:core:fs:never-copies-a-link () {

    local root="${TMPDIR}/root" tree="${TMPDIR}/tree"

    mkdir -p "${root}"
    printf one > "${root}/one"
    ln -s /etc/hostname "${root}/link"

    @errors 'A symlink never travels: link' core:fs:tree:copy "${root}" "${tree}" <<< $'one\tone\nlink\tlink'

}
test:core:fs:restores-the-old-tree () {

    local target="${TMPDIR}/target"

    mkdir -p "${target}/.git" "${target}/.stage.x" "${target}/.old.x"
    printf old > "${target}/.old.x/kept"
    printf new > "${target}/fresh"

    core:fs:tree:restore "${target}" "${target}/.stage.x" "${target}/.old.x" 2

    @eq "$(cd -- "${target}" && printf '%s ' * .[!.]*)" 'kept .git '
    @eq "$(cat "${target}/kept")" old

    mkdir -p "${target}/.stage.y" "${target}/.old.y"
    mv -- "${target}/kept" "${target}/.old.y/"
    printf left > "${target}/left"

    core:fs:tree:restore "${target}" "${target}/.stage.y" "${target}/.old.y" 1

    @eq "$(cd -- "${target}" && printf '%s ' * .[!.]*)" 'kept left .git '

}
