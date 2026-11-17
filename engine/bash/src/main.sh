#!/usr/bin/env bash
set -euo pipefail

source "${BASH_SOURCE[0]%/*}/module/bundle/src/bash.sh"
module:bundle:bash:ensure "${BASH_SOURCE[0]%/*}/.." "${BASH_SOURCE[0]}" "$@"

source "${BASH_SOURCE[0]%/*}/module/bundle/src/load.sh"

if [[ "${TOOL_BUNDLED:-false}" != true ]]; then

    TOOL_ENGINE="${TOOL_SOURCE%/*}"
    TOOL_ROOT=""
    TOOL_BIN="${TOOL_SOURCE}/main.sh"
    TOOL_BUILD=dev

fi

module:bundle:load:use core || exit
module:bundle:load:use config || exit

module:bundle:load:use module::bundle || exit

module:bundle:load:use app || exit

[[ "${INFRA_ENTRY:-}" == library ]] || module:bundle:boot:main "$@"
