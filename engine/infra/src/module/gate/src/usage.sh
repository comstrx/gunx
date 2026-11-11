@usage gate module:gate:run 'gate [--part P] [--product X] [--type T]' 'Run the gates: deps check lint test safety audit quality security twins' || return
@flag gate '--part P' "Only ${GATE_PARTS[*]}" || return
@flag gate '--product X' 'Only the fragments of this product, every product by default' || return
@flag gate '--type T' 'default, all, or a comma list of the gate types, bench and fuzz included' || return
@flag gate '--timeout S' 'Seconds each gate may take, 1800 by default; fuzz and bench split it by target' || return
@flag gate '--pass' 'Report a failing gate and go on; the command still exits with success' || return
@usage ci module:gate:ci 'ci [--base REF] [--all] [--part P] [--product X] [--type T]' 'Gate what changed since REF; one command for a laptop and every workflow' || return
@flag ci '--base REF' 'The ref to diff against, CI_BASE or HEAD~1 by default; all when it is gone' || return
@flag ci '--all' 'Everything, changed or not, as CI_ALL=true does' || return
@flag ci '--part P' "Only ${GATE_PARTS[*]}" || return
@flag ci '--product X' 'Only the fragments of this product, every product by default' || return
@flag ci '--type T' 'default, all, or a comma list of the gate types, bench and fuzz included' || return
@flag ci '--timeout S' 'Seconds each gate may take, 1800 by default; fuzz and bench split it by target' || return
@flag ci '--pass' 'Report a failing gate and go on; the command still exits with success' || return
@usage changes module:gate:changes 'changes [--base REF] [--all] [--part P] [--product X]' 'Show what ci would gate since REF, or the changed files of one part' || return
@flag changes '--base REF' 'The ref to diff against, CI_BASE or HEAD~1 by default; all when it is gone' || return
@flag changes '--all' 'Everything, changed or not, as CI_ALL=true does' || return
@flag changes '--part P' 'One part alone, with its changed files; the parts of gate --part' || return
@flag changes '--product X' 'Only the fragments of this product, every product by default' || return
