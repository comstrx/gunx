module:gate:python:deps () {

    core:proc:io uv sync "${GATE_ARGS[@]}"

}
module:gate:python:check () {

    uv run mypy "${GATE_ARGS[@]}"

}
module:gate:python:lint () {

    uv run ruff check "${GATE_ARGS[@]}"

}
module:gate:python:test () {

    uv run pytest -q "${GATE_ARGS[@]}"

}
module:gate:python:safety () {

    ! module:gate:safety:alone || return 0

    PYTHONDEVMODE=1 PYTHONMALLOC=debug PYTHONWARNINGS=error uv run pytest -q -p no:cacheprovider

}
module:gate:python:audit () {

    uv export --no-emit-project --no-emit-workspace --no-hashes --format requirements-txt \
        | grep -vE '^-e |file://' \
        | uv run pip-audit -r /dev/stdin --strict --progress-spinner off

}
module:gate:python:semver () {

    local baseline="" dir="" here="" top="" prefix=""
    local -a search=()

    [[ -f src/engine/pyproject.toml ]] || { @info "semver: no engine layout; skipped"; return 0; }

    baseline="$(module:gate:semver:baseline)" || return 0
    ! module:gate:semver:bumped "${baseline}" "$(uv version --short 2>/dev/null)" || return 0

    here="${PWD}"
    top="$(core:git:root .)" || return
    prefix="$(core:git:prefix .)" || return

    for dir in src/*/src/engine; do

        [[ "${dir}" == src/engine/src/engine ]] || search+=( -s "${prefix}${dir%/engine}" )

    done

    ( cd -- "${top}" && uv run --project "${here}" griffe check engine "${search[@]}" -a "${baseline}" )

}
module:gate:python:build () {

    local -a flags=()

    shift

    ! grep -q '^\[tool\.uv\.workspace\]' pyproject.toml || flags=( --all-packages )

    uv build "${flags[@]}" "$@"

}
module:gate:python:run () {

    local dev="${1}"

    shift

    if (( dev == 1 )); then uv run "$@"
    else uv run --no-dev "$@"
    fi

}
module:gate:python:bench () {

    module:gate:scripts "no benches" uv run python -- benches/*.py */benches/*.py

}
module:gate:python:fuzz () {

    module:gate:scripts "no fuzz" uv run python -- fuzz/*.py */fuzz/*.py

}
