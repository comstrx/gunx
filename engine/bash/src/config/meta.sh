declare -g META_NAME=bash-engine META_VERSION=0.1.0

config:meta:get () {

    local key="${1:-}"

    [[ -z "${key}" ]] || core:log:print "${MANIFEST[meta.${key}]:-}"

}
config:meta:name () {

    core:log:print "${MANIFEST[meta.name]:-${META_NAME}}"

}
config:meta:alias () {

    core:log:print "${MANIFEST[meta.alias]:-$(config:meta:name)}"

}
config:meta:version () {

    core:log:print "${MANIFEST[meta.version]:-${META_VERSION}}"

}
config:meta:msrv () {

    config:meta:get bash_version

}
config:meta:description () {

    config:meta:get description

}
config:meta:license () {

    config:meta:get license

}
config:meta:readme () {

    config:meta:get readme

}
config:meta:repo () {

    config:meta:get repo

}
config:meta:authors () {

    config:manifest:list meta.authors

}
config:meta:author () {

    core:log:print "${MANIFEST[meta.authors.0]:-}"

}
config:meta:owner () {

    config:meta:author

}
config:meta:build () {

    core:log:print "${MANIFEST[meta.build]:-dev}"

}
config:meta:src () {

    config:meta:get src

}
config:meta:install () {

    local folder="${MANIFEST[meta.install]:-}" home="~"

    [[ "${folder}" != "${home}/"* ]] || folder="${HOME}/${folder#"${home}/"}"

    core:log:print "${folder:-${XDG_BIN_HOME:-${HOME}/.local/bin}}"

}
