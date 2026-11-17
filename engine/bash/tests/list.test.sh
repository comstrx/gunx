test:core:list:searches () {

    core:list:has b a b c
    @fails core:list:has z a b c
    @fails core:list:has a
    @eq "$(core:list:first x y)" x
    @eq "$(core:list:last x y)" y
    @fails core:list:first
    @eq "$(core:list:count a b c)" 3

}
test:core:list:reshapes () {

    @eq "$(core:list:uniq b a b c a | tr '\n' ' ')" 'b a c '
    @eq "$(core:list:sort c a b | tr '\n' ' ')" 'a b c '
    @eq "$(core:list:sort)" ''
    @eq "$(core:list:without b a b c | tr '\n' ' ')" 'a c '

}
test:core:list:shuffles () {

    @eq "$(core:list:shuffle a b c | sort | tr '\n' ' ')" 'a b c '
    @eq "$(core:list:shuffle)" ''

}
test:core:list:keeps-an-empty-item () {

    @eq "$(core:list:uniq a '' b '' a | tr '\n' '|')" 'a||b|'
    @eq "$(core:list:uniq '' | wc -l | tr -d ' ')" 1

}
