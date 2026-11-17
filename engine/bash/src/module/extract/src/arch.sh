declare -g EXTRACT_ACTION=src/module/gate/template
declare -ga EXTRACT_RESULTS=()
declare -g EXTRACT_STAGE="" EXTRACT_DONE=""
declare -ga EXTRACT_KINDS=( engine fragment tutor product )
declare -ga EXTRACT_LOCKS=( uv.lock bun.lock Cargo.lock )
declare -ga EXTRACT_STAYS=( AGENTS.md README.md )
declare -g EXTRACT_HOMES="" EXTRACT_PRODUCTS="" EXTRACT_TUTOR=""
declare -ga EXTRACT_SLOTS=( __0__ __1__ )
