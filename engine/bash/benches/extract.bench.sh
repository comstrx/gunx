bench:module:extract:keep () {

    EXTRACT_PRODUCTS=product EXTRACT_TUTOR=tutor

    @measure 'module:extract:keep product path' 20 400 module:extract:keep product product/demo engine/demo/src/lib.rs 'engine/rust|engine/go'

}
bench:module:extract:table () {

    TARGETS=( [benchx]=3 [benchx.type]=engine [benchx.path]=engine/bench [benchx.repo]=o/benchx
              [partx]=3 [partx.type]=fragment [partx.path]=product/demo/web [partx.repo]=o/partx )

    @measure 'module:extract:table 2 rows' 20 20 module:extract:table

}
bench:module:extract:rename () {

    local tree="" index=0

    tree="$(core:fs:temp:dir)" || return

    for (( index = 0; index < 20; index++ )); do
        printf 'name = "tool"\nnote = "nothing to rename in file %s"\n' "${index}" > "${tree}/file-${index}.toml"
    done

    TARGETS=( [benchx]=3 [benchx.type]=engine [benchx.path]=engine/bench [benchx.repo]=o/benchx )

    @measure 'module:extract:rename 20 clean files' 10 5 module:extract:rename "${tree}" benchx

}
bench:module:extract:shapes () {

    @measure 'module:extract:shapes one word' 20 200 module:extract:shapes ToolName

}
