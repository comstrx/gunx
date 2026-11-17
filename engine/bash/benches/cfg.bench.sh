bench:core:cfg:set () {

    @measure 'core:cfg:set one key' 20 200 core:cfg:set BENCH_KEY value

}
bench:core:cfg:number () {

    core:cfg:set BENCH_COUNT 42

    @measure 'core:cfg:number in range' 20 200 core:cfg:number BENCH_COUNT 0 100

}
