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
test:core:toml:reads-inline-tables-and-arrays () {

    local file="${TMPDIR}/inline.toml"
    local -A table=()

    printf '[meta]\nauthors = ["a", "b"]\nnone = []\n[tools]\ntrivy = { version = "0.1.0", binary = "trivy" }\n[deps]\npartx = { path = "p", deps = [{ name = "engine", repo = "o/basex" }] }\nesc = "a \\"b\\""\n' > "${file}"
    core:parse:toml table "${file}"

    @eq "${table[meta.authors]} ${table[meta.authors.0]} ${table[meta.authors.1]} ${table[meta.none]}" '2 a b 0'
    @eq "${table[tools.trivy.version]} ${table[tools.trivy.binary]}" '0.1.0 trivy'
    @eq "${table[deps.partx.deps.0.name]} ${table[deps.partx.deps.0.repo]}" 'engine o/basex'
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
test:core:toml:reads-escapes-and-comments () {

    local file="${TMPDIR}/escapes.toml"
    local -A table=()

    {
        printf '[meta] # a head note\n'
        printf 'a = "x\\ty\\n\\"q\\" \\\\ \\u0041"\n'
        printf "b = 'lit\\\\eral # kept'\n"
        printf 'c = [ # first\n    "one", # one\n    "t]w#o", # two\n    { name = "n#" }, # three\n] # end\n'
    } > "${file}"

    core:parse:toml table "${file}"

    @eq "${table[meta.a]}" $'x\ty\n"q" \\ A'
    @eq "${table[meta.b]}" 'lit\eral # kept'
    @eq "${table[meta.c]}|${table[meta.c.0]}|${table[meta.c.1]}|${table[meta.c.2.name]}" '3|one|t]w#o|n#'

    printf 'x = "a\\qb"\n' > "${file}"
    @errors 'an unknown escape' core:parse:toml table "${file}"

    printf 'x = "\\u12"\n' > "${file}"
    @errors 'a bad unicode escape' core:parse:toml table "${file}"

}
test:core:toml:drops-a-whole-section () {

    local file="${TMPDIR}/drop.toml"
    local -A table=()

    printf '[meta]\nname = "x"\n\n[deps]\na = { path = "p", deps = [\n    { name = "e" },\n] }\n[deps.extra]\nb = 1\n\n[deploy]\nstack = "native"\n' > "${file}"

    core:parse:toml:drop "${file}" deps
    core:parse:toml table "${file}"

    @eq "${table[meta.name]}|${table[deploy.stack]}" 'x|native'
    @absent "$(cat "${file}")" 'deps'
    @eq "$(cat "${file}")" $'[meta]\nname = "x"\n\n[deploy]\nstack = "native"'

    printf '[a]\nx = 1\n\n[deps.one]\ny = 1\n\n[deps.two]\nz = [\n\n    1,\n]\n\n\n[b]\nw = 2\n\n[deps.three]\nv = 3\n\n' > "${file}"
    core:parse:toml:drop "${file}" deps
    @eq "$(cat "${file}")" $'[a]\nx = 1\n\n[b]\nw = 2'
    @eq "$(tail -c 6 "${file}" | od -An -c | tr -d ' ')" 'w=2\n'
    @errors 'Not a section name' core:parse:toml:drop "${file}" 'Bad Name'

}
