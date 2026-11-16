test:core:num:judges () {

    core:num:is 42
    core:num:is -7
    @fails core:num:is 4.2
    @fails core:num:is ''
    core:num:natural 0
    core:num:natural 17
    @fails core:num:natural 007
    @fails core:num:natural -1
    core:num:between 5 1 10
    core:num:between 5 5
    @fails core:num:between 11 1 10
    @fails core:num:between x 1 10
    @fails core:num:is 08
    @fails core:num:is -0x1

}
test:core:num:computes () {

    @eq "$(core:num:clamp 15 1 10)" 10
    @eq "$(core:num:clamp -3 1 10)" 1
    @eq "$(core:num:percent 25 200)" 12
    @eq "$(core:num:percent 1 0)" 0
    @eq "$(core:num:max 3 9 4)" 9
    @eq "$(core:num:min 3 9 4)" 3
    @eq "$(core:num:max -3 -9)" -3
    @errors 'Clamp takes three integers' core:num:clamp 08 1 10
    @errors 'Not an integer: many' core:num:max 1 many
    @errors 'A percent takes two integers' core:num:percent 'x y' 2

}
