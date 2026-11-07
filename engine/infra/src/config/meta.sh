config:meta:get () {

    local key="${1}"

    [[ -n "${MANIFEST[meta.${key}]+x}" ]] || { core:error:fail "No [meta] ${key} in the manifest"; return; }

    core:log:print "${MANIFEST[meta.${key}]}"

}
config:meta:name () {

    config:meta:get name

}
config:meta:version () {

    config:meta:get version

}
config:meta:description () {

    core:log:print "${MANIFEST[meta.description]:-}"

}
config:meta:license () {

    config:meta:get license

}
config:meta:readme () {

    core:log:print "${MANIFEST[meta.readme]:-README.md}"

}
config:meta:repo () {

    config:meta:get repo

}
config:meta:authors () {

    config:manifest:list meta.authors

}
config:meta:author () {

    [[ "${MANIFEST[meta.authors]:-0}" -ge 1 ]] || { core:error:fail "No [meta] authors in the manifest"; return; }

    core:log:print "${MANIFEST[meta.authors.0]}"

}
config:meta:owner () {

    config:meta:author

}
