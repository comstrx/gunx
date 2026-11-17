bench:core:list:has () {

    local -a items=()

    mapfile -t items < <(seq 1 200)

    @measure 'core:list:has last of 200' 20 100 core:list:has 200 "${items[@]}"

}
bench:core:list:uniq () {

    local -a items=()

    mapfile -t items < <(seq 1 100; seq 1 100)

    @measure 'core:list:uniq 200 items' 20 10 core:list:uniq "${items[@]}"

}
