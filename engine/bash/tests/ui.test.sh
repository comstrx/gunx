test:core:ui:aligns-a-table () {

    local aligned=""

    aligned="$(printf 'a\tone\nlonger\ttwo\n' | NO_COLOR=1 core:ui:table)"

    @eq "${aligned}" $'  a       one\n  longer  two'
    @eq "$(NO_COLOR=1 core:ui:section Title)" $'\nTitle'
    @eq "$(NO_COLOR=1 core:ui:row alone)" '  alone'

}
test:core:ui:aligns-every-column () {

    local grid=""

    grid="$(printf 'a\tlong type\tx\nlonger\tt\ty\n' | NO_COLOR=1 core:ui:grid)"

    @eq "${grid}" $'  a       long type  x\n  longer  t          y'
    @eq "$(printf 'one\t\tz\n' | NO_COLOR=1 core:ui:grid)" '  one    z'

}
test:core:ui:confirm-needs-a-terminal () {

    local status=0

    core:ui:confirm 'sure?' < /dev/null 2>/dev/null || status=$?

    @eq "${status}" 2

}
