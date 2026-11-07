fixture:module:bundle:audit:manifest () {

    MANIFEST=(
        [name]=infra
        [version]=0.1.0
        [tools.shellcheck]=0.11.0
        [archive.shellcheck_linux_x86_64]=https://x/a.tar.xz
        [downloads.shellcheck_linux_x86_64]="$(printf 'a%.0s' {1..64})"
        [downloads.x]="$(printf 'a%.0s' {1..64})"
        [images.redis]="redis:8@sha256:$(printf 'b%.0s' {1..64})"
    )

}
test:module:bundle:audit:manifest-accepts-pins () {

    fixture:module:bundle:audit:manifest
    module:bundle:audit:manifest

}
test:module:bundle:audit:manifest-refuses-loose-pins () {

    fixture:module:bundle:audit:manifest
    MANIFEST[tools.bash]=latest
    @errors 'not a pinned version' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[downloads.y]=deadbeef
    @errors 'not a SHA-256 digest' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[images.redis]='redis:8'
    @errors 'not pinned by digest' module:bundle:audit:manifest

    fixture:module:bundle:audit:manifest
    MANIFEST[archive.trivy_linux_x86_64]='http://x/t.tar.gz'
    @errors 'needs an https URL and a digest' module:bundle:audit:manifest

}
test:module:bundle:audit:schema-refuses-secret-defaults () {

    local file="${TMPDIR}/schema.env"

    printf 'DB_PASSWORD=\nDB_USER=engine\n' > "${file}"
    module:bundle:audit:schema "${file}"

    printf 'DB_PASSWORD=sw0rdfish\n' > "${file}"
    @errors 'a secret default is never written' module:bundle:audit:schema "${file}"

}
test:module:bundle:audit:sources-refuse-secret-values () {

    local root="${TMPDIR}/sources"

    mkdir -p "${root}/core"
    printf 'core:cfg:token () {\n\n    core:cfg:set API_TOKEN "%s"\n\n}\n' "\${1}" > "${root}/core/cfg.sh"
    module:bundle:audit:sources "${root}"

    printf 'core:cfg:token () {\n\n    API_TOKEN="secretsecretsecret"\n\n}\n' > "${root}/core/cfg.sh"
    @errors 'a secret-shaped value in a source' module:bundle:audit:sources "${root}"

}
