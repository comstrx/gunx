module:bundle:bash:wanted () {

    local dir="${1:-}" file="" name=""

    for file in "${dir}"/*.toml; do

        name="$(printf '%s' "${file##*/}" | tr '[:upper:]' '[:lower:]')"

        case "${name}" in
            bash.toml|infra.toml) sed -n 's/^bash_version *= *"\([0-9][0-9.]*\)".*$/\1/p' "${file}" | head -n 1; return 0 ;;
        esac

    done

}
module:bundle:bash:enough () {

    local wanted="${1:-}" have="${2:-${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]}}" major=0 minor=0

    case "${wanted}" in
        ''|*[!0-9.]*|.*|*.|*.*.*) return 0 ;;
    esac

    case "${have}" in
        *[!0-9.]*|.*|*.|*.*.*|[0-9]|[0-9][0-9]) return 1 ;;
    esac

    major="${wanted%%.*}"
    minor="${wanted#*.}"

    [ "${minor}" != "${wanted}" ] || minor=0
    minor="${minor%%.*}"

    [ "${have%%.*}" -gt "${major}" ] || { [ "${have%%.*}" -eq "${major}" ] && [ "${have#*.}" -ge "${minor}" ]; }

}
module:bundle:bash:find () {

    local wanted="${1:-}" path="" have=""

    for path in "$(command -v bash 2>/dev/null)" /opt/homebrew/bin/bash /usr/local/bin/bash /home/linuxbrew/.linuxbrew/bin/bash /usr/bin/bash /bin/bash; do

        [ -n "${path}" ] && [ -x "${path}" ] || continue

        have="$("${path}" --version 2>/dev/null | sed -n '1s/.*version \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')" || continue

        ! module:bundle:bash:enough "${wanted}" "${have}" || { printf '%s\n' "${path}"; return 0; }

    done

    return 1

}
module:bundle:bash:root () {

    if [ "$(id -u)" -eq 0 ] || ! command -v sudo >/dev/null 2>&1; then "$@"
    else sudo -n "$@"
    fi

}
module:bundle:bash:install () {

    if command -v brew >/dev/null 2>&1; then brew install bash
    elif command -v apt-get >/dev/null 2>&1; then module:bundle:bash:root apt-get install -y bash
    elif command -v dnf >/dev/null 2>&1; then module:bundle:bash:root dnf install -y bash
    elif command -v apk >/dev/null 2>&1; then module:bundle:bash:root apk add bash
    elif command -v pacman >/dev/null 2>&1; then module:bundle:bash:root pacman -S --noconfirm bash
    elif command -v zypper >/dev/null 2>&1; then module:bundle:bash:root zypper --non-interactive install bash
    else return 1
    fi

}
module:bundle:bash:ensure () {

    local wanted="${1:-}" script="${2:-}" path=""

    [ "$#" -lt 2 ] || shift 2

    [ ! -d "${wanted}" ] || wanted="$(module:bundle:bash:wanted "${wanted}")"

    ! module:bundle:bash:enough "${wanted}" || return 0

    if ! path="$(module:bundle:bash:find "${wanted}")"; then

        printf '%s\n' "[*] Bash ${wanted} or newer is required and this is ${BASH_VERSION}; installing it" >&2

        module:bundle:bash:install >&2 || { printf '%s\n' "[-] Cannot install Bash ${wanted} or newer on this machine" >&2; exit 1; }

        path="$(module:bundle:bash:find "${wanted}")" || { printf '%s\n' "[-] No Bash ${wanted} or newer after the install" >&2; exit 1; }

    fi

    exec "${path}" "${script}" "$@"

}
