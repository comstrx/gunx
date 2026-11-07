test:config:tools:reads-scalars-and-tables () {

    @eq "$(config:tools:version gitleaks)" 8.30.1
    @eq "$(config:tools:version shellcheck)" 0.11.0
    @eq "$(config:tools:get shellcheck binary shellcheck)" 'shellcheck-v{version}/shellcheck'
    @eq "$(config:tools:get gitleaks binary gitleaks)" gitleaks
    @eq "$(config:tools:get shellcheck severity)" style
    @eq "$(config:tools:get typos binary)" ./typos
    config:tools:has prettier
    @fails config:tools:has nope
    @errors 'Unknown tool: nope' config:tools:version nope
    @contains "$(config:tools:names | tr '\n' ' ')" 'gitleaks golangci'
    @contains "$(config:tools:names | tr '\n' ' ')" ' shellcheck '
    @absent "$(config:tools:names | tr '\n' ' ')" 'version'
    @eq "$(config:tools:fetchable | tr '\n' ' ')" 'gitleaks shellcheck syft taplo trivy typos zizmor '

}
