declare -ga PKG_MANAGERS=( apt apk dnf yum pacman zypper xbps brew port nix )

core:pkg:manager () {

    local manager=""

    [[ -z "${PKG_MANAGER:-}" ]] || { core:log:print "${PKG_MANAGER}"; return 0; }

    if core:sys:is:macos; then

        for manager in brew port nix; do
            core:sys:has "${manager}" && { core:log:print "${manager}"; return 0; }
        done

    else

        core:sys:has apt-get && { core:log:print apt; return 0; }
        core:sys:has xbps-install && { core:log:print xbps; return 0; }

        for manager in apk dnf yum pacman zypper brew nix; do
            core:sys:has "${manager}" && { core:log:print "${manager}"; return 0; }
        done

    fi

    core:error:fail "No package manager found among: ${PKG_MANAGERS[*]}"

}
core:pkg:known () {

    core:list:has "${1:-}" "${PKG_MANAGERS[@]}"

}
core:pkg:plan () {

    local manager="${1}" action="${2}"

    shift 2

    core:pkg:known "${manager}" || { core:error:fail "Unknown package manager: ${manager}"; return; }

    case "${manager}:${action}" in
        apt:refresh)     core:log:print apt-get update -qq ;;
        apt:install)     core:log:print apt-get install -y --no-install-recommends "$@" ;;
        apt:has)         core:log:print dpkg-query -s "$@" ;;
        apk:refresh)     core:log:print apk update ;;
        apk:install)     core:log:print apk add --no-cache "$@" ;;
        apk:has)         core:log:print apk info -e "$@" ;;
        dnf:refresh)     core:log:print dnf makecache -y ;;
        dnf:install)     core:log:print dnf install -y "$@" ;;
        dnf:has)         core:log:print rpm -q "$@" ;;
        yum:refresh)     core:log:print yum makecache -y ;;
        yum:install)     core:log:print yum install -y "$@" ;;
        yum:has)         core:log:print rpm -q "$@" ;;
        pacman:refresh)  core:log:print pacman -Sy --noconfirm ;;
        pacman:install)  core:log:print pacman -S --needed --noconfirm --noprogressbar "$@" ;;
        pacman:has)      core:log:print pacman -Qi "$@" ;;
        zypper:refresh)  core:log:print zypper --non-interactive refresh ;;
        zypper:install)  core:log:print zypper --non-interactive install "$@" ;;
        zypper:has)      core:log:print rpm -q "$@" ;;
        xbps:refresh)    core:log:print xbps-install -S ;;
        xbps:install)    core:log:print xbps-install -Sy "$@" ;;
        xbps:has)        core:log:print xbps-query "$@" ;;
        brew:refresh)    core:log:print brew update ;;
        brew:install)    core:log:print brew install "$@" ;;
        brew:has)        core:log:print brew list --versions "$@" ;;
        port:refresh)    core:log:print port selfupdate ;;
        port:install)    core:log:print port install "$@" ;;
        port:has)        core:log:print port installed "$@" ;;
        nix:refresh)     core:log:print nix-channel --update ;;
        nix:install)     core:log:print nix profile install "${@/#/nixpkgs#}" ;;
        nix:has)         core:log:print nix profile list ;;
        *)               core:error:fail "No ${action} for ${manager}"; return ;;
    esac

}
core:pkg:elevated () {

    case "${1}" in
        brew|port|nix) return 1 ;;
        *)             return 0 ;;
    esac

}
core:pkg:run () {

    local manager="${1}" action="${2}"
    local -a argv=()

    shift 2

    mapfile -t argv < <(core:pkg:plan "${manager}" "${action}" "$@") || return
    (( ${#argv[@]} > 0 )) || return 1

    if core:pkg:elevated "${manager}"; then core:sys:sudo "${argv[@]}"
    else "${argv[@]}"
    fi

}
core:pkg:has () {

    local manager="" name=""

    manager="$(core:pkg:manager)" || return

    for name in "$@"; do
        core:pkg:run "${manager}" has "${name}" >/dev/null 2>&1 || return 1
    done

}
core:pkg:refresh () {

    local manager=""

    manager="$(core:pkg:manager)" || return

    core:process:io core:pkg:run "${manager}" refresh >/dev/null \
        || { core:error:fail "Package index refresh failed with ${manager}"; return; }

}
core:pkg:install () {

    local manager=""

    (( $# > 0 )) || return 0

    manager="$(core:pkg:manager)" || return

    core:log:info "installing with ${manager}: $*"

    core:pkg:run "${manager}" install "$@" >/dev/null || { core:error:fail "Install failed with ${manager}: $*"; return; }

}
