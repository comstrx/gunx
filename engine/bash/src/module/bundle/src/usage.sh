module:bundle:usage:global --root DIR 'The project root instead of the git root of the working directory' || return
module:bundle:usage:global --config FILE 'Merge FILE over the manifest instead of the bash.toml or infra.toml of the root' || return
module:bundle:usage:global --no-config '' 'Merge no bash.toml or infra.toml of the root over the manifest' || return
module:bundle:usage:global -e KEY=VALUE 'Override one setting for this run; repeatable' || return
module:bundle:usage:add hello module:bundle:hello 'hello' 'Say hello world through every layer of the engine' || return
module:bundle:usage:add checksum module:bundle:build:checksum 'checksum' 'Print the SHA-256 of the release bundle' || return
module:bundle:usage:add fetch module:bundle:fetch 'fetch [NAME...]' 'Download the checksum-pinned tools (all by default) into the build tools' || return
module:bundle:usage:add self module:bundle:self 'self VERB [ARGS]' 'The engine itself: build check lint test bench fuzz audit install update remove' || return
module:bundle:usage:flag self '--dev' 'build install update: the development bundle with the tests embedded' || return
module:bundle:usage:flag self '--release' 'build install update: the release bundle; this is the default' || return
module:bundle:usage:flag self '--alias NAME' 'build install update: the name: this, else [meta] alias, else the name' || return
module:bundle:usage:flag self '--into DIR' 'install update: the folder of the command, [meta] install by default' || return
module:bundle:usage:flag self '--src DIR' 'build: the source folder the build remembers, its own folder by default' || return
module:bundle:usage:flag self '--repo URL' 'build: the repository the build remembers, [meta] repo by default' || return
module:bundle:usage:flag self '--yes' 'install update: replace a command of the same name without asking' || return
module:bundle:usage:flag self '--check' 'test: run the check before the tests' || return
module:bundle:usage:flag self '--list' 'test: list the test names without running them' || return
module:bundle:usage:flag self '--shuffle' 'test: run the tests in a random order' || return
module:bundle:usage:flag self '--fast' 'test: stop at the first failure' || return
module:bundle:usage:flag self '--save' 'bench: write the p50 of every bench as the baseline' || return
module:bundle:usage:flag self '--compare' 'bench: fail when a bench is slower than its baseline by BENCH_TOLERANCE' || return
module:bundle:usage:flag self '--out FILE' 'bench: write the JSON report to FILE instead of the lab' || return
module:bundle:usage:flag self '--count N' 'fuzz: N runs of every target instead of, or within, the seconds' || return
module:bundle:usage:add help module:bundle:help:show 'help [COMMAND]' 'Show every command, or one command with its flags' || return
module:bundle:usage:add version module:bundle:view:version 'version' 'Print the tool, its version and the build' || return
module:bundle:usage:add config module:bundle:view:config 'config [KEY] [--changed]' 'Print one resolved setting, or every setting with its source, secrets redacted' || return
module:bundle:usage:flag config '--changed' 'List only the settings whose value differs from the default' || return
module:bundle:usage:add meta module:bundle:view:meta 'meta' 'Print the identity: name, version, description, license, readme, authors' || return
module:bundle:usage:add system module:bundle:view:system 'system' 'Print the machine: os, runtime, distro, package manager, cores, memory, ci' || return
