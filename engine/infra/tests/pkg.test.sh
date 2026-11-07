test:core:pkg:plans-every-manager () {

    local manager=""

    for manager in "${PKG_MANAGERS[@]}"; do
        @contains "$(core:pkg:plan "${manager}" install curl | tr '\n' ' ')" 'curl'
        @contains "$(core:pkg:plan "${manager}" refresh | tr '\n' ' ')" "${manager%apt}"
        [[ -n "$(core:pkg:plan "${manager}" has curl)" ]]
    done

    @eq "$(core:pkg:plan apt install curl xz-utils | tr '\n' ' ')" 'apt-get install -y --no-install-recommends curl xz-utils '
    @eq "$(core:pkg:plan nix install curl | tr '\n' ' ')" 'nix profile install nixpkgs#curl '
    @errors 'Unknown package manager' core:pkg:plan snap install curl
    @eq "$(PKG_MANAGER=brew core:pkg:manager)" brew
    core:pkg:known apt
    @fails core:pkg:known snap
    core:pkg:elevated apt
    @fails core:pkg:elevated brew

}
test:core:pkg:finds-this-machine () {

    local manager=""

    manager="$(core:pkg:manager)" || return 0
    core:pkg:known "${manager}"

}
test:config:packages:maps-the-runtime () {

    @eq "$(config:packages:name apt xz)" xz-utils
    @eq "$(config:packages:name apt curl)" curl
    @contains "$(config:packages:runtime | tr '\n' ' ')" 'curl tar xz gzip git'
    @eq "$(PATH=/nonexistent config:packages:missing apt | tr '\n' ' ')" 'bash curl tar xz-utils gzip git '

}
