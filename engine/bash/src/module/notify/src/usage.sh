@usage notify module:notify:run 'notify [--message M] [--status S] [--channel C,...]' 'Report a run to its channels; every blank is filled from the CI run or git' || return
@flag notify '--message M' 'The body; by default #run · event on ref · sha by actor' || return
@flag notify '--status S' "passed (default), failed, timed-out, cancelled, skipped, warn, info; GitHub's" || return
@flag notify '--title T' 'The subject; by default the project and the workflow' || return
@flag notify '--link URL' 'An https link; by default the CI run' || return
@flag notify '--channel C' 'A comma list of telegram slack discord webhook email; all set ones by default' || return
@flag notify '--seconds N' 'How long the reported run took' || return
@flag notify '--sec N' 'Short for --seconds' || return
@flag notify '--retry N' 'Tries of a request that never left, 1 to 10, RUN_RETRIES (3) by default' || return
@flag notify '--timeout S' 'Seconds one request may take, RUN_TIMEOUT (600) by default' || return
