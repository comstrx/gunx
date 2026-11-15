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
    module:bundle:bench:save "${file}" other 'other p50=1ns p25ns=40 p50ns=50 p75ns=60'
    module:bundle:bench:save "${file}" demo 'demo p50=1ns p25ns=110 p50ns=120 p75ns=130'

    @eq "$(cat "${file}")" $'other\t40\t50\t60\ndemo\t110\t120\t130'

    module:bundle:bench:compare "${file}" demo 'demo p50ns=130' 25
    @errors 'slower than the baseline' module:bundle:bench:compare "${file}" demo 'demo p25ns=190 p50ns=200 p75ns=210' 25
    @contains "$(module:bundle:bench:compare "${file}" demo 'demo p25ns=120 p50ns=200 p75ns=400' 25 2>&1)" 'inside the noise'

    printf 'legacy\t100\n' >> "${file}"
    @errors 'slower than the baseline' module:bundle:bench:compare "${file}" legacy 'legacy p50ns=200' 25
    module:bundle:bench:compare "${file}" unknown 'unknown p50ns=1' 25
    module:bundle:bench:compare "${TMPDIR}/none" demo 'demo p50ns=1' 25

}
