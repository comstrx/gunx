fixture:module:bundle:tool:fake () {

    local name="${1}" version="${2}" home=""

    home="$(module:bundle:tool:home)"
    mkdir -p "${home}"
    printf '#!/usr/bin/env bash\nprintf "%s version %s (release)\\n"\n' "${name}" "${version}" > "${home}/${name}"
    chmod 755 "${home}/${name}"

}
test:module:bundle:tool:reads-versions () {

    fixture:module:bundle:tool:fake shellcheck 0.11.0
    fixture:module:bundle:tool:fake trivy v9.9.9

    @eq "$(module:bundle:tool:version "$(module:bundle:tool:home)/shellcheck")" 0.11.0
    @eq "$(module:bundle:tool:version "$(module:bundle:tool:home)/trivy")" 9.9.9
    module:bundle:tool:pinned shellcheck
    @errors 'trivy 9.9.9 is not the pinned' module:bundle:tool:pinned trivy

    printf '#!/usr/bin/env bash\nprintf "nothing\\n"\n' > "$(module:bundle:tool:home)/trivy"
    @errors 'Version unreadable' module:bundle:tool:pinned trivy

}
test:module:bundle:tool:finds-and-lists () {

    @eq "$(module:bundle:tool:home)" "${TOOL_LAB}/tools"
    @errors 'Unknown tool: nope' module:bundle:tool:binary nope
    @errors 'Unknown tool: nope' module:bundle:install:tool nope

    fixture:module:bundle:tool:fake zizmor 1.32.0
    @eq "$(module:bundle:tool:binary zizmor)" "$(module:bundle:tool:home)/zizmor"
    @eq "$(module:bundle:tool:run zizmor --flag)" 'zizmor version 1.32.0 (release)'

}
test:module:bundle:tool:runs-a-pinned-package () {

    @eq "$(config:tools:get prettier runner)" bunx
    @eq "$(config:tools:version prettier)" "${MANIFEST[tools.prettier.version]}"
    PATH=/nonexistent @fails module:bundle:tool:ready prettier
    @fails module:bundle:tool:ready no-such-tool

}
