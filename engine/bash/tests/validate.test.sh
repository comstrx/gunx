test:core:validate:names-and-keys () {

    core:validate:identifier alphax
    core:validate:identifier a_b-c
    @fails core:validate:identifier AlphaX
    core:validate:key LOG_LEVEL
    @fails core:validate:key log_level
    core:validate:name alphax
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
test:core:validate:judges-mail-addresses () {

    core:validate:email ops@example.com
    core:validate:email first.last+tag@mail.example.co
    @fails core:validate:email 'ops@example'
    @fails core:validate:email 'a b@example.com'
    @fails core:validate:email $'ops@example.com\nBcc: x@y.com'

}
test:core:validate:judges-a-breaking-bump () {

    core:validate:breaking v0.1.0 0.2.0
    core:validate:breaking v0.9.3 1.0.0
    core:validate:breaking 1.4.2 2.0.0
    core:validate:breaking 0.08.0 0.09.0
    @fails core:validate:breaking v0.1.0 0.1.5
    @fails core:validate:breaking 1.4.2 1.9.0
    @fails core:validate:breaking 0.3.0 0.2.0
    @fails core:validate:breaking v0.1.0 ''
    @fails core:validate:breaking main 1.0.0

}
