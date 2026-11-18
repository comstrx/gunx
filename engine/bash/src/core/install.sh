declare -g INSTALL_REFRESHED=""

core:install:command () {

    local command="${1:-}"

    (( $# == 0 )) || shift

    [[ -n "${command}" ]] || { core:error:fail "A command is required"; return; }

    ! core:sys:has "${command}" || return 0

    (( $# > 0 )) || set -- "${command}"

    core:install:package "$@" || return

    core:sys:has "${command}" || { core:error:fail "${command} is still missing after installing $*"; return; }

}
core:install:need () {

    local tool=""

    for tool in "$@"; do

        case "${tool}" in
            xz) core:install:command xz apt=xz-utils || return ;;
            *)  core:install:command "${tool}" || return ;;
        esac

    done

}
core:install:package () {

    local manager="" item="" name=""
    local -a defaults=() chosen=() lacking=()

    manager="$(core:pkg:manager)" || return

    for item in "$@"; do

        case "${item}" in
            *=*) [[ "${item%%=*}" != "${manager}" ]] || chosen+=( "${item#*=}" ) ;;
            *)   defaults+=( "${item}" ) ;;
        esac

    done

    (( ${#chosen[@]} > 0 )) || chosen=( "${defaults[@]}" )

    for name in "${chosen[@]}"; do
        [[ -z "${name}" ]] || core:pkg:run "${manager}" has "${name}" >/dev/null 2>&1 || lacking+=( "${name}" )
    done

    (( ${#lacking[@]} > 0 )) || return 0

    [[ "${INSTALL_REFRESHED}" == "${manager}" ]] || { core:pkg:refresh || return; INSTALL_REFRESHED="${manager}"; }

    core:proc:io core:pkg:install "${lacking[@]}"

}
core:install:archive () {

    local name="${1:-}" url="${2:-}" digest="${3:-}" into="${4:-}" member="${5:-${1:-}}" lock="" status=0

    core:validate:name "${name}" || { core:error:fail "Not a tool name: ${name}"; return; }
    core:validate:url "${url}" || { core:error:fail "Only an https download is installed: $(core:net:host "${url}")"; return; }
    core:validate:sha256 "${digest}" || { core:error:fail "Not a SHA-256 digest for ${name}"; return; }
    core:fs:path:relative "${member}" || { core:error:fail "Not a member path inside the archive of ${name}: ${member}"; return; }

    [[ -n "${into}" ]] || { core:error:fail "A destination folder is required for ${name}"; return; }

    core:install:need curl || return

    ! core:install:holds "${into}/${name}" "${digest}" || return 0

    core:fs:dir:new "${into}" 755 || return

    lock="${into}/.${name}.lock"
    core:fs:lock "${lock}" "${CONFIG[RUN_TIMEOUT]:-${CONFIG_BASE[RUN_TIMEOUT]}}" || return

    core:install:holds "${into}/${name}" "${digest}" || core:install:fetch "${name}" "${url}" "${digest}" "${into}" "${member}" || status=$?

    core:fs:unlock "${lock}"

    return "${status}"

}
core:install:holds () {

    local path="${1}" digest="${2}" mark="${1%/*}/.${1##*/}.sha256"

    [[ -x "${path}" && -f "${mark}" && "$(< "${mark}")" == "${digest}" ]]

}
core:install:fetch () {

    local name="${1}" url="${2}" digest="${3}" into="${4}" member="${5}" archive="" staging="" actual=""

    archive="$(core:fs:temp:file)" || return
    staging="$(core:fs:temp:dir)" || return

    core:net:fetch "${url}" "${archive}" || return
    actual="$(core:fs:file:hash "${archive}")" || return

    [[ "${actual}" == "${digest}" ]] || {

        rm -f -- "${archive}"
        core:error:fail "${name} checksum mismatch: expected ${digest}, got ${actual}"
        return

    }

    core:install:unpack "${archive}" "${url}" "${member}" "${staging}" || return

    core:fs:file:write "${into}/${name}" 755 core:fs:file:read "${staging}/${member}" || return
    core:fs:file:write "${into}/.${name}.sha256" 644 core:log:print "${digest}" || return

    rm -rf -- "${archive}" "${staging}"

    core:log:info "installed ${name} into ${into}"

}
core:install:unpack () {

    local archive="${1}" url="${2%%[?#]*}" member="${3}" into="${4}" status=0

    case "${url}" in
        *.tar.gz|*.tgz) core:install:need tar gzip && tar -xzf "${archive}" -C "${into}" -- "${member}" || status=$? ;;
        *.tar.xz)       core:install:need tar xz && tar -xJf "${archive}" -C "${into}" -- "${member}" || status=$? ;;
        *.tar.bz2)      core:install:need tar bzip2 && tar -xjf "${archive}" -C "${into}" -- "${member}" || status=$? ;;
        *.zip)          core:install:need unzip && unzip -q -o "${archive}" "${member}" -d "${into}" || status=$? ;;
        *.gz)           core:install:need gzip && gzip -dc "${archive}" > "${into}/${member}" || status=$? ;;
        *)              cp -- "${archive}" "${into}/${member}" || status=$? ;;
    esac

    (( status == 0 )) || { core:error:fail "Cannot unpack ${member} from ${url##*/}"; return; }
    [[ -f "${into}/${member}" && ! -L "${into}/${member}" ]] || { core:error:fail "${url##*/} holds no file ${member}"; return; }

}
core:install:cargo () {

    local crate="${1:-}" version="${2:-}" listed=""
    local -a argv=()

    [[ "${crate}" =~ ^[a-z0-9_-]+$ ]] || { core:error:fail "Not a crate name: ${crate}"; return; }
    [[ -z "${version}" ]] || core:validate:semver "${version}" || { core:error:fail "Not a version of ${crate}: ${version}"; return; }

    core:sys:need cargo || return

    listed=$'\n'"$(cargo install --list 2>/dev/null)"

    if [[ -n "${version}" ]]; then [[ "${listed}" != *$'\n'"${crate} v${version}:"* ]] || return 0
    else [[ "${listed}" != *$'\n'"${crate} v"* ]] || return 0
    fi

    if [[ "${crate}" != cargo-binstall ]] && cargo binstall -V >/dev/null 2>&1; then
        argv=( binstall -y --locked "${crate}${version:+@${version}}" )
    else
        argv=( install --locked "${crate}" ); [[ -z "${version}" ]] || argv+=( --version "${version}" )
    fi

    core:proc:io cargo "${argv[@]}" >/dev/null \
        || { core:error:fail "Cannot install ${crate}${version:+ ${version}} with cargo"; return; }

}
core:install:go () {

    local module="${1:-}" version="${2:-}" name="" bin="" kind="" path="" built=""

    [[ "${module}" =~ ^[A-Za-z0-9._~-]+(/[A-Za-z0-9._~-]+)+$ ]] || { core:error:fail "Not a Go module path: ${module}"; return; }
    [[ "${version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]] || { core:error:fail "Go installs a pinned version of ${module}: ${version}"; return; }

    core:sys:need go || return

    name="${module##*/}"
    bin="$(go env GOBIN 2>/dev/null)" || bin=""
    [[ -n "${bin}" ]] || bin="$(go env GOPATH)/bin"

    if [[ -x "${bin}/${name}" ]]; then

        while IFS=$'\t' read -r kind path built _; do
            [[ "${kind}" != mod || "${built}" != "${version}" ]] || return 0
        done < <(go version -m "${bin}/${name}" 2>/dev/null)

    fi

    core:proc:io go install "${module}@${version}" || { core:error:fail "Cannot install ${module} ${version} with go"; return; }

}
core:install:rustup () {

    local toolchain="${1:-}" component=""
    local -a argv=()

    (( $# == 0 )) || shift

    [[ "${toolchain}" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || { core:error:fail "Not a Rust toolchain: ${toolchain}"; return; }

    core:sys:need rustup || return

    argv=( toolchain install "${toolchain}" --profile minimal )

    for component in "$@"; do
        argv+=( --component "${component}" )
    done

    core:proc:io rustup "${argv[@]}" >/dev/null \
        || { core:error:fail "Cannot install the ${toolchain} toolchain with rustup"; return; }

}
core:install:uv () {

    local tool="${1:-}" version="${2:-}"

    [[ "${tool}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { core:error:fail "Not a Python tool name: ${tool}"; return; }
    [[ -z "${version}" ]] || core:validate:semver "${version}" || { core:error:fail "Not a version of ${tool}: ${version}"; return; }

    core:sys:need uv || return

    [[ $'\n'"$(uv tool list 2>/dev/null)" != *$'\n'"${tool} v${version}"* ]] || return 0

    core:proc:io uv tool install --force "${tool}${version:+==${version}}" >/dev/null \
        || { core:error:fail "Cannot install ${tool}${version:+ ${version}} with uv"; return; }

}
core:install:bun () {

    local package="${1:-}" version="${2:-}"

    [[ "${package}" =~ ^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$ ]] || { core:error:fail "Not a package name: ${package}"; return; }
    [[ -z "${version}" ]] || core:validate:semver "${version}" || { core:error:fail "Not a version of ${package}: ${version}"; return; }

    core:sys:need bun || return

    [[ "$(bun pm ls -g 2>/dev/null)" != *" ${package}@${version}"* ]] || return 0

    core:proc:io bun add -g "${package}${version:+@${version}}" >/dev/null \
        || { core:error:fail "Cannot install ${package}${version:+ ${version}} with bun"; return; }

}
