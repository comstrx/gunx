bench:core:validate:semver () {

    @measure 'core:validate:semver' 20 400 core:validate:semver 12.34.56

}
bench:core:validate:url () {

    @measure 'core:validate:url' 20 400 core:validate:url 'https://example.com/path/file.tar.gz'

}
