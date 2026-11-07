test:config:manifest:finds-the-file () {

    local root="${TMPDIR}/m"

    mkdir -p "${root}"
    @errors 'No infra.toml' config:manifest:file "${root}"

    printf '[meta]\nname = "x"\n' > "${root}/Infra.toml"
    @eq "$(config:manifest:file "${root}")" "${root}/Infra.toml"

    printf '[meta]\nname = "x"\n' > "${root}/infra.toml"
    @eq "$(config:manifest:file "${root}")" "${root}/infra.toml"

}
test:config:manifest:validates () {

    local file="${TMPDIR}/infra.toml"

    printf '[meta]\nname = "Bad"\nversion = "0.1.0"\n' > "${file}"
    @errors 'name must be an identifier' config:manifest:load "${file}"

    printf '[meta]\nname = "ok"\nversion = "1"\n' > "${file}"
    @errors 'version must be MAJOR.MINOR.PATCH' config:manifest:load "${file}"

    printf '[meta]\nname = "ok"\nversion = "0.1.0"\n' > "${file}"
    @errors 'license is required' config:manifest:load "${file}"

    printf '[meta]\nname = "ok"\nversion = "0.1.0"\nlicense = "MIT"\nauthors = []\n' > "${file}"
    @errors 'authors needs one name' config:manifest:load "${file}"

    printf '[meta]\nname = "ok"\nversion = "0.1.0"\nlicense = "MIT"\nauthors = ["a"]\n[paths]\nentrypoint = "/abs"\n' > "${file}"
    @errors 'paths.entrypoint must be a relative path' config:manifest:load "${file}"

}
test:config:manifest:reads-keys () {

    @eq "${MANIFEST[meta.name]}" infra
    @eq "${MANIFEST[paths.build]}" target
    @eq "${MANIFEST[paths.cache]}" .infra
    @eq "$(config:manifest:get tools.gitleaks)" "${MANIFEST[tools.gitleaks]}"
    @errors 'Missing manifest key' config:manifest:get nothing.here

}
