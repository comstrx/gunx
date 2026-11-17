declare -g TOML_REST="" TOML_ITEM="" TOML_DEPTH=0 TOML_CUT=-1

core:toml:value () {

    local -n _into="${1}"
    local key="${2}" text="${3}" item="" index=0 name="" char=""

    text="${text#"${text%%[![:space:]]*}"}"

    case "${text}" in
        \"*)
            text="${text#\"}"
            item="${text%%\"*}"
            [[ "${item}" != "${text}" ]] || { core:error:fail "unterminated string"; return; }
            if [[ "${item}" == *\\* ]]; then
                core:toml:string "${text}" || return
                item="${TOML_ITEM}"
            else
                TOML_REST="${text#"${item}"\"}"
            fi
            _into["${key}"]="${item}"
        ;;
        \'*)
            text="${text#\'}"
            item="${text%%\'*}"
            [[ "${item}" != "${text}" ]] || { core:error:fail "unterminated string"; return; }
            _into["${key}"]="${item}"
            TOML_REST="${text#"${item}"\'}"
        ;;
        \[*)
            text="${text#[}"
            while true; do
                text="${text#"${text%%[![:space:],]*}"}"
                [[ "${text}" != \]* ]] || { TOML_REST="${text#]}"; break; }
                [[ -n "${text}" ]] || { core:error:fail "unterminated array"; return; }
                core:toml:value "${!_into}" "${key}.${index}" "${text}" || return
                text="${TOML_REST}"
                index=$(( index + 1 ))
            done
            _into["${key}"]="${index}"
        ;;
        \{*)
            text="${text#\{}"
            while true; do
                text="${text#"${text%%[![:space:],]*}"}"
                [[ "${text}" != \}* ]] || { TOML_REST="${text#\}}"; break; }
                name="${text%%[[:space:]=]*}"
                [[ "${name}" == [a-z]* && "${name}" != *[!a-z0-9_-]* ]] || { core:error:fail "expected key = value inside { }"; return; }
                text="${text#"${name}"}"
                text="${text#"${text%%[![:space:]]*}"}"
                [[ "${text}" == =* ]] || { core:error:fail "expected = after ${name}"; return; }
                core:toml:value "${!_into}" "${key}.${name}" "${text#=}" || return
                text="${TOML_REST}"
                index=$(( index + 1 ))
            done
            _into["${key}"]="${index}"
        ;;
        *)
            item=""
            while [[ -n "${text}" ]]; do
                char="${text:0:1}"
                case "${char}" in ']'|'}'|','|' '|$'\t') break ;; esac
                item+="${char}"
                text="${text#?}"
            done
            [[ "${item}" == true || "${item}" == false ]] || core:validate:number "${item}" \
                || { core:error:fail "a value is a quoted string, a number, a boolean, [ ] or { }"; return; }
            _into["${key}"]="${item}"
            TOML_REST="${text}"
        ;;
    esac

}
core:toml:string () {

    local text="${1}" item="" head="" char="" code="" width=4

    while true; do

        head="${text%%[\"\\]*}"
        [[ "${head}" != "${text}" ]] || { core:error:fail "unterminated string"; return; }

        item+="${head}"
        text="${text:${#head}}"
        char="${text:0:1}"
        text="${text:1}"

        [[ "${char}" != \" ]] || break

        char="${text:0:1}"
        text="${text:1}"

        case "${char}" in
            n)       item+=$'\n' ;;
            t)       item+=$'\t' ;;
            r)       item+=$'\r' ;;
            b)       item+=$'\b' ;;
            f)       item+=$'\f' ;;
            e)       item+=$'\e' ;;
            \"|\\)  item+="${char}" ;;
            u|U)
                width=4
                [[ "${char}" == u ]] || width=8
                code="${text:0:width}"
                [[ "${code}" =~ ^[0-9A-Fa-f]+$ && ${#code} -eq ${width} ]] || { core:error:fail "a bad unicode escape: \\${char}${code}"; return; }
                core:toml:utf8 char "${code}" || return
                item+="${char}"
                text="${text:width}"
            ;;
            *)       core:error:fail "an unknown escape: \\${char}"; return ;;
        esac

    done

    TOML_ITEM="${item}"
    TOML_REST="${text}"

}
core:toml:utf8 () {

    local -n _glyph="${1}"
    local code=$(( 16#${2} )) bytes=""

    if (( code < 0x80 )); then
        printf -v bytes '\\x%02x' "${code}"
    elif (( code < 0x800 )); then
        printf -v bytes '\\x%02x' $(( 0xC0 | code >> 6 )) $(( 0x80 | (code & 0x3F) ))
    elif (( code >= 0xD800 && code <= 0xDFFF )); then
        core:error:fail "a surrogate is not a character: ${2}"; return
    elif (( code < 0x10000 )); then
        printf -v bytes '\\x%02x' $(( 0xE0 | code >> 12 )) $(( 0x80 | (code >> 6 & 0x3F) )) $(( 0x80 | (code & 0x3F) ))
    elif (( code <= 0x10FFFF )); then
        printf -v bytes '\\x%02x' $(( 0xF0 | code >> 18 )) $(( 0x80 | (code >> 12 & 0x3F) )) $(( 0x80 | (code >> 6 & 0x3F) )) $(( 0x80 | (code & 0x3F) ))
    else
        core:error:fail "beyond unicode: ${2}"; return
    fi

    printf -v _glyph '%b' "${bytes}"

}
core:toml:depth () {

    local text="${1}" head="" char="" offset=0

    TOML_DEPTH=0
    TOML_CUT=-1

    while [[ -n "${text}" ]]; do

        head="${text%%[\"\'[{\]\}#]*}"
        offset=$(( offset + ${#head} ))
        text="${text:${#head}}"
        [[ -n "${text}" ]] || break

        char="${text:0:1}"
        text="${text:1}"
        offset=$(( offset + 1 ))

        case "${char}" in
            \")
                while [[ -n "${text}" ]]; do
                    head="${text%%[\"\\]*}"
                    char="${text:${#head}:1}"
                    text="${text:$(( ${#head} + 1 ))}"
                    offset=$(( offset + ${#head} + 1 ))
                    [[ "${char}" == \\ ]] || break
                    text="${text:1}"
                    offset=$(( offset + 1 ))
                done
            ;;
            \')
                head="${text%%\'*}"
                text="${text:$(( ${#head} + 1 ))}"
                offset=$(( offset + ${#head} + 1 ))
            ;;
            '['|'{') TOML_DEPTH=$(( TOML_DEPTH + 1 )) ;;
            ']'|'}') TOML_DEPTH=$(( TOML_DEPTH - 1 )) ;;
            '#')     TOML_CUT=$(( offset - 1 )); break ;;
        esac

    done

}
core:toml:read () {

    local -n _table="${1}"
    local file="${2}" line="" more="" section="" key="" value="" number=0 rest="" depth=0 LC_ALL=C

    _table=()

    while IFS= read -r line || [[ -n "${line}" ]]; do

        number=$(( number + 1 ))
        line="${line#"${line%%[![:space:]]*}"}"

        [[ -n "${line}" && "${line}" != \#* ]] || continue

        if [[ "${line}" == \[* ]]; then

            section="${line#[}"
            rest="${section#*]}"
            section="${section%%]*}"
            rest="${rest#"${rest%%[![:space:]]*}"}"

            [[ "${line}" == *]* && "${section}" == [a-z]* && "${section}" != *[!a-z0-9_.-]* ]] && [[ -z "${rest}" || "${rest}" == \#* ]] \
                || { core:error:fail "${file}:${number}: expected [section]"; return; }

            continue

        fi

        [[ "${line}" == *=* ]] || { core:error:fail "${file}:${number}: expected key = value"; return; }

        key="${line%%=*}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${line#*=}"
        value="${value#"${value%%[![:space:]]*}"}"

        [[ "${key}" == [a-z]* && "${key}" != *[!a-z0-9_-]* ]] || { core:error:fail "${file}:${number}: expected key = value"; return; }

        if [[ "${value}" == \[* || "${value}" == \{* ]]; then

            core:toml:depth "${value}"
            depth="${TOML_DEPTH}"

            (( TOML_CUT < 0 )) || value="${value:0:TOML_CUT}"

            while (( depth > 0 )) && IFS= read -r more; do

                number=$(( number + 1 ))
                more="${more#"${more%%[![:space:]]*}"}"

                if [[ "${more}" == *[][{}#\"\']* ]]; then

                    core:toml:depth "${more}"
                    depth=$(( depth + TOML_DEPTH ))

                    (( TOML_CUT < 0 )) || more="${more:0:TOML_CUT}"

                fi

                value+=" ${more}"

            done

        fi

        key="${section:+${section}.}${key}"

        [[ -z "${_table[${key}]+x}" ]] || { core:error:fail "${file}:${number}: ${key} is repeated"; return; }

        TOML_REST=""
        core:toml:value "${!_table}" "${key}" "${value}" || { core:error:fail "${file}:${number}: ${key}: bad value"; return; }

        rest="${TOML_REST#"${TOML_REST%%[![:space:]]*}"}"
        [[ -z "${rest}" || "${rest}" == \#* ]] || { core:error:fail "${file}:${number}: trailing text after the value: ${rest}"; return; }

    done < "${file}"

}
core:toml:drop () {

    local file="${1}" section="${2}" mode=""

    [[ -f "${file}" ]] || return 0
    [[ "${section}" == [a-z]* && "${section}" != *[!a-z0-9_.-]* ]] || { core:error:fail "Not a section name: ${section}"; return; }

    mode="$(core:fs:file:mode "${file}")" || return

    core:fs:file:write "${file}" "${mode}" core:toml:without "${file}" "${section}"

}
core:toml:without () {

    local file="${1}" section="${2}" line="" trimmed="" skip=0 depth=0 LC_ALL=C

    while IFS= read -r line || [[ -n "${line}" ]]; do

        trimmed="${line#"${line%%[![:space:]]*}"}"

        if (( depth == 0 )) && [[ "${trimmed}" == \[* ]]; then

            skip=0
            [[ "${trimmed}" != "[${section}]"* && "${trimmed}" != "[${section}."* ]] || skip=1

        elif [[ "${trimmed}" == *=* || depth -gt 0 ]] && [[ "${trimmed}" == *[][{}]* ]]; then

            (( depth > 0 )) || trimmed="${trimmed#*=}"

            core:toml:depth "${trimmed}"
            depth=$(( depth + TOML_DEPTH ))
            (( depth >= 0 )) || depth=0

        fi

        (( skip == 1 )) || printf '%s\n' "${line}"

    done < "${file}"

}
