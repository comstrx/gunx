bench:core:log:info () {

    @measure 'core:log:info one line' 20 200 core:log:info 'one line of text'

}
bench:core:log:redact () {

    CONFIG[BENCH_TOKEN]=benchsecretvalue1234

    @measure 'core:log:redact 1 secret' 20 100 core:log:redact 'a line that holds benchsecretvalue1234 inside'

}
