core:parse:unquote () {

    local value="${1}"

    if [[ "${value}" =~ ^\"(.*)\"$ ]]; then core:log:print "${BASH_REMATCH[1]}"
    elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then core:log:print "${BASH_REMATCH[1]}"
    else core:log:print "${value}"
    fi

}
core:parse:env () {

    local -n _pairs="${1}"
    local -n _order="${2}"

    local file="${3}" line="" key="" value="" quote="" rest="" number=0 LC_ALL=C

    _pairs=()
    _order=()

    while IFS= read -r line || [[ -n "${line}" ]]; do

        number=$(( number + 1 ))

        [[ -n "${line// }" && "${line}" != \#* ]] || continue

        key="${line%%=*}"
        value="${line#*=}"

        [[ "${line}" == *=* && "${key}" == [A-Z]* && "${key}" != *[!A-Z0-9_]* ]] \
            || { core:error:fail "${file}:${number}: expected KEY=VALUE"; return; }

        value="${value#"${value%%[![:space:]]*}"}"
        quote="${value:0:1}"

        if [[ "${quote}" == \" || "${quote}" == \' ]]; then

            rest="${value:1}"

            [[ "${rest}" == *"${quote}"* ]] || { core:error:fail "${file}:${number}: ${key}: unterminated quote"; return; }

            value="${rest%%"${quote}"*}"
            rest="${rest#*"${quote}"}"
            rest="${rest#"${rest%%[![:space:]]*}"}"

            [[ -z "${rest}" || "${rest}" == \#* ]] || { core:error:fail "${file}:${number}: ${key}: text after the closing quote"; return; }

        else

            value="${value%%[[:space:]]#*}"
            value="${value%"${value##*[![:space:]]}"}"

        fi

        [[ -z "${_pairs[${key}]+x}" ]] || { core:error:fail "${file}:${number}: ${key} is repeated"; return; }

        _pairs["${key}"]="${value}"
        _order+=( "${key}" )

    done < "${file}"

}
core:parse:toml () {

    core:toml:read "$@"

}
core:parse:toml:drop () {

    core:toml:drop "$@"

}
core:parse:has () {

    local -n _table="${1}"

    [[ -n "${_table[${2:-}]+x}" ]]

}
core:parse:get () {

    local -n _table="${1}"
    local key="${2}"

    [[ -n "${_table[${key}]+x}" ]] || {

        (( $# >= 3 )) && { core:log:print "${3}"; return 0; }

        core:error:fail "Missing key: ${key}"
        return

    }

    core:log:print "${_table[${key}]}"

}
core:parse:count () {

    local -n _table="${1}"
    local count="${_table[${2:-}]:-0}"

    core:num:natural "${count}" || count=0

    core:log:print "${count}"

}
core:parse:list () {

    local -n _table="${1}"
    local key="${2}" count=0 index=0

    count="${_table[${key}]:-0}"
    core:num:natural "${count}" || return 0

    while (( index < count )); do

        core:log:print "${_table[${key}.${index}]:-}"
        index=$(( index + 1 ))

    done

}
core:parse:yaml:prune () {

    core:yaml:prune "$@"

}
core:parse:yaml:erase () {

    core:yaml:erase "$@"

}
core:parse:yaml:hollow () {

    core:yaml:hollow "$@"

}
core:parse:yaml:sub () {

    core:yaml:sub "$@"

}
core:parse:yaml:set () {

    core:yaml:set "$@"

}
core:parse:yaml:keys () {

    core:yaml:keys "$@"

}
