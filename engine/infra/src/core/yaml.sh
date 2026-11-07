core:yaml:indent () {

    local line="${1}" head=""

    head="${line%%[! ]*}"

    core:log:print "${#head}"

}
core:yaml:prune () {

    local file="${1}" pattern="${2}" mode="${3:-block}" staging=""

    [[ -f "${file}" ]] || return 0

    staging="$(core:fs:temp:file)" || return

    awk -v pattern="${pattern}" -v mode="${mode}" '
        function ind ( s ) { match(s, /^ */); return RLENGTH }
        function cut ( i,  d ) { d = ind(L[i]); X[i] = 1; while ( ++i <= n && (L[i] !~ /[^ ]/ || ind(L[i]) > d) ) X[i] = (L[i] ~ /[^ ]/) }
        { L[++n] = $0 }
        END {
            for ( i = 1; i <= n; i++ ) if ( !X[i] && L[i] ~ pattern ) { if ( mode ~ /^[0-9]+$/ ) { for ( j = i; j && !(ind(L[j]) == mode + 0 && L[j] ~ /[^ ]/); j-- ); cut(j ? j : i) } else if ( mode == "self" || L[i] ~ /^ *- / || L[i] ~ /^ *[A-Za-z_.$-][^:]*: *$/ ) cut(i); else { for ( j = i - 1; j && !((L[j] ~ /^ *- / || L[j] ~ /^ *[A-Za-z_.$-][^:]*: *$/) && ind(L[j]) < ind(L[i])); j-- ); cut(j ? j : i) } }
            for ( i = p = 1; i <= n; i++ ) if ( !X[i] ) { b = (L[i] !~ /[^ ]/); if ( !(b && p) ) print L[i]; p = b }
        }
    ' "${file}" > "${staging}" || { core:error:fail "Cannot prune ${file}"; return; }

    core:fs:file:read "${staging}" | core:fs:file:write "${file}" 644

}
core:yaml:erase () {

    local file="${1}" key="${2}"

    core:yaml:prune "${file}" "^ *${key}:( |$)" self

}
core:yaml:hollow () {

    local file="${1}" key="${2:-with}" staging=""

    [[ -f "${file}" ]] || return 0

    staging="$(core:fs:temp:file)" || return

    awk -v key="${key}" '
        function ind ( s ) { match(s, /^ */); return RLENGTH }
        { L[++n] = $0 }
        END {
            for ( i = 1; i <= n; i++ ) if ( L[i] ~ ("^ *(- )?" key ": *$") ) { for ( j = i + 1; j <= n && L[j] !~ /[^ ]/; j++ ); X[i] = (j > n || ind(L[j]) <= ind(L[i])) }
            for ( i = p = 1; i <= n; i++ ) if ( !X[i] ) { b = (L[i] !~ /[^ ]/); if ( !(b && p) ) print L[i]; p = b }
        }
    ' "${file}" > "${staging}" || { core:error:fail "Cannot hollow ${file}"; return; }

    core:fs:file:read "${staging}" | core:fs:file:write "${file}" 644

}
core:yaml:sub () {

    local file="${1}"

    shift

    [[ -f "${file}" ]] || return 0

    core:fs:file:edit "${file}" "$@" || { core:error:fail "Cannot rewrite ${file}"; return; }

}
core:yaml:keys () {

    local file="${1}" depth="${2:-0}" line="" pad=""

    [[ -f "${file}" ]] || return 0

    printf -v pad '%*s' "${depth}" ''

    while IFS= read -r line || [[ -n "${line}" ]]; do
        [[ "${line}" =~ ^${pad}([A-Za-z_.$-][^:[:space:]]*):[[:space:]]*$ ]] && core:log:print "${BASH_REMATCH[1]}"
    done < "${file}"

    return 0

}
