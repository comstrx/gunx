bench:config:targets:load () {

    MANIFEST+=( [deps.benchx]=3 [deps.benchx.type]=engine [deps.benchx.path]=engine/bench [deps.benchx.repo]=o/benchx )

    @measure 'config:targets:load table' 20 20 config:targets:load

}
bench:config:targets:get () {

    TARGETS=( [benchx]=3 [benchx.type]=engine [benchx.path]=engine/bench [benchx.repo]=o/benchx )

    @measure 'config:targets:get path' 20 400 config:targets:get benchx path

}
bench:config:targets:set () {

    TARGETS=()

    @measure 'config:targets:set one key' 20 400 config:targets:set benchx path engine/bench

}
bench:config:targets:settle () {

    local index=0

    TARGETS=()

    for (( index = 0; index < 9; index++ )); do

        TARGETS["row${index}"]=1
        TARGETS["row${index}.repo"]="o/row${index}"
        TARGETS["row${index}.deps"]=1
        TARGETS["row${index}.deps.0.repo"]=o/row0

    done

    @measure 'config:targets:settle 9 rows' 10 5 config:targets:settle

}
