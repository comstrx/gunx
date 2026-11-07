declare -ga GATE_CARGO=( cargo-nextest cargo-deny cargo-vet cargo-udeps cargo-hack cargo-semver-checks cargo-fuzz )

module:gate:rust:nightly () {

    @print "+nightly-$(config:tools:get rust nightly)"

}
module:gate:rust:deps () {

    local tool=""

    core:process:io rustup toolchain install stable --profile minimal || return
    core:process:io rustup toolchain install "nightly-$(config:tools:get rust nightly)" --profile minimal \
        --component miri --component rust-src || return

    cargo binstall -V >/dev/null 2>&1 || core:process:io cargo install cargo-binstall --locked || return

    for tool in "${GATE_CARGO[@]}"; do

        cargo "${tool#cargo-}" --version >/dev/null 2>&1 || core:process:io cargo binstall -y --locked "${tool}" || return

    done

    core:process:io cargo fetch --locked

}
module:gate:rust:check () {

    cargo check --workspace --all-targets --all-features --locked \
        && cargo hack check --workspace --feature-powerset --locked

}
module:gate:rust:lint () {

    cargo clippy --workspace --all-targets --all-features --locked -- -D warnings \
        && RUSTDOCFLAGS='-D warnings' cargo doc --workspace --no-deps --all-features --locked

}
module:gate:rust:test () {

    cargo nextest run --workspace --all-features --locked \
        && cargo test --doc --workspace --all-features --locked

}
module:gate:rust:safety () {

    local nightly="" host=""

    nightly="$(module:gate:rust:nightly)"
    host="$(rustc -vV | sed -n 's/^host: //p')" || return

    cargo "${nightly}" udeps --workspace --all-targets --all-features || return
    cargo "${nightly}" miri test --workspace --all-features || return

    RUSTFLAGS='-Zsanitizer=address' RUSTDOCFLAGS='-Zsanitizer=address' \
        cargo "${nightly}" test -Zbuild-std --target "${host}" --workspace --all-features --tests

}
module:gate:rust:audit () {

    local baseline=""

    cargo deny --all-features check && cargo vet --locked || return

    baseline="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null)" \
        || { @info "semver: no earlier release tag; skipped"; return 0; }

    cargo semver-checks check-release --workspace --baseline-rev "${baseline}"

}
module:gate:rust:bench () {

    cargo bench --workspace --locked

}
module:gate:rust:fuzz () {

    local nightly="" host="" target="" share=0
    local -a targets=()

    nightly="$(module:gate:rust:nightly)"
    host="$(rustc -vV | sed -n 's/^host: //p')" || return

    export CARGO_PROFILE_RELEASE_LTO=off CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16

    cargo "${nightly}" fuzz build --target "${host}" || return
    mapfile -t targets < <(cargo "${nightly}" fuzz list)

    (( ${#targets[@]} > 0 )) || { @info "no fuzz targets"; return 0; }
    share=$(( GATE_SECONDS * 9 / 10 / ${#targets[@]} ))

    for target in "${targets[@]}"; do

        cargo "${nightly}" fuzz run --target "${host}" "${target}" -- "-max_total_time=${share}" || return

    done

}
