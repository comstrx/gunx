module:gate:rust:nightly () {

    @print "+nightly-$(config:tools:get rust nightly)"

}
module:gate:rust:host () {

    local host=""

    host="$(rustc -vV | sed -n 's/^host: //p')" || { @err "rustc cannot name its host"; return; }
    [[ -n "${host}" ]] || { @err "rustc cannot name its host"; return; }

    @print "${host}"

}
module:gate:rust:deps () {

    module:gate:install:rust && core:proc:io cargo fetch "${GATE_ARGS[@]}"

}
module:gate:rust:check () {

    cargo check --workspace --all-targets --all-features "${GATE_ARGS[@]}" \
        && cargo hack check --workspace --feature-powerset "${GATE_ARGS[@]}"

}
module:gate:rust:lint () {

    cargo clippy --workspace --all-targets --all-features "${GATE_ARGS[@]}" -- -D warnings \
        && RUSTDOCFLAGS='-D warnings' cargo doc --workspace --no-deps --all-features "${GATE_ARGS[@]}"

}
module:gate:rust:test () {

    cargo nextest run --workspace --all-features "${GATE_ARGS[@]}" \
        && cargo test --doc --workspace --all-features "${GATE_ARGS[@]}"

}
module:gate:rust:safety () {

    local nightly="" host="" list="" name="" kind=""

    nightly="$(module:gate:rust:nightly)"
    host="$(module:gate:rust:host)" || return
    list="$(module:gate:safety:kinds)" || return

    while read -r name kind; do

        case "${name}" in
            udeps)     cargo "${nightly}" udeps --workspace --all-targets --all-features ;;
            miri)      module:gate:rust:miri "${nightly}" "${kind}" ;;
            sanitizer) module:gate:rust:sanitize "${nightly}" "${host}" "${kind}" ;;
        esac || return

    done <<< "${list}"

}
module:gate:rust:miri () {

    local nightly="${1}" mode="${2}" miriflags="${MIRIFLAGS:-}"

    [[ "${mode}" != tree ]] || miriflags+=" -Zmiri-tree-borrows"

    MIRIFLAGS="${miriflags# }" cargo "${nightly}" miri test --workspace --all-features

}
module:gate:rust:sanitize () {

    local nightly="${1}" host="${2}" kind="${3}"

    [[ "${kind}" == address || "${kind}" == thread || "$(core:sys:os)" == linux ]] || { @info "${kind} sanitizer: linux only; skipped"; return 0; }

    CARGO_TARGET_DIR="target/sanitizer/${kind}" RUSTFLAGS="-Zsanitizer=${kind}" RUSTDOCFLAGS="-Zsanitizer=${kind}" \
        cargo "${nightly}" test -Zbuild-std --target "${host}" --workspace --all-features --tests

}
module:gate:rust:audit () {

    cargo deny --all-features check && cargo vet "${GATE_ARGS[@]}"

}
module:gate:rust:semver () {

    local baseline="" manifest="" name=""
    local -a crates=()

    baseline="$(module:gate:semver:baseline)" || return 0

    for manifest in src/*/Cargo.toml; do

        [[ -f "${manifest%/*}/src/lib.rs" ]] || continue

        name="$(sed -n 's/^name = "\(.*\)"$/\1/p' -- "${manifest}" | head -n 1)"
        [[ -z "${name}" ]] || crates+=( -p "${name}" )

    done

    (( ${#crates[@]} > 0 )) || { @info "semver: no library crate; skipped"; return 0; }

    cargo semver-checks check-release "${crates[@]}" --baseline-rev "${baseline}"

}
module:gate:rust:build () {

    local dev="${1}"

    shift

    if (( dev == 1 )); then cargo build "$@"
    else cargo build --release "$@"
    fi

}
module:gate:rust:run () {

    local dev="${1}"

    shift

    if (( dev == 1 )); then cargo run "$@"
    else cargo run --release "$@"
    fi

}
module:gate:rust:bench () {

    cargo bench --workspace "${GATE_ARGS[@]}"

}
module:gate:rust:fuzz () {

    local nightly="" host="" target=""
    local -a targets=()

    nightly="$(module:gate:rust:nightly)"
    host="$(module:gate:rust:host)" || return

    export CARGO_PROFILE_RELEASE_LTO=off CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16

    cargo "${nightly}" fuzz build --target "${host}" || return
    mapfile -t targets < <(cargo "${nightly}" fuzz list)

    (( ${#targets[@]} > 0 )) || { @info "no fuzz"; return 0; }

    for target in "${targets[@]}"; do

        cargo "${nightly}" fuzz run --target "${host}" "${target}" -- "-max_total_time=${GATE_FUZZ}" || return

    done

}
