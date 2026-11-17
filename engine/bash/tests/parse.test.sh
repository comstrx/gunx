test:core:parse:reads-env () {

    local file="${TMPDIR}/pairs.env"

    local -A pairs=()
    local -a order=()

    printf '# a block\n\nA=1\nB="two words"\nC=\n' > "${file}"
    core:parse:env pairs order "${file}"
    @eq "${order[*]}" 'A B C'
    @eq "${pairs[B]}" 'two words'
    @eq "${pairs[C]}" ''

    printf 'A=1\nA=2\n' > "${file}"
    @errors 'is repeated' core:parse:env pairs order "${file}"

    printf 'lower=1\n' > "${file}"
    @errors 'expected KEY=VALUE' core:parse:env pairs order "${file}"

}
test:core:parse:judges-names () {

    core:validate:identifier rustx
    @fails core:validate:identifier RustX
    core:validate:key LOG_LEVEL
    @fails core:validate:key log_level
    @eq "$(core:parse:unquote '"a b"')" 'a b'
    @eq "$(core:parse:unquote "'a'")" a
    @eq "$(core:parse:unquote bare)" bare

}
test:core:parse:keeps-quoted-hashes () {

    local file="${TMPDIR}/quoted.env"

    local -A pairs=()
    local -a order=()

    printf 'A="x # y" # note\nB=plain # note\nC=a#b\nD='"'"'s q'"'"'\nE= spaced \n' > "${file}"
    core:parse:env pairs order "${file}"

    @eq "${pairs[A]}|${pairs[B]}|${pairs[C]}|${pairs[D]}|${pairs[E]}" 'x # y|plain|a#b|s q|spaced'

    printf 'A="x" y\n' > "${file}"
    @errors 'text after the closing quote' core:parse:env pairs order "${file}"

    printf 'A="x\n' > "${file}"
    @errors 'unterminated quote' core:parse:env pairs order "${file}"

}
test:core:parse:counts-only-numbers () {

    local -A table=( [items]=2 [items.0]=a [items.1]=b [word]=many [lead]=02 )

    @eq "$(core:parse:count table items)" 2
    @eq "$(core:parse:count table word)" 0
    @eq "$(core:parse:count table lead)" 0
    @eq "$(core:parse:list table items | tr '\n' ' ')" 'a b '
    @eq "$(core:parse:list table word)" ''

}
test:core:parse:reads-a-table-by-any-key () {

    local -A table=( [list]=2 [list.0]=one [list.1]=two [word]=text )

    @fails core:parse:has table ''
    @eq "$(core:parse:get table '' fallback)" fallback
    @errors 'Missing key: ' core:parse:get table ''
    @eq "$(core:parse:count table '')" 0
    @eq "$(core:parse:list table '')" ''
    @eq "$(core:parse:list table list | tr '\n' ' ')" 'one two '

}
