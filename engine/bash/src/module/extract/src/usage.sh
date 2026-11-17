@usage targets module:extract:targets 'targets' 'List the table of [deps] and fail when a part is missing under the root' || return
@usage extract module:extract:extract 'extract [NAME] [--to DIR] [--push]' 'Extract one target of [deps], or all in order: prove in the lab, then deliver' || return
@flag extract '--to DIR' 'Sync the proven tree into DIR, DIR/NAME for all; .git and ignored files stay' || return
@flag extract '--push' 'Clone the mirror, fill it, prove it, commit and push' || return
@flag extract '--tag T' 'Push, then tag the mirror T; a tag it already carries is refused' || return
@flag extract '--release' 'Push, then release the newest tag of the mirror; one it has is refused' || return
@flag extract '--branch B' 'The branch to push: this, else the row, else the branch of this repository' || return
@flag extract '--message M' 'The commit message instead of Track <tag or commit>' || return
@flag extract '--gates' 'Run every default gate in the tree; this is the default' || return
@flag extract '--no-gates' 'Run no gate at all: no lock is written, the tree goes as it is' || return
@flag extract '--force' 'Deliver even when a gate failed' || return
@flag extract '--clean' 'Remove the tree from the lab afterwards; this is the default' || return
@flag extract '--no-clean' 'Keep the tree in the lab and print its path' || return
@flag extract '--timeout S' 'Seconds every gate may take, RUN_TIMEOUT (600) by default' || return
