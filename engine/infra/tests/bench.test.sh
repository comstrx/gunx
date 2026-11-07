test:module:bundle:bench:samples-and-reports () {

    local line=""
    local -a samples=()

    mapfile -t samples < <(module:bundle:bench:samples 5 3 true)
    @eq "${#samples[@]}" 5

    [[ "${samples[0]}" =~ ^[0-9]+$ ]]

    line="$(module:bundle:bench:report demo 300 100 200 900 500)"

    @contains "${line}" 'p50=300ns'
    @contains "${line}" 'min=100ns'
    @contains "${line}" 'max=900ns'
    @contains "${line}" 'n=5'
    @contains "${line}" 'p50ns=300'
    @eq "$(module:bundle:bench:p50 "${line}")" 300
    @errors 'No p50ns' module:bundle:bench:p50 'demo p95=1'

    @errors 'No samples' module:bundle:bench:report demo
    @errors 'Bench subject failed' module:bundle:bench:samples 1 1 false

}
test:module:bundle:bench:scales-units () {

    @eq "$(module:bundle:bench:unit 999)" 'ns 1'
    @eq "$(module:bundle:bench:unit 20000)" 'µs 1000'
    @eq "$(module:bundle:bench:unit 20000000)" 'ms 1000000'
    @contains "$(@measure demo 10 2 true)" 'n=10'

}
test:module:bundle:bench:keeps-a-baseline () {

    local file="${TMPDIR}/baseline.tsv"

    module:bundle:bench:save "${file}" demo 'demo p50=1ns p50ns=100'
    module:bundle:bench:save "${file}" other 'other p50=1ns p50ns=50'
    module:bundle:bench:save "${file}" demo 'demo p50=1ns p50ns=120'

    @eq "$(cat "${file}")" $'other\t50\ndemo\t120'

    module:bundle:bench:compare "${file}" demo 'demo p50ns=130' 25
    @errors 'slower than the baseline' module:bundle:bench:compare "${file}" demo 'demo p50ns=200' 25
    module:bundle:bench:compare "${file}" unknown 'unknown p50ns=1' 25
    module:bundle:bench:compare "${TMPDIR}/none" demo 'demo p50ns=1' 25

}
