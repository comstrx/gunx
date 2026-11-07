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

    uv export --frozen --no-emit-project --no-emit-workspace --format requirements-txt \
        | uv run pip-audit -r /dev/stdin --strict --progress-spinner off

}
module:gate:python:bench () {

    local file=""

    for file in benches/*.py; do

        [[ -f "${file}" ]] || { @info "no benches"; return 0; }

        uv run python "${file}" || return

    done

}
module:gate:python:fuzz () {

    local file=""

    for file in fuzz/*.py; do

        [[ -f "${file}" ]] || { @info "no fuzz targets"; return 0; }

        uv run python "${file}" || return

    done

}
