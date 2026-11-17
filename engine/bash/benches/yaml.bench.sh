bench:core:yaml:keys () {

    local file=""

    file="$(core:fs:temp:file)" || return
    printf 'name: ci\n\non:\n  push:\n    branches: [main]\n\njobs:\n  gate:\n    steps:\n      - run: tool gate\n' > "${file}"

    @measure 'yaml keys of 10 lines' 20 20 core:parse:yaml:keys "${file}"

}
bench:core:yaml:prune () {

    local file=""

    file="$(core:fs:temp:file)" || return
    printf 'jobs:\n  gate:\n    steps:\n      - run: tool gate\n      - run: tool sync\n' > "${file}"

    @measure 'yaml prune without a hit' 20 20 core:parse:yaml:prune "${file}" '^ *- run: tool nothing'

}
