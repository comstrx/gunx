#!/usr/bin/env bash
set -euo pipefail

source "${BASH_SOURCE[0]%/*}/app/index.sh"

[[ "${INFRA_ENTRY:-}" == library ]] || app:main "$@"
