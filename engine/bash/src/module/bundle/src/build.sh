module:bundle:build:alias () {

    local alias=""

    alias="$(core:cli:value --alias)" || alias="${1:-$(config:meta:alias)}"

    core:validate:name "${alias}" || { core:error:fail "An alias is a lowercase name: ${alias}"; return; }

    core:log:print "${alias}"

}
module:bundle:build:output () {

    local alias=""

    alias="$(module:bundle:build:alias)" || return

    core:log:print "${TOOL_ENGINE}/${MANIFEST[paths.build]}/${1}/${alias}"

}
module:bundle:build:stamps () {

    local mode="${1}" src="" repo=""

    src="$(core:cli:value --src)" || src="$(config:meta:src)"
    repo="$(core:cli:value --repo)" || repo="$(config:meta:repo)"

    [[ -z "${src}" ]] || src="$(cd -- "${src}" 2>/dev/null && pwd -P)" || { core:error:fail "--src names no folder: ${src}"; return; }
    [[ "${repo}" =~ ^[A-Za-z0-9._:/@-]*$ ]] || { core:error:fail "--repo is a repository address: ${repo}"; return; }

    PACK_STAMPS=( [meta.build]="${mode}" [meta.src]="${src:-${TOOL_ENGINE}}" )

    [[ -z "${repo}" ]] || PACK_STAMPS[meta.repo]="${repo}"

}
module:bundle:build:bundle () {

    local mode="${1}" output="" manifest=""

    [[ "${TOOL_BUNDLED:-false}" != true ]] || { core:error:fail "Builds require the source checkout"; return; }

    output="$(module:bundle:build:output "${mode}")" || return
    manifest="$(config:manifest:file "${TOOL_ENGINE}")" || return

    module:bundle:build:stamps "${mode}" || return

    module:bundle:pack:create "${TOOL_ENGINE}" "${output}" "${mode}" "${MANIFEST[paths.source]}" \
        "${MANIFEST[paths.entrypoint]}" "${MANIFEST[paths.tests]}" "${manifest##*/}" .env.example || return

    core:log:print "${output}"

}
module:bundle:build:dev () {

    module:bundle:build:bundle dev

}
module:bundle:build:release () {

    local output="" digest=""

    output="$(module:bundle:build:bundle release)" || return
    digest="$(core:fs:file:hash "${output}")" || return

    printf '%s  %s\n' "${digest}" "${output##*/}" | core:fs:file:write "${output%/*}/SHA256SUMS" 644 || return

    core:log:print "${output}"

}
module:bundle:build:checksum () {

    local output=""

    if [[ "${TOOL_BUNDLED:-false}" == true ]]; then output="${TOOL_BIN}"
    else output="$(module:bundle:build:output release)" || return
    fi

    [[ -f "${output}" ]] || { core:error:fail "No release bundle at ${output}; build it first"; return; }

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

    ! core:cli:flag --dev || ! core:cli:flag --release || { core:error:usage "--dev and --release do not meet"; return; }

    if core:cli:flag --dev; then module:bundle:build:dev
    else module:bundle:build:release
    fi

}
module:bundle:install:remote () {

    core:error:fail "Remote install and update are not available yet${1:+ (${1})}"

}
module:bundle:install:folder () {

    local alias="${1}" found=""

    core:cli:value --into && return 0

    if [[ "${TOOL_BUNDLED:-false}" == true ]]; then (cd -- "${TOOL_BIN%/*}" && pwd -P); return; fi

    found="$(command -v "${alias}" 2>/dev/null)" || found=""

    if [[ "${found}" == /* && -f "${found}" ]]; then core:log:print "${found%/*}"
    else config:meta:install
    fi

}
module:bundle:install:place () {

    local output="${1}" into="${2}" alias="${3}" ask="${4}" target="${2}/${3}"

    [[ -f "${output}" ]] || { core:error:fail "No release bundle to install: ${output:-none}"; return; }

    if [[ -e "${target}" && "${ask}" == true ]] && ! core:cli:flag --yes; then

        [[ -t 0 ]] || { core:error:fail "${target} exists already; pass --yes to replace it"; return; }

        core:ui:confirm "A command named ${alias} is already in ${into}; replace it?" \
            || { core:error:fail "${target} was kept"; return; }

    fi

    core:fs:dir:new "${into}" 755 || return
    core:fs:file:write "${target}" 755 core:fs:file:read "${output}" || return

    core:gh:path "${into}" || return

    [[ -n "${GITHUB_PATH:-}" || ":${PATH}:" == *":${into}:"* ]] || core:log:warn "${into} is not on PATH"

    core:log:succ "installed ${alias} into ${into}: $(core:fs:file:hash "${target}")"

    core:log:print "${target}"

}
module:bundle:install () {

    local alias="" into="" output=""

    alias="$(module:bundle:build:alias)" || return
    into="$(core:cli:value --into)" || into="$(config:meta:install)" || return

    if [[ "${TOOL_BUNDLED:-false}" == true ]]; then output="${TOOL_BIN}"
    else output="$(module:bundle:build:pick)" || return
    fi

    module:bundle:install:place "${output}" "${into}" "${alias}" true

}
module:bundle:update () {

    local alias="" known="" into="" output="" src="" repo="" current="" ask=false
    local -a flags=()

    known="$(config:meta:alias)" || return
    [[ "${TOOL_BUNDLED:-false}" != true ]] || known="${TOOL_BIN##*/}"

    alias="$(module:bundle:build:alias "${known}")" || return

    [[ "${alias}" == "${known}" ]] || ask=true

    into="$(module:bundle:install:folder "${known}")" || return

    if [[ "${TOOL_BUNDLED:-false}" != true ]]; then

        output="$(module:bundle:build:pick)" || return
        module:bundle:install:place "${output}" "${into}" "${alias}" "${ask}" || return

    else

        src="$(config:meta:src)"
        repo="$(config:meta:repo)"

        if [[ -n "${src}" && -f "${src}/${MANIFEST[paths.entrypoint]}" ]]; then

            flags=( --alias "${alias}" --into "${into}" )

            [[ "${ask}" == true ]] && ! core:cli:flag --yes || flags+=( --yes )

            if core:cli:flag --dev || { ! core:cli:flag --release && [[ "$(config:meta:build)" == dev ]]; }; then flags+=( --dev ); fi

            core:log:info "updating ${alias} from ${src}"
            bash "${src}/${MANIFEST[paths.entrypoint]}" self install "${flags[@]}" || { core:error:fail "The update from ${src} failed"; return; }

        elif [[ -n "${repo}" ]]; then module:bundle:install:remote "${repo}" || return
        else core:error:fail "The update failed: this build knows no source folder and no repository"; return
        fi

    fi

    current="${into}/${known}"

    [[ "${alias}" == "${known}" || ! -f "${current}" ]] || rm -f -- "${current}"

}
module:bundle:remove () {

    local target="" alias=""

    if [[ "${TOOL_BUNDLED:-false}" == true ]]; then target="$(cd -- "${TOOL_BIN%/*}" && pwd -P)/${TOOL_BIN##*/}" || return
    else

        alias="$(config:meta:alias)" || return
        target="$(command -v "${alias}" 2>/dev/null)" || target=""

        [[ "${target}" == /* ]] || target="$(config:meta:install)/${alias}"

    fi

    [[ -f "${target}" && ! -L "${target}" ]] || { core:error:fail "No installed command at ${target}"; return; }

    grep -q '^TOOL_BUNDLED=true$' -- "${target}" || { core:error:fail "${target} is not a build of this tool; it stays"; return; }

    rm -f -- "${target}" || { core:error:fail "Cannot remove ${target}"; return; }

    core:log:succ "removed ${target}"

}
