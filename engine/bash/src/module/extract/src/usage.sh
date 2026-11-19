@usage targets module:extract:targets 'targets' 'List the table of [deps] and fail when a part is missing under the root' || return
@usage extract module:extract:extract 'extract [NAME] [--to DIR] [--push]' 'Extract one target of [deps], or all in order: prove in the lab, then deliver' || return
@flag extract '--type T' 'The kind of NAME: engine, fragment, tutor or product; product by default' || return
@flag extract '--path P' 'The folder of NAME under the root; product/NAME by default for a product' || return
@flag extract '--repo R' 'The mirror of NAME, needed only to push: owner/name, with a host, or a URL' || return
@flag extract '--owner O' 'The owner of the mirror when no repo is given: O/NAME' || return
@flag extract '--name N' 'The name NAME extracts under, the last word of its mirror by default' || return
@flag extract '--logo URL' 'The https address of the logo that opens the README of NAME' || return
@flag extract '--engines L' 'The engine folders a product carries, a comma list' || return
@flag extract '--deps L' 'The mirrors NAME stands on, a comma list of label:repo or repo' || return
@flag extract '--to DIR' 'Sync the proven tree into DIR, DIR/NAME for all; .git and ignored files stay' || return
@flag extract '--push' 'Clone the mirror, fill it, prove it, commit and push' || return
@flag extract '--tag T' 'Push, then tag the mirror T; a tag it already carries is refused' || return
@flag extract '--release' 'Push, then release the newest tag of the mirror; one it has is refused' || return
@flag extract '--branch B' 'The branch to push: this, else the row, else the branch of this repository' || return
@flag extract '--message M' 'The commit message instead of Track <tag or commit>' || return
@flag extract '--gates' 'Run every default gate in the tree; this is the default' || return
@flag extract '--no-gates' 'Run no gate after the lock files are brought in line; the tree goes unproved' || return
@flag extract '--force' 'Deliver even when the lock or a gate failed' || return
@flag extract '--timeout S' 'Seconds every gate may take, RUN_TIMEOUT (600) by default' || return
