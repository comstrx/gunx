fixture:core:install:bin () {

    local bin="${TMPDIR}/fake"

    mkdir -p "${bin}"
    export PATH="${bin}:${PATH}" FAKE_LOG="${TMPDIR}/fake.log" FAKE_BIN="${bin}"

    : > "${FAKE_LOG}"

    @print "${bin}"

}
test:core:install:verifies-and-keeps-an-archive () {

    local stage="${TMPDIR}/stage" into="${TMPDIR}/bin" archive="${TMPDIR}/tool.tar.gz" digest="" zeros=""

    fixture:core:net:curl
    export FAKE_CURL_MODE=file FAKE_CURL_FILE="${archive}"

    mkdir -p "${stage}/tool-1.0"
    printf '#!/usr/bin/env bash\necho tool 1.0\n' > "${stage}/tool-1.0/tool"
    tar -czf "${archive}" -C "${stage}" tool-1.0/tool
    digest="$(core:fs:file:hash "${archive}")"
    printf -v zeros '%064d' 0

    core:install:archive tool https://example.com/tool.tar.gz "${digest}" "${into}" tool-1.0/tool
    @eq "$("${into}/tool")" 'tool 1.0'

    core:install:archive tool https://example.com/tool.tar.gz "${digest}" "${into}" tool-1.0/tool
    @eq "$(wc -l < "${FAKE_CURL_LOG}" | tr -d ' ')" 1 'a kept archive is never fetched again'

    rm -f -- "${into}/tool"
    @errors 'checksum mismatch' core:install:archive tool https://example.com/tool.tar.gz "${zeros}" "${into}" tool-1.0/tool
    @errors 'Cannot unpack missing' core:install:archive tool https://example.com/tool.tar.gz "${digest}" "${into}" missing
    @errors 'Only an https download' core:install:archive tool http://example.com/tool.tar.gz "${digest}" "${into}"
    @errors 'Not a member path' core:install:archive tool https://example.com/tool.tar.gz "${digest}" "${into}" ../tool
    @errors 'Not a SHA-256 digest' core:install:archive tool https://example.com/tool.tar.gz nope "${into}"

}
test:core:install:fills-a-missing-command () {

    local bin=""

    bin="$(fixture:core:install:bin)"
    export PATH="${bin}:${PATH}" FAKE_LOG="${TMPDIR}/fake.log" FAKE_BIN="${bin}" PKG_MANAGER=apt

    cat > "${bin}/sudo" <<'FAKE'
#!/usr/bin/env bash
[[ "${1}" != -n ]] || shift
"$@"
FAKE
    cat > "${bin}/apt-get" <<'FAKE'
#!/usr/bin/env bash
printf 'apt-get %s\n' "$*" >> "${FAKE_LOG}"
[[ "${1}" == install ]] || exit 0
for name in "${@:2}"; do
    [[ "${name}" == -* ]] || { printf '#!/usr/bin/env bash\n' > "${FAKE_BIN}/${name}"; chmod 755 "${FAKE_BIN}/${name}"; }
done
FAKE
    printf '#!/usr/bin/env bash\nexit 1\n' > "${bin}/dpkg-query"
    chmod 755 "${bin}/sudo" "${bin}/apt-get" "${bin}/dpkg-query"

    core:install:command zz-tool apt=zz-tool brew=zz-other
    core:sys:has zz-tool
    @contains "$(cat "${FAKE_LOG}")" 'apt-get install -y --no-install-recommends zz-tool'

    core:install:command zz-tool
    core:install:command zz-two
    @eq "$(grep -c 'apt-get update' "${FAKE_LOG}")" 1 'the index is refreshed once per run'
    @eq "$(grep -c 'install.*zz-tool' "${FAKE_LOG}")" 1 'a present command is never installed again'

    @errors 'zz-ghost is still missing after installing apt=zz-other' core:install:command zz-ghost apt=zz-other

}
test:core:install:asks-cargo-go-and-rustup-only-when-needed () {

    local bin=""

    bin="$(fixture:core:install:bin)"
    export PATH="${bin}:${PATH}" FAKE_LOG="${TMPDIR}/fake.log" FAKE_BIN="${bin}"

    cat > "${bin}/cargo" <<'FAKE'
#!/usr/bin/env bash
case "${1}" in
    install) [[ "${2}" != --list ]] || { printf 'cargo-foo v1.2.0:\n    cargo-foo\n'; exit 0; } ;;
    binstall) [[ "${2}" != -V ]] || exit 0 ;;
esac
printf 'cargo %s\n' "$*" >> "${FAKE_LOG}"
FAKE
    cat > "${bin}/go" <<'FAKE'
#!/usr/bin/env bash
case "${1}" in
    env)     printf '%s\n' "${FAKE_BIN}" ;;
    version) printf '%s: go1.27\n\tpath\texample.com/m/cmd/x\n\tmod\texample.com/m\tv1.0.0\th1:x\n\tdep\texample.com/d\tv1.1.0\th1:y\n' "${3}" ;;
    *)       printf 'go %s\n' "$*" >> "${FAKE_LOG}" ;;
esac
FAKE
    cat > "${bin}/rustup" <<'FAKE'
#!/usr/bin/env bash
printf 'rustup %s\n' "$*" >> "${FAKE_LOG}"
FAKE
    printf '#!/usr/bin/env bash\n' > "${bin}/x"
    chmod 755 "${bin}/cargo" "${bin}/go" "${bin}/rustup" "${bin}/x"

    core:install:cargo cargo-foo 1.2.0
    core:install:cargo cargo-foo
    core:install:cargo cargo-bar
    core:install:cargo cargo-foo 1.3.0
    @eq "$(cat "${FAKE_LOG}")" $'cargo binstall -y --locked cargo-bar\ncargo binstall -y --locked cargo-foo@1.3.0'

    : > "${FAKE_LOG}"
    core:install:go example.com/m/cmd/x v1.0.0
    core:install:go example.com/m/cmd/x v1.1.0
    @eq "$(cat "${FAKE_LOG}")" 'go install example.com/m/cmd/x@v1.1.0'

    : > "${FAKE_LOG}"
    core:install:rustup nightly-2026-10-08 miri rust-src
    @eq "$(cat "${FAKE_LOG}")" 'rustup toolchain install nightly-2026-10-08 --profile minimal --component miri --component rust-src'

    @errors 'Not a crate name' core:install:cargo 'bad name'
    @errors 'Go installs a pinned version' core:install:go example.com/m/cmd/x latest
    @errors 'Not a Rust toolchain' core:install:rustup ''

}
test:core:install:unpacks-every-archive-kind () {

    local work="${TMPDIR}/pack"

    mkdir -p "${work}/tool-v1" "${work}/out"
    printf '#!/usr/bin/env bash\nprintf one\n' > "${work}/tool-v1/tool"
    printf '#!/usr/bin/env bash\nprintf two\n' > "${work}/flat"

    tar -cJf "${work}/a.tar.xz" -C "${work}" tool-v1/tool
    tar -czf "${work}/b.tgz" -C "${work}" flat
    gzip -c "${work}/flat" > "${work}/c.gz"
    cp -- "${work}/flat" "${work}/d"

    core:install:unpack "${work}/a.tar.xz" https://x/a.tar.xz tool-v1/tool "${work}/out"
    @eq "$(bash "${work}/out/tool-v1/tool")" one

    rm -f -- "${work}/out/flat"
    core:install:unpack "${work}/b.tgz" https://x/b.tgz?raw=1 flat "${work}/out"
    @eq "$(bash "${work}/out/flat")" two

    rm -f -- "${work}/out/flat"
    core:install:unpack "${work}/c.gz" https://x/c.gz flat "${work}/out"
    @eq "$(bash "${work}/out/flat")" two

    rm -f -- "${work}/out/flat"
    core:install:unpack "${work}/d" https://x/releases/flat flat "${work}/out"
    @eq "$(bash "${work}/out/flat")" two

    @errors 'Cannot unpack flat from c.tar.xz' core:install:unpack "${work}/c.gz" https://x/c.tar.xz flat "${work}/out"

}
test:core:install:needs-and-names-what-it-installs () {

    core:install:need bash tar
    @errors 'A command is required' core:install:command ''

    @errors 'Not a Python tool name' core:install:uv 'bad name'
    @errors 'Not a version of ruff' core:install:uv ruff latest
    @errors 'Not a package name' core:install:bun 'Bad Name'
    @errors 'Not a version of prettier' core:install:bun prettier next

}
