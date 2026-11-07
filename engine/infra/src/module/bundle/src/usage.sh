module:bundle:usage:add hello module:bundle:hello 'hello' 'Say hello world through every layer of the engine' || return
module:bundle:usage:add build module:bundle:build:pick 'build [--dev]' 'Build the release bundle and its SHA256SUMS; --dev builds the test bundle' || return
module:bundle:usage:flag build '--dev' 'Build the development bundle with the tests embedded' || return
module:bundle:usage:add install module:bundle:install 'install [--alias NAME] [--into DIR]' 'Build the release bundle and install it as a command on this machine' || return
module:bundle:usage:flag install '--alias NAME' 'The command name to install, the tool name by default' || return
module:bundle:usage:flag install '--into DIR' 'The folder that receives the command, XDG_BIN_HOME or ~/.local/bin by default' || return
module:bundle:usage:add checksum module:bundle:build:checksum 'checksum' 'Print the SHA-256 of the release bundle' || return
module:bundle:usage:add fetch module:bundle:fetch 'fetch [NAME...]' 'Download the checksum-pinned tools (all by default) into the build tools' || return
module:bundle:usage:add check module:bundle:check 'check' 'Build the dev bundle, then run syntax, ShellCheck and the laws' || return
module:bundle:usage:add test module:bundle:test:run 'test [FILTER] [--list] [--shuffle]' 'Build the dev bundle, then run every test in an isolated process' || return
module:bundle:usage:flag test '--check' 'Run the check gate before the tests' || return
module:bundle:usage:flag test '--list' 'List the test names without running them' || return
module:bundle:usage:flag test '--shuffle' 'Run the tests in a random order' || return
module:bundle:usage:flag test '--fast' 'Stop at the first failure' || return
module:bundle:usage:add bench module:bundle:bench:run 'bench [FILTER] [--save] [--compare]' 'Build the dev bundle, run every bench; keep or judge a baseline' || return
module:bundle:usage:flag bench '--save' 'Write the p50 of every bench as the baseline under the build folder' || return
module:bundle:usage:flag bench '--compare' 'Fail when a bench is slower than its baseline by more than BENCH_TOLERANCE' || return
module:bundle:usage:add fuzz module:bundle:fuzz:run 'fuzz [SECONDS]' 'Feed random input to every fuzz target for SECONDS each; a crash is saved' || return
module:bundle:usage:add audit module:bundle:audit:run 'audit' 'Verify the pins, the digests, the env schema and the sources' || return
module:bundle:usage:add help module:bundle:help:show 'help [COMMAND]' 'Show every command, or one command with its flags' || return
module:bundle:usage:add version module:bundle:view:version 'version' 'Print the tool, its version and the build' || return
module:bundle:usage:add config module:bundle:view:config 'config [KEY] [--changed]' 'Print one resolved setting, or every setting with its source, secrets redacted' || return
module:bundle:usage:flag config '--changed' 'List only the settings whose value differs from the default' || return
module:bundle:usage:add meta module:bundle:view:meta 'meta' 'Print the identity: name, version, description, license, readme, authors' || return
module:bundle:usage:add system module:bundle:view:system 'system' 'Print the machine: os, runtime, distro, package manager, cores, memory, ci' || return
