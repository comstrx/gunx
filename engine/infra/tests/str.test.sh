test:core:str:trims-and-cases () {

    @eq "$(core:str:trim '  a b  ')" 'a b'
    @eq "$(core:str:trim '')" ''
    @eq "$(core:str:lower AbC)" abc
    @eq "$(core:str:upper AbC)" ABC
    @eq "$(core:str:repeat ab 3)" ababab
    @eq "$(core:str:pad x 3)" 'x  '

}
test:core:str:tests-and-rewrites () {

    core:str:contains hello ell
    @fails core:str:contains hello x
    core:str:starts hello he
    core:str:ends hello lo
    @fails core:str:starts hello lo
    @eq "$(core:str:replace 'a.b.c' . /)" 'a/b/c'
    @eq "$(core:str:replace abc '' x)" abc

}
test:core:str:splits-and-joins () {

    local -a parts=()

    core:str:split parts 'a::b::c' '::'
    @eq "${#parts[@]} ${parts[*]}" '3 a b c'
    core:str:split parts ''
    @eq "${#parts[@]}" 0
    @eq "$(core:str:join , a b c)" 'a,b,c'
    @eq "$(core:str:join ,)" ''

}
