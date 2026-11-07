test:core:sys:finds-tools () {

    core:sys:has bash

    @fails core:sys:has no-such-tool-here
    @fails core:sys:has -v

    core:sys:need bash sh

    @errors 'Missing tool: no-such-tool-here' core:sys:need bash no-such-tool-here

}
test:core:sys:names-the-machine () {

    [[ "$(core:sys:kernel)" =~ ^(linux|darwin)$ ]]
    [[ "$(core:sys:arch)" =~ ^(x86_64|aarch64)$ ]]
    [[ "$(core:sys:now)" =~ ^[0-9]{16,}$ ]]

}
test:core:sys:opens-a-session () {

    local lab="${TMPDIR}/lab" directory="" dead=""

    mkdir -p "${lab}/run/stale.0000" "${lab}/run/dead.0000"
    printf '' > "${lab}/run/stale.0000/file"
    printf '%s\n' 2147483646 > "${lab}/run/dead.0000/pid"

    directory="$(core:sys:session "${lab}")"
    [[ -d "${directory}" && "${directory}" == "${lab}"/run/[0-9]*-[0-9]*-[0-9]*.???? ]]

    @eq "$(cat "${directory}/pid")" "$$"
    @eq "$(core:fs:file:mode "${lab}/run")" 700
    [[ ! -e "${lab}/run/stale.0000" && ! -e "${lab}/run/dead.0000" ]]

    dead="$(core:sys:session "${lab}")"
    [[ -d "${directory}" && -d "${dead}" ]]

}
test:core:sys:knows-the-machine () {

    [[ "$(core:sys:os)" =~ ^(linux|macos)$ ]]
    [[ "$(core:sys:runtime)" =~ ^(linux|macos|wsl|container)$ ]]
    [[ -n "$(core:sys:distro)" ]]

    core:num:natural "$(core:sys:cores)"
    core:num:natural "$(core:sys:memory)"

    @eq "$(core:sys:user)" "$(id -un)"
    @eq "$(HOME=/tmp/x core:sys:home)" /tmp/x
    @eq "$(GITHUB_ACTIONS=1 core:sys:ci)" github
    @eq "$(env -u CI -u GITHUB_ACTIONS -u GITLAB_CI -u BUILDKITE -u CIRCLECI -u JENKINS_URL -u TF_BUILD bash -c "INFRA_ENTRY=library source '${TOOL_BIN}'; core:sys:ci || @print none")" none

    @contains "$(core:sys:report)" $'cores\t'
    @errors 'A command is required' core:sys:sudo

}
