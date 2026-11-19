# Bun runtime

## Contract

Own Bun runtime, package-manager, build and test mechanics. The engine owns workspace composition, member boundaries and permitted runtime dependencies; TypeScript owns language and JavaScript semantics.

## Structure

Runtime execution, package resolution, type checking, bundling and testing are distinct facilities. Select the installed release's applicable facility without inferring guarantees from a shared command name.

## Rules

### Runtime tooling and portable consumers

- Bun is the selected workspace runtime/tool runner on Linux, macOS and Windows. Resolve its supported host architecture/CPU and native dependency artifacts; a host installation does not establish browser or Hermes compatibility.
- Bun-native file, process, test and build APIs require that runtime. The consuming engine owns which code may use them; a successful Bun execution does not establish another host's support.
- Execution, type checking, declaration emission and bundling establish different contracts. Recent Bun releases provide integrated checking; do not claim that every execution checks types.
- If using bun check, verify the installed release's compiler semantics. Current integrated checking follows its bundled TypeScript version, does not emit declarations and can be shadowed by a package check script; preserve the workspace's deliberate checker configuration.
- Entry-based checking follows selected imports and may omit dynamic workers, computed imports or other entrypoints. Public-package checking must cover its intended source/consumer surface.
- Restore test bindings and mocks after their lifetime. Bun mock.restore does not undo mock.module overrides; isolate module-cache changes or use the existing ports.
- Bun test success alone cannot establish DOM, Hermes, Node or native-adapter behavior; the consuming engine/part owns its target-artifact evidence.
- Distinguish the built-in test runner from a package script named test; option position and dispatch matter. Verify the installed command form and selected files before running. Test-path filters can match more than one file; an explicit file path selects the intended file.
- A custom resolver or harness changes the resolution being examined. Record its configuration and limits; it does not establish ordinary workspace or installed-package resolution.
- Record runtime and build target for measurements; separate transformation/build cost, cold import and warmed runtime operations. Include listener/timer/closure retention after repeated disposal.
- Bun dependency lifecycle scripts use a trust allowlist. Omitted, empty and explicitly populated trustedDependencies have different effects; declaring a list replaces the built-in defaults. Inspect required native build steps and package source before trusting them.
- Frozen installation can still run allowed scripts for packages being installed. Trusting a package is not blanket trust in its transitive dependencies; preserve root/arch supply-chain policy.
- Verify the specific Node-compatible APIs and native addons used by a consumer. Broad compatibility is not identical behavior for every Node release, API or operating system.
- Tooling subprocesses own stdin, stdout, stderr and exit observation. Bound captured output and consume configured pipes while the child runs; process exit and complete output consumption are separate outcomes.
- Bun subprocess unref detaches lifetime accounting; it does not stop the child. Observe exited/exit status before claiming completion. spawnSync maxBuffer is a synchronous-output limit, not an automatic limit on asynchronous streams.

### Test isolation and evidence

- Distinguish shared-global serial runs, per-file isolation, process workers and concurrent tests inside one file. Bun's default serial mode shares module/global state; isolated globals do not create separate external databases, files or ports.
- Current Bun isolation modes differ: full isolation refreshes globals and modules; module isolation reuses the global and some built-in state. Choose from the actual defect boundary and installed runner contract, with explicit fixture cleanup rather than relying on runner disposal to prove the application's cleanup.
- Parallel workers multiply runtime, JIT and fixture memory; concurrent tests can overlap inside one shared global. Follow root/work's resource authority and never infer safe concurrency from an available CPU count.
- A DOM simulation covers its implemented browser subset. Keep real browser/native behavior at the selected surface library; passing isolated tests does not establish independent packaged-consumer behavior.

## Proof

Identify the facility, installed version, target and selected inputs. Verify runtime behavior separately from type/declaration checking, package resolution, bundling and host integration; the consumer owns whole-application acceptance.

## Sources

[Bun compatibility](https://bun.sh/docs/runtime/nodejs-compat) · [Bundler targets](https://bun.sh/docs/bundler).

[Test selection](https://bun.com/docs/test) · [Runtime and script dispatch](https://bun.com/docs/runtime).

[Supported hosts](https://bun.com/docs/installation) · [Integrated checking](https://bun.sh/docs/runtime/check) · [Mock lifetime](https://bun.com/docs/test/mocks) · [Test lifecycle](https://bun.com/docs/test/lifecycle) · [Dependency lifecycle trust](https://bun.com/docs/pm/lifecycle) · [Package-specific script trust](https://bun.com/guides/install/trusted) · [Subprocess lifecycle](https://bun.com/docs/runtime/child-process).

[Bun isolation modes](https://bun.com/docs/test/parallel).

[DOM test boundary](https://bun.com/docs/test/dom).

## Routing

Read [languages](../../lang/index.md) with TypeScript selected, then return to the caller.
