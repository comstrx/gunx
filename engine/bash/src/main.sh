#!/usr/bin/env bash
set -euo pipefail

source "${BASH_SOURCE[0]%/*}/core/load.sh"

core:load:use app || exit

[[ "${INFRA_ENTRY:-}" == library ]] || module:bundle:boot:main "$@"
