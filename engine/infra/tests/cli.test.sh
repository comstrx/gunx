test:core:cli:parses () {

    CLI_VALUED=( [--root]=true )

    core:cli:parse --root /tmp test --check -e A=1 one -- --two
    @eq "$(core:cli:value --root)" /tmp
    @eq "${CLI_ARGS[*]}" 'test one --two'
    @eq "${CLI_OVERRIDES[*]}" 'A=1'

    core:cli:flag --check
    @fails core:cli:flag --list
    @eq "$(core:cli:switches | sort | tr '\n' ' ')" '--check --root '

    core:cli:parse --root=/opt
    @eq "$(core:cli:value --root)" /opt

}
test:core:cli:refuses () {

    CLI_VALUED=( [--root]=true )

    @errors 'Repeated flag' core:cli:parse --check --check
    @errors 'Unknown flag' core:cli:parse -x
    @errors 'Expected KEY=VALUE' core:cli:parse -e lower=1
    @errors 'takes no value' core:cli:parse --check=yes
    @errors 'Value required' core:cli:parse --root
    @errors 'Invalid flag' core:cli:parse --bad_flag

}
test:core:cli:suggests () {

    @eq "$(core:cli:suggest hellp hello help)" hello
    @eq "$(core:cli:suggest ver version)" version
    @eq "$(core:cli:suggest zzz hello)" ''

}
