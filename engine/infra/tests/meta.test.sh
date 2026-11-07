test:config:meta:reads-the-identity () {

    @eq "$(config:meta:name)" infra
    @eq "$(config:meta:version)" "${MANIFEST[meta.version]}"
    @eq "$(config:meta:license)" "${MANIFEST[meta.license]}"
    @eq "$(config:meta:readme)" README.md
    @eq "$(config:meta:owner)" "${MANIFEST[meta.authors.0]}"
    @eq "$(config:meta:author)" "$(config:meta:owner)"
    @eq "$(config:meta:authors | head -1)" "$(config:meta:owner)"
    @contains "$(config:meta:description)" engine
    @errors 'No [meta] repo' config:meta:repo

    MANIFEST[meta.authors]=0
    @errors 'No [meta] authors' config:meta:owner

    MANIFEST[meta.repo]=o/r
    @eq "$(config:meta:repo)" o/r

}
