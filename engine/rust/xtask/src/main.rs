//! The gate runner: `cargo xtask <task> [--run] [--time <seconds>]`.

#![expect(clippy::print_stdout, clippy::print_stderr, clippy::disallowed_macros, reason = "the runner reports to its operator on stdout and stderr")]

mod arch;
mod base;

use std::process::ExitCode;
use crate::arch::Gate;

fn main () -> ExitCode {

    match Gate::run() {
        Ok(())       => ExitCode::SUCCESS,
        Err(failure) => {

            eprintln!("[-] {failure}");

            ExitCode::FAILURE

        }
    }

}
