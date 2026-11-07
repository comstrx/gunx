declare -ga LAW_LAYERS=( core config module app )
declare -gA LAW_OWNERS=()
declare -g LAW_MACROS=module/bundle/src/macro.sh

module:bundle:law:layer () {

    local path="${1}" layer=""

    case "${path}" in
        src/main.sh)        core:log:print app; return 0 ;;
        src/*/*)            layer="${path#src/}"; layer="${layer%%/*}" ;;
        tests/*.test.sh)    core:log:print test; return 0 ;;
        benches/*.bench.sh) core:log:print bench; return 0 ;;
        fuzz/*.fuzz.sh)     core:log:print fuzz; return 0 ;;
        *)                  return 1 ;;
    esac

    core:list:has "${layer}" "${LAW_LAYERS[@]}" || return 1

    core:log:print "${layer}"

}
module:bundle:law:rank () {

    case "${1}" in
        core)            core:log:print 0 ;;
        config)          core:log:print 1 ;;
        module)          core:log:print 2 ;;
        app)             core:log:print 3 ;;
        test|bench|fuzz) core:log:print 4 ;;
        *)               return 1 ;;
    esac

}
module:bundle:law:prefix () {

    local path="${1}" layer="" rest="" domain=""

    layer="$(module:bundle:law:layer "${path}")" || return

    case "${path}" in
        src/app/index.sh)           core:log:print app; return 0 ;;
        src/module/*/index.sh)      core:log:print ""; return 0 ;;
        src/module/*/src/*.sh)      rest="${path#src/module/}"; domain="${rest%%/*}"; rest="${rest#*/src/}" ;;
        src/module/*)               core:error:fail "${path}: a module keeps its code under src/ and its data under template/"; return ;;
        src/*/*/*)                  core:error:fail "${path}: ${layer} is flat, one file per domain"; return ;;
        src/main.sh|src/*/index.sh) core:log:print ""; return 0 ;;
        src/*)                      rest="${path#src/*/}"; domain="${rest%.sh}" ;;
        *)                          core:log:print "${layer}"; return 0 ;;
    esac

    [[ "${rest}" != */* ]] || { core:error:fail "${path}: a module's src is flat"; return; }

    core:validate:name "${domain}" || { core:error:fail "${path}: a domain is a lowercase name"; return; }

    core:log:print "${layer}:${domain}"

}
module:bundle:law:sources () {

    local root="${1}" folder="" suffix="" file="" relative=""

    while IFS= read -r -d '' file; do

        relative="${file#"${root}/"}"
        module:bundle:law:layer "${relative}" >/dev/null || { core:error:fail "${relative}: outside every layer"; return; }

        core:log:print "${relative}"

    done < <(core:fs:tree:files "${root}/src" .sh)

    for folder in tests benches fuzz; do

        suffix="${folder%es}"
        suffix=".${suffix%s}.sh"

        while IFS= read -r -d '' file; do
            core:log:print "${file#"${root}/"}"
        done < <(core:fs:tree:files "${root}/${folder}" "${suffix}")

    done

}
module:bundle:law:named () {

    local prefix="${1}" function="${2}"

    case "${prefix}" in
        test)        [[ "${function}" =~ ^(test|fixture):[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)+$ ]] ;;
        bench|fuzz)  [[ "${function}" =~ ^${prefix}:[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)+$ ]] ;;
        *)           [[ "${function}" =~ ^${prefix}(:[a-z][a-z0-9-]*)+$ ]] ;;
    esac

}
module:bundle:law:definitions () {

    local root="${1}" relative="" line="" number=0 prefix="" function="" failed=0

    LAW_OWNERS=()

    while IFS= read -r relative; do

        prefix="$(module:bundle:law:prefix "${relative}")" || { failed=1; continue; }
        number=0

        while IFS= read -r line || [[ -n "${line}" ]]; do

            number=$(( number + 1 ))

            [[ "${line}" =~ ^(@?[a-z][a-z0-9:-]*)[[:space:]]\(\)[[:space:]]\{$ ]] || continue

            function="${BASH_REMATCH[1]}"

            [[ -z "${LAW_OWNERS[${function}]:-}" ]] \
                || { core:error:fail "${relative}:${number}: ${function} is already defined in ${LAW_OWNERS[${function}]}"; failed=1; }

            LAW_OWNERS["${function}"]="${relative}"

            [[ -n "${prefix}" ]] || { core:error:fail "${relative}:${number}: a facade holds no function"; failed=1; continue; }

            if [[ "${relative}" == "src/${LAW_MACROS}" ]]; then

                [[ "${function}" =~ ^@[a-z][a-z0-9-]*$ ]] \
                    || { core:error:fail "${relative}:${number}: ${function} is not a macro name (@verb)"; failed=1; }

                continue

            fi

            [[ "${function}" != @* ]] || {

                core:error:fail "${relative}:${number}: a macro lives in ${LAW_MACROS} only"
                failed=1
                continue

            }


            module:bundle:law:named "${prefix}" "${function}" \
                || { core:error:fail "${relative}:${number}: ${function} must be named ${prefix}:<verb>"; failed=1; }

        done < "${root}/${relative}"

    done < <(module:bundle:law:sources "${root}")

    (( failed == 0 ))

}
module:bundle:law:tokens () {

    local line="${1}" rest="${1}" token=""

    while [[ "${rest}" =~ (^|[[:space:]\(\{;\&\|])(@[a-z][a-z0-9-]*)([[:space:]]|$) ]]; do

        core:log:print "${BASH_REMATCH[2]}"
        rest="${rest#*"${BASH_REMATCH[2]}"}"

    done

    line="${line//[^a-z0-9:-]/ }"

    for token in ${line}; do
        [[ "${token}" == *:* && "${token}" != *::* && "${token}" != :* && "${token}" != -* ]] && core:log:print "${token}"
    done

    return 0

}
module:bundle:law:call () {

    local layer="${1}" token="${2}" relative="${3:-}" callee="" rank=0 wanted=0

    if [[ "${token}" == @* ]]; then

        [[ "${layer}" == app || "${layer}" == module || "${layer}" == test || "${layer}" == bench || "${layer}" == fuzz ]] \
            || { core:error:fail "${layer} cannot call the macro ${token}; macros sit above core and config"; return; }

        [[ "${layer}" == test || -n "${LAW_OWNERS[${token}]:-}" ]] \
            || { core:error:fail "${token} is not a macro of ${LAW_MACROS}"; return; }

        return 0

    fi

    callee="${token%%:*}"
    core:list:has "${callee}" "${LAW_LAYERS[@]}" || return 0

    module:bundle:law:reach "${relative}" "${token}" || return

    rank="$(module:bundle:law:rank "${layer}")" || return
    wanted="$(module:bundle:law:rank "${callee}")" || return

    (( wanted <= rank )) || { core:error:fail "${layer} cannot call ${token} of ${callee}"; return; }

    [[ "${token}" == *: || "${rank}" -eq 4 ]] && return 0

    [[ -n "${LAW_OWNERS[${token}]:-}" ]] || { core:error:fail "${token} is not defined anywhere"; return; }

}
module:bundle:law:reach () {

    local relative="${1}" token="${2}" caller="" callee="" rest="" core="core" facade="parse"

    case "${token}" in
        "${core}:toml:"*|"${core}:yaml:"*)
            [[ "${relative}" == "src/${core}/${facade}.sh" || "${relative}" == "src/${core}/toml.sh" || "${relative}" == "src/${core}/yaml.sh" || "${relative}" == tests/* ]] \
                || { core:error:fail "${token} is reached through ${core}:${facade} only"; return; }
        ;;
    esac

    [[ "${token}" == module:*:* && "${relative}" == src/module/*/* ]] || return 0

    rest="${relative#src/module/}"
    caller="${rest%%/*}"
    rest="${token#module:}"
    callee="${rest%%:*}"

    [[ "${caller}" != "${callee}" && "${callee}" != bundle ]] || return 0

    [[ "${caller}" == extract && "${callee}" == gate && "${relative}" == src/module/extract/src/gate.sh ]] \
        || { core:error:fail "a module never calls ${token} of another module; only bundle is shared"; return; }

}
module:bundle:law:lines () {

    local root="${1}" relative="" line="" number=0 failed=0 layer="" token="" message="" cfg="" banned="ev" unsafe="sed -" owner=""

    banned+="al"
    owner="${MANIFEST[meta.authors.0]:-}"
    unsafe+="i|shuf|readlink -f|date -d|grep -P|g?timeout |sudo "

    while IFS= read -r relative; do

        layer="$(module:bundle:law:layer "${relative}")" || { failed=1; continue; }
        number=0
        cfg=""

        while IFS= read -r line || [[ -n "${line}" ]]; do

            number=$(( number + 1 ))

            [[ "${relative}" == src/main.sh && number -eq 1 ]] && continue

            [[ "${layer}" != core || "${line}" != '#cfg['* ]] || {

                core:error:fail "${relative}:${number}: core is a standard library; proofs live in the module and the proof folders"
                failed=1

            }

            if [[ -n "${cfg}" ]]; then

                [[ "${line}" =~ ^@?[a-z][a-z0-9:-]*[[:space:]]\(\)[[:space:]]\{$ ]] \
                    || { core:error:fail "${relative}:${number}: ${cfg} must sit right above a function"; failed=1; }

                cfg=""

            fi

            if [[ "${line}" =~ ^\#cfg\[(test|bench|fuzz)\]$ ]]; then cfg="${line}"; continue; fi

            [[ "${layer}" == test || ! "${line}" =~ ^[[:space:]]*\# ]] \
                || { core:error:fail "${relative}:${number}: a comment; the code must say it"; failed=1; }

            [[ "${layer}" == test || ! "${line}" =~ (^|[^a-zA-Z0-9_-])${banned}([^a-zA-Z0-9_-]|$) ]] \
                || { core:error:fail "${relative}:${number}: ${banned} is refused; a value never becomes executable"; failed=1; }

            [[ "${layer}" != test && "${layer}" != bench && "${layer}" != fuzz || -z "${owner}" || "${line}" != *"${owner}"* ]] \
                || { core:error:fail "${relative}:${number}: the owner is spelled; a proof reads config:meta:owner"; failed=1; }

            [[ "${layer}" == core || "${layer}" == test || ! "${line}" =~ (^|[[:space:]\(])(${unsafe})(.*)$ ]] \
                || { core:error:fail "${relative}:${number}: ${BASH_REMATCH[2]%% *} is not portable or not guarded; call the core verb"; failed=1; }

            [[ "${line}" =~ ^(@?[a-z][a-z0-9:-]*)[[:space:]]\(\)[[:space:]]\{$ ]] && continue

            for token in $(module:bundle:law:tokens "${line}"); do

                [[ "${token}" != @* || "${relative}" != src/module/bundle/* || "${relative}" == "src/${LAW_MACROS}" ]] || {
                    
                    core:error:fail "${relative}:${number}: the bundle module never calls a macro (${token}); it provides them"
                    failed=1
                    continue

                }

                message="$(module:bundle:law:call "${layer}" "${token}" "${relative}" 2>&1)" \
                    || { core:error:fail "${relative}:${number}: ${message#\[-\] }"; failed=1; }

            done

        done < "${root}/${relative}"

        [[ -z "${cfg}" ]] || { core:error:fail "${relative}: ${cfg} at the end of the file"; failed=1; }

        [[ "${layer}" != core || "${number}" -le 500 ]] \
            || { core:error:fail "${relative}: ${number} lines; a core domain stays under 500"; failed=1; }

    done < <(module:bundle:law:sources "${root}")

    (( failed == 0 ))

}
module:bundle:law:coverage () {

    local root="${1}" relative="" prefix="" function="" failed=0
    local -A domains=() proven=()

    while IFS= read -r relative; do

        prefix="$(module:bundle:law:prefix "${relative}" 2>/dev/null)" || continue
        [[ "${relative}" == src/* && -n "${prefix}" ]] || continue
        grep -qE "^${prefix}(:[a-z][a-z0-9-]*)+ \(\) \{$" -- "${root}/${relative}" || continue

        domains["${prefix}"]="${relative}"

        while IFS= read -r function; do
            proven["${prefix}"]=1
        done < <(module:bundle:cfg test "${root}/${relative}")

    done < <(module:bundle:law:sources "${root}")

    for function in "${!LAW_OWNERS[@]}"; do

        [[ "${function}" == test:* ]] || continue

        for prefix in "${!domains[@]}"; do
            [[ "${function}" != "test:${prefix}:"* ]] || proven["${prefix}"]=1
        done

    done

    for prefix in "${!domains[@]}"; do

        [[ -n "${proven[${prefix}]:-}" ]] \
            || { core:error:fail "${domains[${prefix}]}: no test:${prefix}:* case and no #cfg[test] function"; failed=1; }

    done

    (( failed == 0 ))

}
module:bundle:law:check () {

    local root="${1}" failed=0

    module:bundle:law:definitions "${root}" || failed=1
    module:bundle:law:lines "${root}" || failed=1
    module:bundle:law:coverage "${root}" || failed=1

    (( failed == 0 )) || { core:error:fail "The laws refused the tree"; return; }

}
module:bundle:cfg () {

    local kind="${1}" file="" line="" armed=0

    shift

    for file in "$@"; do

        armed=0

        while IFS= read -r line || [[ -n "${line}" ]]; do

            if (( armed == 1 )); then

                [[ ! "${line}" =~ ^(@?[a-z][a-z0-9:-]*)[[:space:]]\(\)[[:space:]]\{$ ]] || core:log:print "${BASH_REMATCH[1]}"

                armed=0

            fi

            [[ "${line}" != "#cfg[${kind}]" ]] || armed=1

        done < "${file}"

    done

}
module:bundle:cfg:sources () {

    local kind="${1}" file=""
    local -a files=()

    if [[ "${TOOL_BUNDLED:-false}" == true ]]; then
        files=( "${TOOL_BIN}" )
    else
        while IFS= read -r -d '' file; do
            files+=( "${file}" )
        done < <(core:fs:tree:files "${TOOL_ENGINE}/${MANIFEST[paths.source]}" .sh)
    fi

    module:bundle:cfg "${kind}" "${files[@]}"

}
module:bundle:syntax () {

    local root="${1}" folder="" file="" failed=0

    for folder in "${MANIFEST[paths.source]}" "${MANIFEST[paths.tests]}" "${MANIFEST[paths.benches]}" "${MANIFEST[paths.fuzz]}"; do

        while IFS= read -r -d '' file; do
            bash -n "${file}" || failed=1
        done < <(core:fs:tree:files "${root}/${folder}" .sh)

    done

    (( failed == 0 )) || { core:error:fail "Syntax check failed"; return; }

}
module:bundle:check () {

    local bundle="" failed=0

    bundle="$(module:bundle:build:current)" || return

    bash -n "${bundle}" || failed=1
    module:bundle:tool:run shellcheck --shell=bash --severity="$(config:tools:get shellcheck severity style)" --exclude="$(config:tools:get shellcheck excludes)" "${bundle}" || failed=1

    if [[ "${TOOL_BUNDLED:-false}" != true ]]; then

        module:bundle:syntax "${TOOL_ENGINE}" || failed=1
        module:bundle:law:check "${TOOL_ENGINE}" || failed=1

    fi

    (( failed == 0 )) || { core:error:fail "Check failed"; return; }

    core:log:succ "Syntax, ShellCheck and the laws passed"

}
