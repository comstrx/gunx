module:bundle:fetch () {

    local name="" failed=0
    local -a names=( "$@" )

    (( ${#names[@]} > 0 )) || mapfile -t names < <(config:tools:fetchable)

    for name in "${names[@]}"; do
        module:bundle:tool:pinned "${name}" 2>/dev/null && { core:log:debug "${name} is already at $(config:tools:version "${name}")"; continue; }
        module:bundle:tool:fetch "${name}" >/dev/null || failed=1
    done

    (( failed == 0 )) || { core:error:fail "A tool could not be fetched"; return; }

    core:log:succ "every tool is at its pin under $(module:bundle:tool:home)"

}
module:bundle:build:output () {

    core:log:print "${TOOL_ROOT}/${MANIFEST[paths.build]}/${1}/${MANIFEST[meta.name]}"

}
module:bundle:build:bundle () {

    local mode="${1}" output=""

    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Builds require the source checkout"; return; }

    output="$(module:bundle:build:output "${mode}")" || return

    module:bundle:pack:create "${TOOL_ENGINE}" "${output}" "${mode}" "${MANIFEST[paths.source]}" \
        "${MANIFEST[paths.entrypoint]}" "${MANIFEST[paths.tests]}" infra.toml .env.example || return

    core:log:print "${output}"

}
module:bundle:build:dev () {

    module:bundle:build:bundle dev

}
module:bundle:build:release () {

    local output="" digest=""

    output="$(module:bundle:build:bundle release)" || return
    digest="$(core:fs:file:hash "${output}")" || return

    printf '%s  %s\n' "${digest}" "${MANIFEST[meta.name]}" | core:fs:file:write "${output%/*}/SHA256SUMS" 644 || return

    core:log:print "${output}"

}
module:bundle:build:checksum () {

    local output=""

    output="$(module:bundle:build:output release)" || return

    core:fs:file:hash "${output}"

}
module:bundle:build:current () {

    if [[ "${TOOL_BUNDLED:-false}" == true ]]; then core:log:print "${TOOL_BIN}"
    else module:bundle:build:dev
    fi

}
module:bundle:hello () {

    core:log:print "hello world"

}
module:bundle:build:pick () {

    if core:cli:flag --dev; then module:bundle:build:dev
    else module:bundle:build:release
    fi

}
module:bundle:install () {

    local alias="" into="" output="" target=""

    alias="$(core:cli:value --alias)" || alias="${MANIFEST[meta.name]}"
    into="$(core:cli:value --into)" || into="${XDG_BIN_HOME:-${HOME}/.local/bin}"

    [[ "${alias}" =~ ^[a-z][a-z0-9-]*$ ]] || { core:error:fail "An alias is a lowercase name: ${alias}"; return; }

    output="$(module:bundle:build:release)" || return
    target="${into}/${alias}"

    core:fs:dir:new "${into}" 755 || return
    core:fs:file:read "${output}" | core:fs:file:write "${target}" 755 || return

    if [[ -n "${GITHUB_PATH:-}" ]]; then
        printf '%s\n' "${into}" >> "${GITHUB_PATH}" || { core:error:fail "Cannot extend GITHUB_PATH"; return; }
    elif [[ ":${PATH}:" != *":${into}:"* ]]; then
        core:log:warn "${into} is not on PATH"
    fi

    core:log:succ "installed ${alias} into ${into}: $(core:fs:file:hash "${target}")"

    core:log:print "${target}"

}
