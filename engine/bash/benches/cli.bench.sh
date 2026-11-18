bench:core:cli:parse () {

    CLI_VALUED=( [--root]=true [--into]=true )

    @measure 'core:cli:parse 8 words' 30 200 core:cli:parse --root /tmp extract alphax --into /x --gates -e A=1

}
