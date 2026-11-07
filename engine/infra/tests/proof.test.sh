test:module:bundle:proof:lists-and-isolates () {

    @contains "$(module:bundle:test:list)" test:module:bundle:proof:lists-and-isolates
    @errors 'Unknown test: nope' module:bundle:test:isolate nope
    @errors 'Unknown test: test:no:such' module:bundle:test:isolate test:no:such
    @eq "$(module:bundle:test:isolate test:app:hello:world)" ''

}
test:module:bundle:proof:runs-through-the-bundle () {

    @contains "$(bash "${TOOL_BIN}" test --list bundle:hello)" test:module:bundle:hello
    @contains "$(bash "${TOOL_BIN}" test bundle:hello 2>&1)" 'pass test:module:bundle:hello'
    @errors 'No tests matched: zzz' bash "${TOOL_BIN}" test zzz

}
test:module:bundle:proof:refuses-from-a-bundle () {

    @errors 'Benches run from the source checkout' module:bundle:bench:run
    @errors 'Fuzz runs from the source checkout' module:bundle:fuzz:run 1
    @errors 'Audit runs from the source checkout' module:bundle:audit:run
    @errors 'Seconds must be a positive number' bash "${TOOL_BIN}" fuzz zero

}
test:module:bundle:proof:checks-syntax () {

    local root="${TMPDIR}/tree"

    mkdir -p "${root}/src" "${root}/tests" "${root}/benches" "${root}/fuzz"
    printf 'x () {\n\n    out ok\n\n}\n' > "${root}/src/ok.sh"
    module:bundle:syntax "${root}"

    printf 'x () {\n' > "${root}/tests/broken.sh"
    @errors 'Syntax check failed' module:bundle:syntax "${root}"

}
