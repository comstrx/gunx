declare -g TOML_REST="" TOML_DEPTH=0

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
                item=""
                while [[ "${text}" != \"* ]]; do
                    [[ -n "${text}" ]] || { core:error:fail "unterminated string"; return; }
                    [[ "${text}" != \\* ]] || text="${text#?}"
                    item+="${text:0:1}"
                    text="${text#?}"
                done
            else
                text="${text#"${item}"}"
            fi
            _into["${key}"]="${item}"
            TOML_REST="${text#\"}"
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
core:toml:depth () {

    local text="${1}" head="" char=""

    TOML_DEPTH=0

    while [[ -n "${text}" ]]; do

        head="${text%%['"[{]}#']*}"
        text="${text:${#head}}"
        [[ -n "${text}" ]] || break

        char="${text:0:1}"
        text="${text#?}"

        case "${char}" in
            '"')     text="${text#*'"'}" ;;
            '['|'{') TOML_DEPTH=$(( TOML_DEPTH + 1 )) ;;
            ']'|'}') TOML_DEPTH=$(( TOML_DEPTH - 1 )) ;;
            '#')     break ;;
        esac

    done

}
core:toml:read () {

    local -n _table="${1}"
    local file="${2}" line="" more="" section="" key="" value="" number=0 rest="" depth=0

    _table=()

    while IFS= read -r line || [[ -n "${line}" ]]; do

        number=$(( number + 1 ))
        line="${line#"${line%%[![:space:]]*}"}"

        [[ -n "${line}" && "${line}" != \#* ]] || continue

        depth=0
        [[ "${line}" != *['[{']* ]] || { core:toml:depth "${line}"; depth="${TOML_DEPTH}"; }

        while (( depth > 0 )) && IFS= read -r more; do
            number=$(( number + 1 ))
            line+=" ${more#"${more%%[![:space:]]*}"}"
            [[ "${more}" != *['[{]}']* ]] || { core:toml:depth "${more}"; depth=$(( depth + TOML_DEPTH )); }
        done

        if [[ "${line}" == \[*\]* ]]; then

            section="${line#[}"
            section="${section%%]*}"

            [[ "${section}" == [a-z]* && "${section}" != *[!a-z0-9_.-]* && -z "${line#*]}" ]] || { core:error:fail "${file}:${number}: expected [section]"; return; }

            continue

        fi

        [[ "${line}" == *=* ]] || { core:error:fail "${file}:${number}: expected key = value"; return; }

        key="${line%%=*}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${line#*=}"

        [[ "${key}" == [a-z]* && "${key}" != *[!a-z0-9_-]* ]] || { core:error:fail "${file}:${number}: expected key = value"; return; }

        key="${section:+${section}.}${key}"

        [[ -z "${_table[${key}]+x}" ]] || { core:error:fail "${file}:${number}: ${key} is repeated"; return; }

        TOML_REST=""
        core:toml:value "${!_table}" "${key}" "${value}" || { core:error:fail "${file}:${number}: ${key}: bad value"; return; }

        rest="${TOML_REST#"${TOML_REST%%[![:space:]]*}"}"
        [[ -z "${rest}" || "${rest}" == \#* ]] || { core:error:fail "${file}:${number}: trailing text after the value: ${rest}"; return; }

    done < "${file}"

}
