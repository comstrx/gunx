test:config:settings:precedence () {

    local root="${TMPDIR}/project"

    mkdir -p "${root}"
    printf 'PROJECT=filed\nLOG_LEVEL=warn\n' > "${root}/.env.local"

    TOOL_ROOT="${root}"
    CONFIG=()
    CONFIG_KEYS=()
    CLI_OVERRIDES=( RELEASE=cli )

    PROJECT=processed config:settings:load

    @eq "${CONFIG[PROJECT]}" processed
    @eq "${CONFIG_SOURCE[PROJECT]}" process
    @eq "${CONFIG[LOG_LEVEL]}" warn
    @eq "${CONFIG_SOURCE[LOG_LEVEL]}" file
    @eq "${CONFIG[RELEASE]}" cli
    @eq "${CONFIG_SOURCE[RELEASE]}" cli
    @eq "${CONFIG_DEFAULTS[LOG_LEVEL]}" info
    @eq "${CONFIG[RUN_RETRIES]}" 3
    @contains "$(config:settings:keys)" TEST_TIMEOUT

}
test:config:settings:refuses-the-unknown () {

    local root="${TMPDIR}/project"

    mkdir -p "${root}"
    printf 'STRANGER=1\n' > "${root}/.env"

    TOOL_ROOT="${root}"
    CONFIG=()
    CONFIG_KEYS=()
    CLI_OVERRIDES=()

    @errors 'Unknown setting in' config:settings:load

    rm -f -- "${root}/.env"

    CLI_OVERRIDES=( STRANGER=1 )
    @errors 'Unknown setting: STRANGER' config:settings:load

    CLI_OVERRIDES=( LOG_LEVEL=loud )
    @errors 'LOG_LEVEL must be' config:settings:load

    CLI_OVERRIDES=( RUN_RETRIES=0 )
    @errors 'RUN_RETRIES must be a number from 1 to 10' config:settings:load

    CLI_OVERRIDES=( TEST_TIMEOUT=x )
    @errors 'TEST_TIMEOUT must be a number' config:settings:load

}
test:config:settings:picks-the-file () {

    local root="${TMPDIR}/project"

    mkdir -p "${root}"
    TOOL_ROOT="${root}"

    @eq "$(config:settings:file)" ''
    printf 'LOG_LEVEL=info\n' > "${root}/.env"
    @eq "$(config:settings:file)" "${root}/.env"
    printf 'LOG_LEVEL=info\n' > "${root}/.env.local"
    @eq "$(config:settings:file)" "${root}/.env.local"
    @eq "$(TOOL_BUILD=release config:settings:file)" "${root}/.env"

}
