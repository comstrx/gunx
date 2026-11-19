bench:module:extract:keep () {

    EXTRACT_PRODUCTS=product

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
bench:module:extract:changelog () {

    local root="" tree="" version=0

    root="$(core:fs:temp:dir)" || return
    tree="$(core:fs:temp:dir)" || return

    for (( version = 0; version < 40; version++ )); do
        printf '## v0.%s.0\n\n### one\n\n- a\n- b\n\n### two\n\n- c\n\n### demo-part\n\n- d\n- e\n\n### other\n\n- f\n\n' "${version}"
    done > "${root}/CHANGELOG.md"

    @measure 'module:extract:changelog 40 versions, 3 of 4 blocks' 10 5 module:extract:changelog "${root}" "${tree}" one two=shown 'demo-*'

}
bench:module:extract:shallow () {

    local tree="" index=0

    tree="$(core:fs:temp:dir)" || return
    mkdir -p "${tree}/product/part" "${tree}/.github"

    for (( index = 0; index < 20; index++ )); do
        printf 'one = { path = "../../../engine/demo/src/one-%s" }\n' "${index}" > "${tree}/product/part/file-${index}.toml"
        printf 'path: product/demo/part-%s\n' "${index}" > "${tree}/.github/flow-${index}.yml"
    done

    EXTRACT_HOMES='engine|product'

    @measure 'module:extract:shallow 40 files' 5 3 module:extract:shallow "${tree}" product product/demo

}
bench:module:extract:flags () {

    TARGETS=( [benchx]=3 [benchx.type]=engine [benchx.path]=engine/bench [benchx.repo]=o/benchx )

    CLI_VALUED=( [--name]=true [--repo]=true [--owner]=true [--logo]=true [--refs]=true [--tag]=true [--branch]=true )
    CLI_FLAGS=( [--name]=chosen [--repo]=o/other [--owner]=o [--logo]=https://example.com/l.png [--refs]=engine/bash:o/basex,engine/side:o/sidex [--tag]=v1 [--branch]=main )

    @measure 'module:extract:flags 7 flags' 20 50 module:extract:flags benchx

}
bench:module:extract:whole () {

    TARGETS=( [benchx]=1 )

    @measure 'module:extract:whole defaults' 20 200 module:extract:whole benchx

}
