declare -ga GATE_CARGO=( cargo-nextest cargo-deny cargo-vet cargo-udeps cargo-hack cargo-semver-checks cargo-fuzz )
declare -ga GATE_SECURITY=( gitleaks trivy syft zizmor )
declare -ga GATE_QUALITY=( typos taplo prettier )
declare -ga GATE_TYPES=( lock fetch check lint test safety audit semver quality security bench fuzz )
declare -ga GATE_DEFAULT=( fetch check lint test safety audit semver quality security )
declare -ga GATE_WRITERS=( lock )
declare -g GATE_LEAD=fetch
declare -ga GATE_LOCK_CARGO=( --locked ) GATE_LOCK_UV=( --locked ) GATE_LOCK_BUN=( --frozen-lockfile )
declare -ga GATE_RESULTS=()
declare -ga GATE_ARGS=() GATE_REST=()
declare -g GATE_FUZZ=60 GATE_KIND=""
declare -ga GATE_MIRI=( stacked tree )
declare -ga GATE_SANITIZERS=( address thread memory leak )
declare -ga GATE_GOVERNANCE=( quality security )
