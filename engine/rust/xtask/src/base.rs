use crate::arch::{FUZZ_PROFILE, Failure, Gate, NIGHTLY, TASKS, TOOLS};
use core::fmt::{Display, Formatter, Result as FmtResult};
use std::process::{Command, Stdio};
use std::env::{args, current_dir};
use core::iter::once;

impl Display for Failure {

    #[expect(clippy::renamed_function_params, reason = "the minimum identifier length forbids `f`")]
    fn fmt ( &self, formatter: &mut Formatter<'_> ) -> FmtResult {

        match self {
            Self::Missing { tool }                      => write!(formatter, "`{tool}` is not installed; run `cargo xtask setup`"),
            Self::Command { command, code: Some(code) } => write!(formatter, "`{command}` exited with status {code}"),
            Self::Command { command, code: None }       => write!(formatter, "`{command}` was terminated by a signal"),
            Self::Spawn { command, source }             => write!(formatter, "could not start `{command}`: {source}"),
            Self::Flag { flag, value }                  => write!(formatter, "`{value}` is not a valid value for `{flag}`"),
            Self::Unknown { task }                      => write!(formatter, "unknown task `{task}`; run `cargo xtask help`"),
            Self::Root { source }                       => write!(formatter, "could not resolve the workspace root: {source}"),
        }

    }

}

impl Gate {

    pub(crate) fn run () -> Result<(), Failure> {

        let mut arguments = args().skip(1);
        let task = arguments.next().unwrap_or_else(|| "help".to_owned());
        let root = current_dir().map_err(|source| Failure::Root { source })?;
        let mut gate = Self { root, execute: false, time: "10".to_owned() };

        while let Some(flag) = arguments.next() {

            match flag.as_str() {
                "--run"  => gate.execute = true,
                "--time" => gate.time = arguments.next().filter(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())).ok_or(Failure::Flag { flag: "--time", value: String::new() })?,
                other    => return Err(Failure::Flag { flag: "task", value: other.to_owned() }),
            }

        }

        if task == "help" {

            Self::help();

            return Ok(());

        }

        let ( _, _, step ) = TASKS.iter().find(|( name, _, _ )| *name == task).ok_or(Failure::Unknown { task })?;

        step(&gate)

    }

    fn help () {

        println!("cargo xtask <task> [--run] [--time <seconds>]");

        for ( name, about, _ ) in TASKS { println!("  {name:<8} {about}"); }

    }

    pub(crate) fn gates ( &self ) -> Result<(), Failure> {

        for step in [Self::check, Self::clippy, Self::test, Self::doc, Self::audit, Self::vet, Self::udeps, Self::hack, Self::semver, Self::fuzz] { step(self)?; }

        println!("[+] every gate passed");

        Ok(())

    }

    pub(crate) fn setup ( &self ) -> Result<(), Failure> {

        self.command("rustup", &["toolchain", "install", NIGHTLY, "--profile", "minimal"], &[])?;

        for tool in TOOLS.iter().filter(|tool| self.tool(tool).is_err()) { self.install(tool)?; }

        Ok(())

    }

    fn install ( &self, tool: &str ) -> Result<(), Failure> {

        if tool == "cargo-binstall" { return self.cargo(&["install", "cargo-binstall", "--locked"]); }

        self.cargo(&["binstall", "-y", "--locked", tool])

    }

    pub(crate) fn check ( &self ) -> Result<(), Failure> {

        self.cargo(&["check", "--workspace", "--all-targets", "--all-features", "--locked"])

    }

    pub(crate) fn clippy ( &self ) -> Result<(), Failure> {

        self.cargo(&["clippy", "--workspace", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"])

    }

    pub(crate) fn test ( &self ) -> Result<(), Failure> {

        self.tool("cargo-nextest")?;
        self.cargo(&["nextest", "run", "--workspace", "--all-features", "--locked"])?;
        self.cargo(&["test", "--doc", "--workspace", "--all-features", "--locked"])

    }

    pub(crate) fn doc ( &self ) -> Result<(), Failure> {

        self.command("cargo", &["doc", "--workspace", "--no-deps", "--all-features", "--locked"], &[( "RUSTDOCFLAGS", "-D warnings" )])

    }

    pub(crate) fn audit ( &self ) -> Result<(), Failure> {

        self.tool("cargo-deny")?;
        self.cargo(&["deny", "--all-features", "check"])

    }

    pub(crate) fn vet ( &self ) -> Result<(), Failure> {

        self.tool("cargo-vet")?;
        self.cargo(&["vet", "--locked"])

    }

    pub(crate) fn udeps ( &self ) -> Result<(), Failure> {

        let toolchain = format!("+{NIGHTLY}");

        self.tool("cargo-udeps")?;
        self.cargo(&[toolchain.as_str(), "udeps", "--workspace", "--all-targets", "--all-features"])

    }

    pub(crate) fn hack ( &self ) -> Result<(), Failure> {

        self.tool("cargo-hack")?;
        self.cargo(&["hack", "check", "--workspace", "--feature-powerset", "--locked"])

    }

    pub(crate) fn semver ( &self ) -> Result<(), Failure> {

        self.tool("cargo-semver-checks")?;

        let Some(tag) = self.baseline()? else {

            println!("[*] semver: no earlier release tag; skipped");

            return Ok(());

        };

        self.cargo(&["semver-checks", "check-release", "--workspace", "--baseline-rev", &tag])

    }

    pub(crate) fn fuzz ( &self ) -> Result<(), Failure> {

        let toolchain = format!("+{NIGHTLY}");
        let time = format!("-max_total_time={}", self.time);

        self.tool("cargo-fuzz")?;

        let host = self.host()?;

        self.command("cargo", &[toolchain.as_str(), "fuzz", "build", "--target", &host], FUZZ_PROFILE)?;

        if !self.execute { return Ok(()); }

        for target in self.targets(&toolchain)? { self.command("cargo", &[toolchain.as_str(), "fuzz", "run", "--target", &host, &target, "--", &time], FUZZ_PROFILE)?; }

        Ok(())

    }

    pub(crate) fn bench ( &self ) -> Result<(), Failure> {

        if self.execute { return self.cargo(&["bench", "--workspace", "--locked"]); }

        self.cargo(&["bench", "--workspace", "--locked", "--no-run"])

    }

    pub(crate) fn doctor ( &self ) -> Result<(), Failure> {

        let toolchain = format!("+{NIGHTLY}");

        self.command("rustc", &["--version"], &[])?;
        self.cargo(&["--version"])?;
        self.cargo(&[toolchain.as_str(), "--version"])?;

        for tool in TOOLS {

            match self.tool(tool) {
                Ok(())       => println!("[+] {tool}"),
                Err(failure) => println!("[!] {failure}"),
            }

        }

        Ok(())

    }

    fn baseline ( &self ) -> Result<Option<String>, Failure> {

        let output = Command::new("git")
            .args(["describe", "--tags", "--abbrev=0", "--match", "v*"])
            .current_dir(&self.root)
            .stderr(Stdio::null())
            .output()
            .map_err(|source| Failure::Spawn { command: "git describe".to_owned(), source })?;

        if !output.status.success() { return Ok(None); }

        Ok(Some(String::from_utf8_lossy(&output.stdout).trim().to_owned()).filter(|tag| !tag.is_empty()))

    }

    fn host ( &self ) -> Result<String, Failure> {

        let output = Command::new("rustc")
            .args(["-vV"])
            .current_dir(&self.root)
            .output()
            .map_err(|source| Failure::Spawn { command: "rustc -vV".to_owned(), source })?;

        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| line.strip_prefix("host: "))
            .map(str::to_owned)
            .ok_or_else(|| Failure::Command { command: "rustc -vV".to_owned(), code: output.status.code() })

    }

    fn targets ( &self, toolchain: &str ) -> Result<Vec<String>, Failure> {

        let output = Command::new("cargo")
            .args([toolchain, "fuzz", "list"])
            .current_dir(&self.root)
            .output()
            .map_err(|source| Failure::Spawn { command: "cargo fuzz list".to_owned(), source })?;

        output.status.success().then_some(()).ok_or_else(|| Failure::Command { command: "cargo fuzz list".to_owned(), code: output.status.code() })?;

        Ok(String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(str::to_owned).collect())

    }

    fn tool ( &self, name: &'static str ) -> Result<(), Failure> {

        let subcommand = name.trim_start_matches("cargo-");
        let flag = if name == "cargo-binstall" { "-V" } else { "--version" };

        let found = Command::new("cargo")
            .args([subcommand, flag])
            .current_dir(&self.root)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success());

        found.then_some(()).ok_or(Failure::Missing { tool: name })

    }

    fn cargo ( &self, arguments: &[&str] ) -> Result<(), Failure> {

        self.command("cargo", arguments, &[])

    }

    fn command ( &self, program: &str, arguments: &[&str], environment: &[( &str, &str )] ) -> Result<(), Failure> {

        let command = once(program).chain(arguments.iter().copied()).collect::<Vec<_>>().join(" ");

        println!("[*] {command}");

        let status = Command::new(program)
            .args(arguments)
            .envs(environment.iter().copied())
            .current_dir(&self.root)
            .status()
            .map_err(|source| Failure::Spawn { command: command.clone(), source })?;

        status.success().then_some(()).ok_or_else(|| Failure::Command { command, code: status.code() })

    }

}
