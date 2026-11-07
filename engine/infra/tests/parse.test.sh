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
test:core:toml:reads () {

    local file="${TMPDIR}/manifest.toml"
    local -A table=()

    printf 'name = "infra"\nversion = "0.1.0"\n\n[paths]\nbuild = "target"\ncount = 3\nflag = true\n' > "${file}"
    core:parse:toml table "${file}"
    @eq "${table[name]}" infra
    @eq "${table[paths.build]}" target
    @eq "${table[paths.count]}" 3
    @eq "${table[paths.flag]}" true

    printf 'name = bare\n' > "${file}"
    @errors 'a quoted string, a number, a boolean' core:parse:toml table "${file}"

    printf 'name = "a"\nname = "b"\n' > "${file}"
    @errors 'is repeated' core:parse:toml table "${file}"

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
test:core:toml:reads-inline-tables-and-arrays () {

    local file="${TMPDIR}/inline.toml"
    local -A table=()

    printf '[meta]\nauthors = ["a", "b"]\nnone = []\n[tools]\ntrivy = { version = "0.1.0", binary = "trivy" }\n[deps]\napix = { path = "p", deps = [{ name = "engine", repo = "o/pyx" }] }\nesc = "a \\"b\\""\n' > "${file}"
    core:parse:toml table "${file}"

    @eq "${table[meta.authors]} ${table[meta.authors.0]} ${table[meta.authors.1]} ${table[meta.none]}" '2 a b 0'
    @eq "${table[tools.trivy.version]} ${table[tools.trivy.binary]}" '0.1.0 trivy'
    @eq "${table[deps.apix.deps.0.name]} ${table[deps.apix.deps.0.repo]}" 'engine o/pyx'
    @eq "${table[deps.esc]}" 'a "b"'

    printf 'x = [\n    { name = "a" },\n    { name = "b" },\n]\ny = 1\n' > "${file}"
    core:parse:toml table "${file}"
    @eq "${table[x]} ${table[x.1.name]} ${table[y]}" '2 b 1'

    printf 'x = [1, 2\n' > "${file}"
    @errors 'unterminated array' core:parse:toml table "${file}"
    printf 'x = "a" junk\n' > "${file}"
    @errors 'trailing text' core:parse:toml table "${file}"
    printf 'x = { 1 = 2 }\n' > "${file}"
    @errors 'expected key = value inside' core:parse:toml table "${file}"
    printf 'x = "abc\n' > "${file}"
    @errors 'unterminated string' core:parse:toml table "${file}"

}
