test:core:cfg:sets-and-shows () {

    CONFIG=() CONFIG_KEYS=() CONFIG_SOURCE=() CONFIG_DEFAULTS=()

    core:cfg:default PROJECT demo
    core:cfg:set PROJECT other cli
    @eq "$(core:cfg:show PROJECT)" other
    @eq "${CONFIG_SOURCE[PROJECT]}" cli
    @eq "${CONFIG_DEFAULTS[PROJECT]}" demo
    @eq "${CONFIG_KEYS[*]}" PROJECT
    @errors 'Invalid setting name' core:cfg:set lower 1
    @errors 'Unknown setting: NOPE' core:cfg:show NOPE

}
test:core:cfg:loads-known-keys () {

    local file="${TMPDIR}/one.env"

    CONFIG=() CONFIG_KEYS=()
    core:cfg:default PROJECT ''

    printf 'PROJECT=filed\n' > "${file}"
    core:cfg:load "${file}" known file
    @eq "${CONFIG[PROJECT]}" filed

    printf 'STRANGER=1\n' > "${file}"
    @errors 'Unknown setting in' core:cfg:load "${file}" known file
    core:cfg:load "${file}" any file
    @eq "${CONFIG[STRANGER]}" 1

    @errors 'Unknown setting: NOPE' core:cfg:overrides NOPE=1
    core:cfg:overrides PROJECT=cli
    @eq "${CONFIG_SOURCE[PROJECT]}" cli

}
test:core:cfg:requires-and-counts () {

    CONFIG=() CONFIG_KEYS=()
    core:cfg:default PROJECT ''
    core:cfg:default RUN_RETRIES 3

    @errors 'Missing setting: PROJECT' core:cfg:require PROJECT
    core:cfg:require RUN_RETRIES
    core:cfg:number RUN_RETRIES 1 10
    @errors 'must be a number from 5 to 10' core:cfg:number RUN_RETRIES 5 10
    CONFIG[RUN_RETRIES]=x
    @errors 'must be a number' core:cfg:number RUN_RETRIES 1

}
