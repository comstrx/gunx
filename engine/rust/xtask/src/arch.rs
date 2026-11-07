use std::io::Error as IoError;
use std::path::PathBuf;

pub(crate) type Step  = fn(&Gate) -> Result<(), Failure>;
pub(crate) type Entry = ( &'static str, &'static str, Step );

pub(crate) const NIGHTLY: &str = "nightly-2026-10-08";

pub(crate) const FUZZ_PROFILE: &[( &str, &str )] = &[( "CARGO_PROFILE_RELEASE_LTO", "off" ), ( "CARGO_PROFILE_RELEASE_CODEGEN_UNITS", "16" )];

pub(crate) const TASKS: &[Entry] = &[
    ( "gates",  "every gate in order; what CI runs",                                          Gate::gates ),
    ( "setup",  "install the nightly toolchain and every missing gate tool",                  Gate::setup ),
    ( "check",  "compile every crate and target",                                             Gate::check ),
    ( "clippy", "the lint wall, warnings denied",                                             Gate::clippy ),
    ( "test",   "the declared test targets under nextest, then the doc tests",                Gate::test ),
    ( "doc",    "rustdoc with warnings denied",                                               Gate::doc ),
    ( "audit",  "cargo deny: advisories, bans, licenses, sources",                            Gate::audit ),
    ( "vet",    "cargo vet against supply-chain/",                                            Gate::vet ),
    ( "udeps",  "unused dependencies on nightly",                                             Gate::udeps ),
    ( "hack",   "the feature powerset compiles",                                              Gate::hack ),
    ( "semver", "every public API against the newest earlier release tag (v*)",               Gate::semver ),
    ( "fuzz",   "the libFuzzer targets build on nightly; --run fuzzes each for --time seconds", Gate::fuzz ),
    ( "bench",  "the criterion targets build; --run measures and prints",                      Gate::bench ),
    ( "doctor", "which toolchains and tools are present",                                     Gate::doctor ),
];

pub(crate) const TOOLS: &[&str] = &[
    "cargo-binstall",
    "cargo-nextest",
    "cargo-deny",
    "cargo-vet",
    "cargo-udeps",
    "cargo-hack",
    "cargo-semver-checks",
    "cargo-fuzz",
];

#[derive(Debug)]
pub(crate) enum Failure {
    Missing { tool: &'static str },
    Command { command: String, code: Option<i32> },
    Spawn { command: String, source: IoError },
    Flag { flag: &'static str, value: String },
    Unknown { task: String },
    Root { source: IoError },
}

#[derive(Debug)]
pub(crate) struct Gate {
    pub(crate) root:    PathBuf,
    pub(crate) execute: bool,
    pub(crate) time:    String,
}
