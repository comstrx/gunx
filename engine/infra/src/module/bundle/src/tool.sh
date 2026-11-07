module:bundle:tool:home () {

    config:paths:tools

}
module:bundle:tool:binary () {

    local name="${1}" home=""

    config:tools:has "${name}" || { core:error:fail "Unknown tool: ${name}; see [tools]"; return; }

    home="$(module:bundle:tool:home)" || return

    if [[ -x "${home}/${name}" ]]; then core:log:print "${home}/${name}"; return 0; fi

    core:sys:need "${name}" || return

    core:log:print "${name}"

}
module:bundle:tool:version () {

    local binary="${1}" line="" word=""

    while IFS= read -r line; do

        for word in ${line}; do
            [[ ! "${word#v}" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || { core:log:print "${BASH_REMATCH[0]}"; return 0; }
        done

    done < <("${binary}" --version 2>/dev/null)

    core:error:fail "Version unreadable: ${binary}"

}
module:bundle:tool:pinned () {

    local name="${1}" binary="" version=""

    binary="$(module:bundle:tool:binary "${name}")" || return
    version="$(module:bundle:tool:version "${binary}")" || return

    [[ "${version}" == "$(config:tools:version "${name}")" ]] || { core:error:fail "${name} ${version} is not the pinned $(config:tools:version "${name}"); run fetch"; return; }

}
module:bundle:tool:unpack () {

    local archive="${1}" url="${2}" inner="${3}" target="${4}" staging=""

    staging="$(core:fs:temp:dir)" || return

    case "${url}" in
        *.tar.xz) tar -xJf "${archive}" -C "${staging}" "${inner}" || { core:error:fail "Extraction failed: ${url##*/}"; return; } ;;
        *.tar.gz) tar -xzf "${archive}" -C "${staging}" "${inner}" || { core:error:fail "Extraction failed: ${url##*/}"; return; } ;;
        *.gz)     gzip -dc "${archive}" > "${staging}/${inner}" || { core:error:fail "Extraction failed: ${url##*/}"; return; } ;;
        *)        core:error:fail "Unknown archive kind: ${url##*/}"; return ;;
    esac

    core:fs:file:read "${staging}/${inner}" | core:fs:file:write "${target}" 755 || return

    rm -rf -- "${staging}"

}
module:bundle:tool:fetch () {

    local lock="" status=0

    lock="$(config:paths:lock "tool-${1}")" || return

    core:fs:lock "${lock}" "${CONFIG[RUN_TIMEOUT]:-300}" || return

    module:bundle:tool:download "$@" || status=$?

    core:fs:unlock "${lock}"

    return "${status}"

}
module:bundle:tool:download () {

    local name="${1}" version="" kernel="" arch="" url="" digest="" inner="" home="" archive="" actual=""

    version="$(config:tools:version "${name}")" || return

    kernel="$(core:sys:kernel)" || return
    arch="$(core:sys:arch)" || return
    url="$(config:manifest:get "archive.${name}_${kernel}_${arch}")" || return
    digest="$(config:manifest:get "downloads.${name}_${kernel}_${arch}")" || return
    home="$(module:bundle:tool:home)" || return

    url="${url//\{version\}/${version}}"
    inner="$(config:tools:get "${name}" binary "${name}")"
    inner="${inner//\{version\}/${version}}"

    core:sys:need tar gzip || return
    core:fs:dir:new "${home}" 755 || return

    archive="$(core:fs:temp:file)" || return

    core:net:fetch "${url}" "${archive}" || { core:error:fail "${name} download failed: ${url}"; return; }

    actual="$(core:fs:file:hash "${archive}")" || return
    [[ "${actual}" == "${digest}" ]] || { core:error:fail "${name} checksum mismatch: expected ${digest}, got ${actual}"; return; }

    module:bundle:tool:unpack "${archive}" "${url}" "${inner}" "${home}/${name}" || return

    rm -f -- "${archive}"
    core:log:info "fetched ${name} ${version} into ${home}"

    core:log:print "${home}/${name}"

}
module:bundle:tool:run () {

    local name="${1}" binary="" version=""

    shift

    binary="$(module:bundle:tool:binary "${name}")" || return
    version="$(module:bundle:tool:version "${binary}")" || return

    [[ "${version}" == "$(config:tools:version "${name}")" ]] \
        || core:log:warn "${name} ${version} differs from the pinned $(config:tools:version "${name}"); run fetch"

    "${binary}" "$@"

}
