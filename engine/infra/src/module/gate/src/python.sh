module:gate:python:deps () {

    core:process:io uv sync --locked

}
module:gate:python:check () {

    uv run mypy

}
module:gate:python:lint () {

    uv run ruff check

}
module:gate:python:test () {

    uv run pytest -q

}
module:gate:python:safety () {

    PYTHONDEVMODE=1 PYTHONMALLOC=debug PYTHONWARNINGS=error uv run pytest -q -p no:cacheprovider

}
module:gate:python:audit () {

    uv export --frozen --no-emit-project --no-emit-workspace --no-hashes --format requirements-txt \
        | grep -vE '^-e |file://' \
        | uv run pip-audit -r /dev/stdin --strict --progress-spinner off \
        || return

    module:gate:python:surface

}
module:gate:python:surface () {

    local baseline="" dir="" here="" top="" prefix=""
    local -a search=()

    [[ -f src/engine/pyproject.toml ]] || return 0

    baseline="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null)" \
        || { @info "surface: no earlier release tag; skipped"; return 0; }

    here="$(pwd)"
    top="$(git rev-parse --show-toplevel)" || return
    prefix="$(git rev-parse --show-prefix)" || return

    for dir in src/*/src/engine; do

        [[ "${dir}" == src/engine/src/engine ]] || search+=( -s "${prefix}${dir%/engine}" )

    done

    ( cd -- "${top}" && uv run --frozen --project "${here}" griffe check engine "${search[@]}" -a "${baseline}" )

}
module:gate:python:bench () {

    local file="" found=0

    for file in benches/*.py */benches/*.py; do

        [[ -f "${file}" ]] || continue

        found=1
        uv run python "${file}" || return

    done

    (( found )) || @info "no benches"

}
module:gate:python:fuzz () {

    local file="" found=0

    for file in fuzz/*.py */fuzz/*.py; do

        [[ -f "${file}" ]] || continue

        found=1
        uv run python "${file}" || return

    done

    (( found )) || @info "no fuzz targets"

}
