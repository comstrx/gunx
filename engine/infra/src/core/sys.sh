core:sys:has () {

    [[ -n "${1:-}" && "${1}" != -* ]] || return 1

    command -v -- "${1}" >/dev/null 2>&1

}
core:sys:need () {

    local tool="" failed=0

    for tool in "$@"; do
        core:sys:has "${tool}" || { core:error:fail "Missing tool: ${tool:-unnamed}" || failed=1; }
    done

    (( failed == 0 ))

}
core:sys:kernel () {

    local kernel=""

    kernel="$(uname -s)" || { core:error:fail "Kernel detection failed"; return; }

    core:log:print "${kernel,,}"

}
core:sys:arch () {

    local arch=""

    arch="$(uname -m)" || { core:error:fail "Architecture detection failed"; return; }

    case "${arch}" in
        arm64|aarch64) core:log:print aarch64 ;;
        x86_64|amd64)  core:log:print x86_64 ;;
        *)             core:log:print "${arch}" ;;
    esac

}
core:sys:is:linux () {

    [[ "${OSTYPE:-}" == linux* ]] || [[ "$(uname -s 2>/dev/null)" == Linux ]]

}
core:sys:is:macos () {

    [[ "${OSTYPE:-}" == darwin* ]] || [[ "$(uname -s 2>/dev/null)" == Darwin ]]

}
core:sys:is:wsl () {

    local line=""

    core:sys:is:linux || return 1

    [[ -z "${WSL_DISTRO_NAME:-}${WSL_INTEROP:-}" ]] || return 0
    [[ -r /proc/sys/kernel/osrelease ]] || return 1

    IFS= read -r line < /proc/sys/kernel/osrelease || true

    [[ "${line,,}" == *microsoft* ]]

}
core:sys:is:container () {

    local line=""

    [[ ! -f /.dockerenv && ! -f /run/.containerenv ]] || return 0
    [[ -r /proc/1/cgroup ]] || return 1

    while IFS= read -r line || [[ -n "${line}" ]]; do

        case "${line,,}" in
            *docker*|*kubepods*|*containerd*|*podman*|*lxc*) return 0 ;;
        esac

    done < /proc/1/cgroup

    return 1

}
core:sys:is:root () {

    [[ "${EUID:-$(id -u)}" == 0 ]]

}
core:sys:is:terminal () {

    [[ -t 1 && "${TERM:-dumb}" != dumb ]]

}
core:sys:os () {

    if core:sys:is:linux; then core:log:print linux
    elif core:sys:is:macos; then core:log:print macos
    else core:error:fail "Unsupported system: $(uname -s 2>/dev/null)"; return
    fi

}
core:sys:runtime () {

    if core:sys:is:wsl; then core:log:print wsl
    elif core:sys:is:container; then core:log:print container
    else core:sys:os
    fi

}
core:sys:distro () {

    local file="" line="" id=""

    core:sys:is:linux || { core:sys:os; return; }

    for file in /etc/os-release /usr/lib/os-release; do

        [[ -r "${file}" ]] || continue

        while IFS= read -r line || [[ -n "${line}" ]]; do

            [[ "${line}" == ID=* ]] || continue

            id="${line#ID=}"
            id="${id#\"}"
            id="${id%\"}"

            [[ -z "${id}" ]] || { core:log:print "${id}"; return 0; }

        done < "${file}"

    done

    core:log:print linux

}
core:sys:ci () {

    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then core:log:print github
    elif [[ -n "${GITLAB_CI:-}" ]]; then core:log:print gitlab
    elif [[ -n "${BUILDKITE:-}" ]]; then core:log:print buildkite
    elif [[ -n "${CIRCLECI:-}" ]]; then core:log:print circleci
    elif [[ -n "${JENKINS_URL:-}" ]]; then core:log:print jenkins
    elif [[ -n "${TF_BUILD:-}" ]]; then core:log:print azure
    elif [[ -n "${CI:-}" ]]; then core:log:print generic
    else return 1
    fi

}
core:sys:cores () {

    local count=""

    if count="$(getconf _NPROCESSORS_ONLN 2>/dev/null)" || count="$(nproc 2>/dev/null)" || count="$(sysctl -n hw.ncpu 2>/dev/null)"; then
        core:log:print "${count}"
    else
        core:log:print 1
    fi

}
core:sys:memory () {

    local line="" bytes=""

    if [[ -r /proc/meminfo ]]; then

        while IFS= read -r line; do

            [[ "${line}" != MemTotal:* ]] || {

                line="${line#MemTotal:}"
                line="${line%kB}"

                core:log:print $(( ${line// /} / 1024 ))
                return 0

            }

        done < /proc/meminfo

    fi

    bytes="$(sysctl -n hw.memsize 2>/dev/null)" || { core:log:print 0; return 0; }

    core:log:print $(( bytes / 1024 / 1024 ))

}
core:sys:user () {

    core:log:print "${USER:-$(id -un)}"

}
core:sys:home () {

    [[ -n "${HOME:-}" ]] || { core:error:fail "HOME is not set"; return; }

    core:log:print "${HOME}"

}
core:sys:sudo () {

    (( $# > 0 )) || { core:error:fail "A command is required"; return; }

    if core:sys:is:root; then "$@"; return; fi

    core:sys:has sudo || { core:error:fail "Not root and sudo is missing: $*"; return; }
    sudo -n true >/dev/null 2>&1 || { core:error:fail "sudo needs a password; run as root or grant sudo -n for: $*"; return; }

    sudo -n "$@"

}
core:sys:now () {

    local now="${EPOCHREALTIME}"

    core:log:print "${now/./}"

}
core:sys:session () {

    local lab="${1}" stamp="" directory=""

    stamp="$(printf '%(%Y%m%d-%H%M%S)T' -1)-$$"

    core:fs:dir:own "${lab}/run" 700 || return
    core:sys:prune "${lab}/run"

    directory="$(mktemp -d "${lab}/run/${stamp}.XXXX")" || { core:error:fail "Cannot create the session directory"; return; }

    printf '%s\n' "$$" > "${directory}/pid" || { core:error:fail "Cannot mark the session ${directory}"; return; }

    core:log:print "${directory}"

}
core:sys:prune () {

    local run="${1}" directory="" pid=""

    for directory in "${run}"/*/; do

        [[ -d "${directory}" ]] || continue

        directory="${directory%/}"
        pid="$(cat -- "${directory}/pid" 2>/dev/null)" || pid=""

        [[ -n "${pid}" ]] || { rm -rf -- "${directory}"; continue; }

        ! core:process:alive "${pid}" || continue

        rm -rf -- "${directory}"

    done

    return 0

}
core:sys:report () {

    printf 'os\t%s\n' "$(core:sys:os)"
    printf 'runtime\t%s\n' "$(core:sys:runtime)"
    printf 'distro\t%s\n' "$(core:sys:distro)"
    printf 'kernel\t%s %s\n' "$(core:sys:kernel)" "$(core:sys:arch)"
    printf 'manager\t%s\n' "$(core:pkg:manager 2>/dev/null || core:log:print none)"
    printf 'cores\t%s\n' "$(core:sys:cores)"
    printf 'memory\t%s MB\n' "$(core:sys:memory)"
    printf 'user\t%s%s\n' "$(core:sys:user)" "$(core:sys:is:root && printf ' (root)')"
    printf 'ci\t%s\n' "$(core:sys:ci || core:log:print none)"
    printf 'bash\t%s\n' "${BASH_VERSION}"

}
