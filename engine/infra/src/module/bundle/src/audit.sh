module:bundle:audit:manifest () {

    local key="" failed=0

    for key in "${!MANIFEST[@]}"; do

        case "${key}" in
            tools.*.version)
                [[ "${MANIFEST[${key}]}" =~ ^[0-9]+(\.[0-9]+)*$ ]] \
                    || { core:error:fail "${key} is not a pinned version: ${MANIFEST[${key}]}" || failed=1; } ;;
            tools.*.*) ;;
            tools.*)
                [[ "${MANIFEST[${key}]}" =~ ^[0-9]+(\.[0-9]+)*$ || -n "${MANIFEST[${key}.version]+x}" ]] \
                    || { core:error:fail "${key} is not a pinned version: ${MANIFEST[${key}]}" || failed=1; } ;;
            downloads.*)
                core:validate:sha256 "${MANIFEST[${key}]}" \
                    || { core:error:fail "${key} is not a SHA-256 digest" || failed=1; } ;;
            archive.*)
                [[ "${MANIFEST[${key}]}" == https://* && -n "${MANIFEST[downloads.${key#archive.}]+x}" ]] \
                    || { core:error:fail "${key} needs an https URL and a digest" || failed=1; } ;;
            images.*)
                [[ "${MANIFEST[${key}]}" =~ @sha256:[0-9a-f]{64}$ ]] \
                    || { core:error:fail "${key} is not pinned by digest" || failed=1; } ;;
        esac

    done

    (( failed == 0 ))

}
module:bundle:audit:schema () {

    local file="${1}" key="" failed=0

    local -A pairs=()
    local -a order=()

    core:parse:env pairs order "${file}" || return

    for key in "${order[@]}"; do

        ! core:log:secret "${key}" || [[ -z "${pairs[${key}]}" ]] || \
            { core:error:fail "${file}: ${key} carries a value; a secret default is never written" || failed=1; }

    done

    (( failed == 0 ))

}
module:bundle:audit:sources () {

    local root="${1}" file="" line="" number=0 failed=0

    while IFS= read -r -d '' file; do

        number=0

        while IFS= read -r line || [[ -n "${line}" ]]; do

            number=$(( number + 1 ))

            [[ ! "${line}" =~ (PASSWORD|SECRET|TOKEN|CREDENTIAL)[A-Z_]*=[\"\']?[A-Za-z0-9+/_-]{8,} ]] \
                || { core:error:fail "${file#"${root}/"}:${number}: a secret-shaped value in a source" || failed=1; }

        done < "${file}"

    done < <(core:fs:tree:files "${root}" .sh)

    (( failed == 0 ))

}
module:bundle:audit:tools () {

    local name="" failed=0
    local -a names=( shellcheck )

    for name in "${names[@]}"; do
        module:bundle:tool:pinned "${name}" || failed=1
    done

    (( failed == 0 ))

}
module:bundle:audit:run () {

    local root="${TOOL_ENGINE}" failed=0

    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Audit runs from the source checkout"; return; }

    module:bundle:audit:manifest || failed=1
    module:bundle:audit:schema "${root}/.env.example" || failed=1
    module:bundle:audit:sources "${root}/${MANIFEST[paths.source]}" || failed=1
    module:bundle:audit:tools || failed=1

    (( failed == 0 )) || { core:error:fail "Audit failed"; return; }

    core:log:succ "Pins, digests, schema and sources passed the audit"

}
