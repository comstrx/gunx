test:module:bundle:build:names-the-output () {

    @eq "$(module:bundle:build:output dev)" "${TOOL_ROOT}/target/dev/infra"
    @eq "$(module:bundle:build:output release)" "${TOOL_ROOT}/target/release/infra"
    @eq "$(module:bundle:build:current)" "${TOOL_BIN}"
    @errors 'Builds require the source checkout' module:bundle:build:dev
    @errors 'Regular file required' module:bundle:build:checksum

}
test:module:bundle:hello () {

    @eq "$(module:bundle:hello)" 'hello world'
    @eq "$(bash "${TOOL_BIN}" hello)" 'hello world'
    @eq "$(bash "${TOOL_BIN}" --version)" "$(module:bundle:view:version)"

}
test:module:bundle:install-guards () {

    CLI_VALUED=( [--alias]=true [--into]=true )
    CLI_FLAGS=( [--alias]=Gun )
    @errors 'An alias is a lowercase name' module:bundle:install

    CLI_FLAGS=( [--alias]=gun [--into]="${TMPDIR}/bin" )
    @errors 'Builds require the source checkout' module:bundle:install

}
