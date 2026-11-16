test:module:bundle:expect:compares () {

    @eq a a
    @errors "Expected 'b' but got 'a'" @eq a b
    @contains hello ell
    @errors "Missing 'x'" @contains hello x
    @absent hello x
    @errors "Unexpected 'ell'" @absent hello ell

}
test:module:bundle:expect:judges-runs () {

    @status 0 true
    @status 3 bash -c 'exit 3'
    @fails false
    @errors 'Expected failure' @fails true
    @errors 'broken' core:error:fail broken
    @errors 'Expected failure' @errors x true

}
test:module:bundle:expect:discovers () {

    @contains "$(module:bundle:expect:discover test:module:bundle:expect:)" test:module:bundle:expect:discovers
    @eq "$(module:bundle:expect:discover nothing:)" ''

}
