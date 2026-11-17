@usage gate module:gate:run 'gate [--path P] [--type T] [--only-changed]' 'Run the gates of every path, the working directory by default' || return
@flag gate '--path P' 'The directories to gate, a comma list, relative or absolute' || return
@flag gate '--type T' 'default, all, or a comma list of the gate types, bench and fuzz included' || return
@flag gate '--only-changed' 'Only the paths with a change since --base, CI_BASE or HEAD~1' || return
@flag gate '--base REF' 'The ref --only-changed compares with, CI_BASE or HEAD~1 by default' || return
@flag gate '--timeout S' 'Seconds every gate may take, RUN_TIMEOUT (600) by default' || return
@flag gate '--pass' 'Report a failing gate and go on; the command still exits with success' || return
@usage changes module:gate:changes 'changes [--path P] [--base REF]' 'Show which paths --only-changed would gate' || return
@flag changes '--path P' 'The directories to look at, a comma list, relative or absolute' || return
@flag changes '--base REF' 'The ref to compare with, CI_BASE or HEAD~1 by default' || return
@usage toolchains module:gate:toolchains 'toolchains [--path P]' 'Name the toolchains the paths need, as the gate action reads them' || return
@flag toolchains '--path P' 'The directories to look under, a comma list, the working directory by default' || return
@usage build module:gate:build 'build [--dev] [--path P] [ARGS...]' 'Build every path for release, for development with --dev; ARGS go to the tool' || return
@flag build '--dev' 'A development build instead of a release one' || return
@flag build '--path P' 'The directories to build, a comma list, the working directory by default' || return
@raw build || return
@usage run module:gate:launch 'run [--dev] [--path P] [ARGS...]' 'Run one path released, or for development with --dev; ARGS go to it' || return
@flag run '--dev' 'Run for development instead of the release' || return
@flag run '--path P' 'The directory to run, the working directory by default' || return
@raw run || return
@usage install module:gate:install 'install [--path P] [ARGS...]' 'Install the tool of a path as a command; ARGS go to the tool' || return
@flag install '--path P' 'The directory of the tool, the working directory by default' || return
@raw install || return
@usage update module:gate:update 'update [--path P] [ARGS...]' 'Rebuild and reinstall the tool of a path; ARGS go to the tool' || return
@flag update '--path P' 'The directory of the tool, the working directory by default' || return
@raw update || return
@usage remove module:gate:remove 'remove [--path P]' 'Remove the installed command of the tool of a path' || return
@flag remove '--path P' 'The directory of the tool, the working directory by default' || return
@raw remove || return

for tt in "${GATE_TYPES[@]}"; do

    @usage "${tt}" module:gate:kind "${tt} [--path P] [--only-changed] [-- ARGS...]" "The ${tt} gate alone; ARGS after -- go to its tool" || return
    @flag "${tt}" '--path P' 'The directories to gate, a comma list, relative or absolute' || return
    @flag "${tt}" '--only-changed' 'Only the paths with a change since --base, CI_BASE or HEAD~1' || return
    @flag "${tt}" '--base REF' 'The ref --only-changed compares with, CI_BASE or HEAD~1 by default' || return
    @flag "${tt}" '--timeout S' 'Seconds every gate may take, RUN_TIMEOUT (600) by default' || return
    @flag "${tt}" '--pass' 'Report a failing gate and go on; the command still exits with success' || return

done

@flag safety '--type T' 'sanitizer (default), miri, udeps; a kind after a colon: miri:tree' || return
