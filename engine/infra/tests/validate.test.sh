test:core:validate:names-and-keys () {

    core:validate:identifier rustx
    core:validate:identifier a_b-c
    @fails core:validate:identifier RustX
    core:validate:key LOG_LEVEL
    @fails core:validate:key log_level
    core:validate:name rustx
    @fails core:validate:name rust_x

}
test:core:validate:numbers-and-digests () {

    core:validate:number 3
    core:validate:number -3.5
    @fails core:validate:number 3.
    core:validate:sha256 "$(printf 'a%.0s' {1..64})"
    @fails core:validate:sha256 deadbeef
    core:validate:semver 1.2.3
    core:validate:semver 1.2.3-rc.1
    @fails core:validate:semver 1.2

}
test:core:validate:refs-and-urls () {

    core:validate:branch main
    core:validate:branch release/1.x
    @fails core:validate:branch '-bad'
    @fails core:validate:branch 'a..b'
    core:validate:tag v1.2.3
    @fails core:validate:tag 1.2.3
    @fails core:validate:tag latest
    core:validate:url https://github.com/x/y/releases/download/v1/a.tar.xz
    @fails core:validate:url http://github.com/x
    @fails core:validate:url 'https://github.com/x;rm'

}
