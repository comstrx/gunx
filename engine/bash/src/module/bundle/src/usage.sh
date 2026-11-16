module:bundle:usage:global --root DIR 'Read the manifest and the env files from DIR instead of the current directory' || return
module:bundle:usage:global -e KEY=VALUE 'Override one setting for this run; repeatable' || return
module:bundle:usage:add hello module:bundle:hello 'hello' 'Say hello world through every layer of the engine' || return
module:bundle:usage:add install module:bundle:install 'install [--alias NAME] [--into DIR]' 'Build the release bundle and install it as a command on this machine' || return
module:bundle:usage:flag install '--alias NAME' 'The command name to install, the tool name by default' || return
module:bundle:usage:flag install '--into DIR' 'The folder that receives the command, XDG_BIN_HOME or ~/.local/bin by default' || return
module:bundle:usage:add checksum module:bundle:build:checksum 'checksum' 'Print the SHA-256 of the release bundle' || return
module:bundle:usage:add fetch module:bundle:fetch 'fetch [NAME...]' 'Download the checksum-pinned tools (all by default) into the build tools' || return
module:bundle:usage:add self module:bundle:self 'self VERB [ARGS]' 'The engine builds and proves itself: build check lint test bench fuzz audit' || return
module:bundle:usage:flag self '--dev' 'build: the development bundle with the tests embedded' || return
module:bundle:usage:flag self '--check' 'test: run the check before the tests' || return
module:bundle:usage:flag self '--list' 'test: list the test names without running them' || return
module:bundle:usage:flag self '--shuffle' 'test: run the tests in a random order' || return
module:bundle:usage:flag self '--fast' 'test: stop at the first failure' || return
module:bundle:usage:flag self '--save' 'bench: write the p50 of every bench as the baseline' || return
module:bundle:usage:flag self '--compare' 'bench: fail when a bench is slower than its baseline by BENCH_TOLERANCE' || return
module:bundle:usage:add help module:bundle:help:show 'help [COMMAND]' 'Show every command, or one command with its flags' || return
module:bundle:usage:add version module:bundle:view:version 'version' 'Print the tool, its version and the build' || return
module:bundle:usage:add config module:bundle:view:config 'config [KEY] [--changed]' 'Print one resolved setting, or every setting with its source, secrets redacted' || return
module:bundle:usage:flag config '--changed' 'List only the settings whose value differs from the default' || return
module:bundle:usage:add meta module:bundle:view:meta 'meta' 'Print the identity: name, version, description, license, readme, authors' || return
module:bundle:usage:add system module:bundle:view:system 'system' 'Print the machine: os, runtime, distro, package manager, cores, memory, ci' || return
