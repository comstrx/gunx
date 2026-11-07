@usage targets module:extract:targets 'targets' 'List the distribution table and fail when a part is missing under the root' || return
@usage extract module:extract:extract 'extract NAME [--into DIR] [--gates]' 'Prepare one tool or product/<p> in a kept session tree, verify, gate' || return
@flag extract '--into DIR' 'Fill DIR (emptied but its .git) instead of keeping the session folder' || return
@flag extract '--gates' 'Run the part gate on the tree; a failure stops here' || return
@flag extract '--timeout S' 'Seconds the gate may take, 1800 by default' || return
@usage place module:extract:place 'place NAME DIR [--gates]' 'Extract, verify, then write the tree into a local folder' || return
@flag place '--gates' 'Run the part gate on the tree before placing; a failure stops here' || return
@flag place '--timeout S' 'Seconds the gate may take, 1800 by default' || return
@usage push module:extract:push 'push NAME [--repository R] [--dry-run]' 'Clone the mirror, fill it with the tree, verify, gate, commit Track <tag>, push' || return
@flag push '--gates' 'Run the part gate on the tree before pushing; a failure stops here' || return
@flag push '--timeout S' 'Seconds the gate may take, 1800 by default' || return
@flag push '--branch B' 'The branch to push, main by default' || return
@flag push '--repository R' 'Push to R instead of the table: name, owner/name, host/owner/name, URL, path'
@flag push '--dry-run' 'Clone, fill, verify, gate and commit, then stop before the push' || return
@usage sync module:extract:all 'sync [--gates] [--dry-run]' 'Push every target of [deps], the infra engine first' || return
@flag sync '--gates' 'Run every part gate first' || return
@flag sync '--timeout S' 'Seconds each gate may take' || return
@flag sync '--dry-run' 'Clone, fill, verify, gate and commit every target, then stop before the push' || return
