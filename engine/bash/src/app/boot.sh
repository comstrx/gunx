if [[ "${TOOL_BUNDLED:-false}" != true ]]; then

    TOOL_ENGINE="${TOOL_SOURCE%/*}"
    TOOL_ROOT="${TOOL_ENGINE}"
    TOOL_BIN="${TOOL_SOURCE}/main.sh"
    TOOL_BUILD=dev

fi

core:load:use core || return
core:load:use config || return
core:load:use module::bundle || return
