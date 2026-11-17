bench:core:fs:path () {

    @measure 'core:fs:path:relative 4 parts' 20 400 core:fs:path:relative engine/bash/src/main.sh

}
bench:core:fs:hash () {

    @measure 'core:fs:file:hash manifest' 20 20 core:fs:file:hash "${MANIFEST_FILE}"

}
bench:core:fs:write () {

    local file=""

    file="$(core:fs:temp:file)" || return

    @measure 'core:fs:file:write one line' 20 20 core:fs:file:write "${file}" 644 printf 'line\n'

}
