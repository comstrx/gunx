test:config:manifest:finds-the-file () {

    local root="${TMPDIR}/m"

    mkdir -p "${root}"
    @errors 'No bash.toml nor infra.toml' config:manifest:file "${root}"
    @fails config:manifest:find "${root}"

    printf '[meta]\nname = "x"\n' > "${root}/other.toml"
    @fails config:manifest:find "${root}"

    printf '[meta]\nname = "x"\n' > "${root}/InFra.toml"
    @eq "$(config:manifest:file "${root}")" "${root}/InFra.toml"

    printf '[meta]\nname = "x"\n' > "${root}/BASH.toml"
    @eq "$(config:manifest:find "${root}")" "${root}/BASH.toml"

}
test:config:manifest:validates () {

    local file="${TMPDIR}/infra.toml"

    printf '[meta]\nname = "Bad"\nversion = "0.1.0"\n' > "${file}"
    @errors 'name must be an identifier' config:manifest:load "${file}"

    printf '[meta]\nname = "ok"\nversion = "1"\n' > "${file}"
    @errors 'version must be MAJOR.MINOR.PATCH' config:manifest:load "${file}"

    printf '[meta]\nname = "ok"\nversion = "0.1.0"\nalias = "Bad Name"\n' > "${file}"
    @errors 'alias must be a lowercase name' config:manifest:load "${file}"




    printf '[meta]\nname = "ok"\nversion = "0.1.0"\nlicense = "MIT"\nauthors = ["a"]\n[paths]\nentrypoint = "/abs"\n' > "${file}"
    @errors 'paths.entrypoint must be a relative path' config:manifest:load "${file}"

}
test:config:manifest:reads-keys () {

    core:validate:identifier "${MANIFEST[meta.name]}"
    @eq "${MANIFEST[paths.build]}" target
    @eq "${MANIFEST[paths.cache]}" .infra
    @eq "$(config:manifest:get tools.gitleaks)" "${MANIFEST[tools.gitleaks]}"
    @errors 'Missing manifest key' config:manifest:get nothing.here

}
test:config:manifest:merges-a-project-file () {

    local file="${TMPDIR}/Infra.toml" name="${MANIFEST[meta.name]}"

    MANIFEST[deps.onex]=3
    MANIFEST[deps.onex.type]=engine
    MANIFEST[deps.onex.path]=engine/one
    MANIFEST[deps.onex.repo]=o/onex
    MANIFEST[extra.list]=2
    MANIFEST[extra.list.0]=a
    MANIFEST[extra.list.1]=b

    printf '[meta]\nname = "other"\n\n[tools]\ngitleaks = "9.9.9"\n\n[deps]\nonex = { repo = "x/onex" }\ntwox = { type = "engine", path = "engine/two", repo = "x/twox" }\n\n[extra]\nlist = ["z"]\n' > "${file}"

    config:manifest:merge "${file}"

    @eq "${MANIFEST[meta.name]}" "${name}"
    @eq "${MANIFEST[tools.gitleaks]}" 9.9.9
    @eq "${MANIFEST[deps.onex.repo]}|${MANIFEST[deps.onex.path]}" 'x/onex|engine/one'
    @eq "${MANIFEST[deps.twox.path]}" engine/two
    @eq "${MANIFEST[extra.list]}|${MANIFEST[extra.list.0]}|${MANIFEST[extra.list.1]-gone}" '1|z|gone'

    @errors 'No such manifest' config:manifest:merge "${TMPDIR}/nope.toml"

    printf '[paths]\ncache = "/abs"\n' > "${file}"
    @errors 'paths.cache must be a relative path' config:manifest:merge "${file}"

}
test:config:manifest:guards-the-shell-version-and-empty-keys () {

    MANIFEST[meta.bash_version]=five
    @errors 'bash_version must be MAJOR.MINOR' config:manifest:check x.toml

    MANIFEST[meta.bash_version]=5.2.1
    @errors 'bash_version must be MAJOR.MINOR' config:manifest:check x.toml

    MANIFEST[meta.bash_version]=5.2
    config:manifest:check x.toml

    @errors 'Missing manifest key: ' config:manifest:get ''
    @eq "$(config:manifest:list '')" ''

}
test:config:manifest:stamps-a-source-run () {

    local file="${TMPDIR}/bash.toml"

    printf '[meta]\nname = "ok"\n\n[paths]\nentrypoint = "src/main.sh"\nsource = "src"\nbuild = "target"\ncache = ".x"\ntests = "tests"\nbenches = "benches"\nfuzz = "fuzz"\n' > "${file}"

    MANIFEST=()
    TOOL_BUILD=dev TOOL_ENGINE="${TMPDIR}/engine" config:manifest:load "${file}"
    @eq "${MANIFEST[meta.build]}" dev
    @eq "${MANIFEST[meta.src]}" "${TMPDIR}/engine"

    printf '[meta]\nname = "ok"\nsrc = "/written/by/hand"\n\n[paths]\nentrypoint = "src/main.sh"\nsource = "src"\nbuild = "target"\ncache = ".x"\ntests = "tests"\nbenches = "benches"\nfuzz = "fuzz"\n' > "${file}"

    MANIFEST=()
    TOOL_BUILD=dev TOOL_ENGINE="${TMPDIR}/engine" config:manifest:load "${file}"
    @eq "${MANIFEST[meta.src]}" /written/by/hand

}
