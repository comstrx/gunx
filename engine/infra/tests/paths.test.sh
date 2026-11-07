test:config:paths:picks-the-lab () {

    local root="${TMPDIR}/root" sealed="${TMPDIR}/sealed"

    mkdir -p "${root}" "${sealed}"

    @eq "$(TOOL_ROOT="${root}" config:paths:lab)" "${root}/.infra"

    mkdir -p "${root}/.infra"
    @eq "$(TOOL_ROOT="${root}" config:paths:lab)" "${root}/.infra"

    chmod 500 "${sealed}"
    @eq "$(TOOL_ROOT="${sealed}" config:paths:lab 2>/dev/null)" "${TMPDIR}/.infra"
    @eq "$(TMPDIR='' TOOL_ROOT="${sealed}" config:paths:lab 2>/dev/null)" "/tmp/.infra-$(id -u)"
    chmod 700 "${sealed}"

    @eq "$(TOOL_LAB=/lab config:paths:tools)" /lab/tools
    @eq "$(TOOL_LAB=/lab config:paths:sbom)" /lab/sbom/sbom.spdx.json
    @eq "$(TOOL_LAB=/lab config:paths:lock x)" /lab/lock/x
    @eq "$(config:paths:cache)" .infra

}
