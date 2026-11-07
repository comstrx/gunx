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
    @errors 'Unknown tool: nope' module:bundle:tool:fetch nope

    fixture:module:bundle:tool:fake zizmor 1.32.0
    @eq "$(module:bundle:tool:binary zizmor)" "$(module:bundle:tool:home)/zizmor"
    @eq "$(module:bundle:tool:run zizmor --flag)" 'zizmor version 1.32.0 (release)'

}
test:module:bundle:tool:unpacks-every-archive-kind () {

    local work="${TMPDIR}/pack" target=""

    mkdir -p "${work}/tool-v1"
    printf '#!/usr/bin/env bash\nprintf one\n' > "${work}/tool-v1/tool"
    printf '#!/usr/bin/env bash\nprintf two\n' > "${work}/flat"

    tar -cJf "${work}/a.tar.xz" -C "${work}" tool-v1/tool
    tar -czf "${work}/b.tar.gz" -C "${work}" flat
    gzip -c "${work}/flat" > "${work}/c.gz"

    module:bundle:tool:unpack "${work}/a.tar.xz" https://x/a.tar.xz tool-v1/tool "${work}/out-a"
    module:bundle:tool:unpack "${work}/b.tar.gz" https://x/b.tar.gz flat "${work}/out-b"
    module:bundle:tool:unpack "${work}/c.gz" https://x/c.gz flat "${work}/out-c"

    @eq "$("${work}/out-a")$("${work}/out-b")$("${work}/out-c")" onetwotwo
    @eq "$(core:fs:file:mode "${work}/out-c")" 755
    @errors 'Unknown archive kind' module:bundle:tool:unpack "${work}/c.gz" https://x/c.zip flat "${work}/out-d"

}
