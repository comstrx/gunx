test:module:bundle:hello () {

    @eq "$(module:bundle:hello)" 'hello world'
    @eq "$(bash "${TOOL_BIN}" hello)" 'hello world'
    @eq "$(bash "${TOOL_BIN}" --version)" "$(module:bundle:view:version)"

}
test:module:bundle:assets-match () {

    local name="" engine="${INFRA_ENGINE:-}"

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }
    declare -F bundle:asset >/dev/null || { @err "The test runs inside the bundle"; return; }

    while IFS= read -r name; do
        @eq "$(bundle:asset "${name}")" "$(cat "${engine}/${name}")" "asset ${name}"
    done < <(bundle:assets)

    @eq "$(bundle:assets | wc -l | tr -d ' ')" 2

}
test:module:bundle:sources-match () {

    local name="" engine="${INFRA_ENGINE:-}" count=0

    [[ -n "${engine}" && -d "${engine}" ]] || { @err "INFRA_ENGINE must name the source checkout"; return; }

    while IFS= read -r name; do

        [[ -f "${engine}/src/${name}" ]] || { @err "embedded ${name} has no file"; return; }
        count=$(( count + 1 ))

    done < <(bundle:sources)

    @eq "${count}" "$(find "${engine}/src" -name '*.sh' -not -path '*/src/main.sh' | wc -l | tr -d ' ')"

}
test:module:bundle:install-guards () {

    CLI_VALUED=( [--alias]=true [--into]=true )
    CLI_FLAGS=( [--alias]=Gun )
    @errors 'An alias is a lowercase name' module:bundle:install

    CLI_FLAGS=( [--alias]=gun [--into]="${TMPDIR}/bin" )
    @errors 'Builds require the source checkout' module:bundle:install

}
test:app:router:serves-fetch () {

    @eq "$(module:bundle:usage:handler fetch)" module:bundle:fetch
    @eq "$(module:bundle:usage:handler build)" module:bundle:build:pick

}
