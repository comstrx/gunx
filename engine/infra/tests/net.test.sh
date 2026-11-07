test:core:net:judges-urls () {

    core:validate:url https://github.com/x/y/releases/download/v1/a.tar.xz
    @fails core:validate:url http://github.com/x
    @fails core:validate:url 'https://github.com/x;rm'
    @fails core:validate:url ''

}
test:core:net:fetches-https-only () {

    CONFIG[RUN_RETRIES]=1
    CONFIG[RUN_TIMEOUT]=5

    @errors 'Only an https URL' core:net:fetch http://example.invalid/x "${TMPDIR}/x"
    @errors 'Fetch failed' core:net:fetch https://example.invalid/x "${TMPDIR}/x"

}
