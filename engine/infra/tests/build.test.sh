test:module:bundle:build:names-the-output () {

    @eq "$(module:bundle:build:output dev)" "${TOOL_ROOT}/target/dev/infra"
    @eq "$(module:bundle:build:output release)" "${TOOL_ROOT}/target/release/infra"
    @eq "$(module:bundle:build:current)" "${TOOL_BIN}"
    @errors 'Builds require the source checkout' module:bundle:build:dev
    @errors 'Regular file required' module:bundle:build:checksum

}
