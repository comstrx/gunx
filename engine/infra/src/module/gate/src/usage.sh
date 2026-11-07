@usage gate module:gate:run 'gate [--part P] [--product X] [--type T]' 'Run the gates: deps check lint test safety audit quality security by default' || return
@flag gate '--part P' 'rust python go bun infra api web mobile desktop tutor global; all by default' || return
@flag gate '--product X' 'The product of an api, web, mobile or desktop gate; the first product by default' || return
@flag gate '--type T' 'default, all, or a comma list of the gate types, bench and fuzz included' || return
@flag gate '--timeout S' 'Seconds each gate may take, 1800 by default; fuzz and bench split it by target' || return
@flag gate '--pass' 'Report a failing gate and go on; the command still exits with success' || return
@usage changes module:gate:changes 'changes [--base REF] [--all]' 'Print the gate matrix of what changed since REF (or of everything)' || return
@flag changes '--base REF' 'The git ref to diff against, CI_BASE or HEAD~1 by default' || return
@flag changes '--all' 'Every part and every product fragment, as CI_ALL=true does' || return
