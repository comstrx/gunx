bench:core:str:trim () {

    @measure 'core:str:trim 40 chars' 20 400 core:str:trim '     a line with spaces around it       '

}
bench:core:str:replace () {

    @measure 'core:str:replace 5 hits' 20 400 core:str:replace 'a,b,c,d,e,f' , ';'

}
bench:core:str:join () {

    @measure 'core:str:join 8 items' 20 400 core:str:join , one two three four five six seven eight

}
