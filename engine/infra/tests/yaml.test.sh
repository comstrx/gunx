fixture:core:yaml:flow () {

    local file="${TMPDIR}/flow.yml"

    cat > "${file}" <<'FLOW'
name: demo

on:
  push:
    branches: [main]
    paths: ['engine/rust/**', '.github/workflows/rust.yml']
  pull_request:
    paths:
      - 'engine/rust/**'
      - 'engine/infra/**'

jobs:
  rust:
    uses: $/.github/workflows/rust.yml
  bun:
    uses: $/.github/workflows/bun.yml
  sync:
    needs: [rust, bun]
    steps:
      - uses: actions/checkout@abc # v7
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@def # v2
        with:
          bun-version-file: engine/bun/package.json
      - run: infra sync --moment tag
FLOW

    @print "${file}"

}
test:core:yaml:prunes-items-and-blocks () {

    local file=""

    file="$(fixture:core:yaml:flow)"

    core:yaml:erase "${file}" paths
    @absent "$(cat "${file}")" 'paths'
    @contains "$(cat "${file}")" 'branches: [main]'
    @contains "$(cat "${file}")" 'pull_request:'

    core:yaml:prune "${file}" 'workflows/bun[.]yml'
    @absent "$(cat "${file}")" 'bun:'
    @contains "$(cat "${file}")" 'workflows/rust.yml'

    core:yaml:prune "${file}" 'run: infra sync'
    @absent "$(cat "${file}")" 'infra sync'
    @contains "$(cat "${file}")" 'setup-bun'
    @contains "$(cat "${file}")" 'pull_request:'

    core:yaml:prune "${file}" 'bun-version-file'
    core:yaml:hollow "${file}"
    @absent "$(cat "${file}")" 'bun-version-file'
    @eq "$(grep -c 'with:' "${file}")" 1

    core:yaml:prune "${file}" 'persist-credentials' 2
    @absent "$(cat "${file}")" 'checkout'
    @absent "$(cat "${file}")" 'sync:'
    @eq "$(core:yaml:keys "${file}" 2 | tr '\n' ' ')" 'push pull_request rust '
    @eq "$(core:yaml:keys "${file}" | tr '\n' ' ')" 'on jobs '

}
test:core:yaml:rewrites-and-measures () {

    local file=""

    file="$(fixture:core:yaml:flow)"

    core:yaml:sub "${file}" -E 's#engine/bun/package.json#package.json#'
    @contains "$(cat "${file}")" 'bun-version-file: package.json'
    @eq "$(core:yaml:indent '      - run: x')" 6
    @eq "$(core:yaml:indent 'name: x')" 0
    core:yaml:prune "${TMPDIR}/nothing.yml" x
    @eq "$(grep -c '^$' "${file}")" "$(grep -c '^$' "${file}")"

}
