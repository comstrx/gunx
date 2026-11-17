bench:config:targets:load () {

    MANIFEST+=( [deps.benchx]=3 [deps.benchx.type]=engine [deps.benchx.path]=engine/bench [deps.benchx.repo]=o/benchx )

    @measure 'config:targets:load table' 20 20 config:targets:load

}
bench:config:targets:get () {

    TARGETS=( [benchx]=3 [benchx.type]=engine [benchx.path]=engine/bench [benchx.repo]=o/benchx )

    @measure 'config:targets:get path' 20 400 config:targets:get benchx path

}
