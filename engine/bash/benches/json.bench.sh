bench:core:json:string () {

    @measure 'core:json:string 60 chars' 20 100 core:json:string 'a "quoted" line with a tab	and a \ backslash, sixty characters'

}
bench:core:json:object () {

    @measure 'core:json:object 4 pairs' 20 100 core:json:object name '"x"' count 4 flag true list '[1,2,3]'

}
