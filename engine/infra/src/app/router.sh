@global --root DIR 'Read the manifest and the env files from DIR instead of the current directory' || return
@global -e KEY=VALUE 'Override one setting for this run; repeatable' || return

app:router:flags () {

    local command="${1}" flag=""

    module:bundle:usage:command "${command}" >/dev/null || { module:bundle:help:unknown "${command}"; return; }

    while IFS= read -r flag; do

        [[ -z "${flag}" ]] || module:bundle:usage:allowed "${command}" "${flag}" \
            || { core:error:usage "${command} does not take ${flag}"; return; }

    done < <(core:cli:switches)

}
app:router:dispatch () {

    local command="${1}" handler=""

    shift

    handler="$(module:bundle:usage:handler "${command}")" || { module:bundle:help:unknown "${command}"; return; }

    "${handler}" "$@"

}
