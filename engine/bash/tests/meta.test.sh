test:config:meta:reads-the-identity () {

    @eq "$(config:meta:name)" "${MANIFEST[meta.name]}"
    @eq "$(config:meta:alias)" "${MANIFEST[meta.alias]:-${MANIFEST[meta.name]}}"
    @eq "$(config:meta:version)" "${MANIFEST[meta.version]}"
    @eq "$(config:meta:msrv)" "${MANIFEST[meta.bash_version]}"
    @contains "$(NO_COLOR=1 bash "${TOOL_BIN}" meta)" "bash ${MANIFEST[meta.bash_version]}"
    @eq "$(config:meta:license)" "${MANIFEST[meta.license]}"
    @eq "$(config:meta:readme)" "${MANIFEST[meta.readme]}"
    @eq "$(config:meta:owner)" "${MANIFEST[meta.authors.0]}"
    @eq "$(config:meta:author)" "$(config:meta:owner)"
    @eq "$(config:meta:authors | head -1)" "$(config:meta:owner)"
    @contains "$(config:meta:description)" engine

    MANIFEST[meta.repo]=o/r
    @eq "$(config:meta:repo)" o/r
    @eq "$(config:meta:get repo)" o/r

    unset "MANIFEST[meta.alias]"
    @eq "$(config:meta:alias)" "${MANIFEST[meta.name]}"

}
test:config:meta:falls-back-when-the-section-is-absent () {

    local key=""

    for key in "${!MANIFEST[@]}"; do
        [[ "${key}" != meta.* ]] || unset "MANIFEST[${key}]"
    done

    @eq "$(config:meta:name)" bash-engine
    @eq "$(config:meta:alias)" bash-engine
    @eq "$(config:meta:version)" 0.1.0
    @eq "$(config:meta:msrv)" ''
    @eq "$(config:meta:description)" ''
    @eq "$(config:meta:license)" ''
    @eq "$(config:meta:readme)" ''
    @eq "$(config:meta:repo)" ''
    @eq "$(config:meta:authors)" ''
    @eq "$(config:meta:author)" ''
    @eq "$(config:meta:owner)" ''
    @eq "$(config:meta:get anything)" ''
    @eq "$(config:meta:get '')" ''

    config:manifest:check x.toml

    MANIFEST[meta.name]=tool
    @eq "$(config:meta:alias)" tool
    MANIFEST[meta.alias]=short
    @eq "$(config:meta:alias)" short

}
