# Go engine

## Contract

A general-purpose Go engine for demanding production systems. Develop comprehensive reusable capabilities, precise logic and a powerful predictable DSL with the highest practical speed, safety and memory efficiency. Use idiomatic Go composition and explicit resource ownership.

## Structure

- The workspace owns module membership and the Go version; domain modules, facade, tests, benches and fuzz retain their own responsibilities.
- A domain module under `src/<domain>` is `engine/<domain>`. Put the package comment in doc.go, public type/port declarations in arch.go and implementations in concern files. The facade lives under `src/engine` as module `engine`.
- Keep modules independently importable. Current sibling resolution is directory-based through `go.work`; member manifests do not invent sibling versions or `replace` overrides.
- The workspace root is not a Go module. Member directories define applicable boundaries; tests, benches and fuzz own every _test.go, keeping shipped src test-free. Internal stage support belongs under src/internal; command entrypoints under src/cmd.
- go.work owns the toolchain version; go.mod directives repeat that approved version where required by Go, rather than selecting independent versions. Preserve clean module metadata and maintain generated sums when dependencies require them.
- Record exported surface in the existing API test; a new module joins the workspace, facade and proof targets together.

## Rules

### Demand and domain boundaries

- Name the backend consumer, observable capability, scale and recovery need before adding a domain. Verify existing Go facilities and engine paths before adding abstractions.
- Add the smallest suitable domain in the real dependency order. Keep each provider private behind its adapter, capability and error contracts.
- For a command, keep flag, process and exit behavior explicit and preserve the `--version` output. For a controller/provider, prove idempotent reconcile, retry, shutdown and unknown outcome semantics against the actual API.
- Keep dependencies directed down the domain graph. The facade is a caller convenience. Consumer-defined interfaces should express the smallest real port.
- Preserve the approved log → fault foundation when adding domains. Reuse fault.Fault and its declared contract; wrap with layer context through the language error contract without introducing another fault family.
- Record whether a domain can ship independently and which deployment platforms have proof. Verify versioned standalone consumption before changing extraction.

### Backend and dependencies

- Give backend transport one HTTP owner, explicit resource budgets and the consuming part's wire contract. Go knowledge owns standard HTTP mechanics; the selected library owns router mechanics.
- The HTTP owner exposes protocol capabilities and their evidence; runtime and library details remain in their responsible skills.
- Keep middleware, validation, auth, response, fault and egress semantics in the engine. Own context, deadlines, transport pools, server drain and upgrades at their lifecycle boundaries.
- Introduce dependencies only through the owning module. Keep the allowed import policy aligned with deliberate dependency decisions and the responsible adapter.
- Apply root architecture's dependency policy to the owning module; the selected language/library owns toolchain and upstream compatibility.

### Operational evidence

- Prove bounded goroutine, queue and connection counts. Exercise cancellation and retry with a failing upstream and account for already committed operations.
- Compare CPU, p95/p99, throughput, allocation rate, retained heap/RSS, startup and drain under equal conditions before promoting a new server or runtime setting.
- Keep concurrency limits and memory budgets compatible with deployment quotas and dependent services. Profile before tuning pools, GC or PGO.
- Grow the stage only with a domain that needs it. Real services and exact wire fakes are evidence for boundary behavior; preserve both consumer paths and shutdown where relevant.

### Independent and portable consumption

- A workspace can hide missing module requirements. Verify extracted/versioned consumers without relying on local go.work resolution before claiming independent delivery.
- Keep OS-specific service/process/filesystem integration behind its owning domain. Match Linux/macOS/Windows public contracts while recording unsupported optional adapters explicitly.
- Exercise empty/default configuration and each advertised optional integration through the actual consumer facade. Unused providers should not become mandatory startup dependencies.
- Keep production build requirements separate from race/fuzz/benchmark tooling requirements defined by Go knowledge.

## Proof

- Cover workspace membership, domain DAG, public contracts, independent consumers and versioned compatibility.
- Exercise concurrent access, cancellation, bounded queues/connections and resource recovery; distinguish supported targets.
- Transport coverage includes advertised protocols, byte/deadline limits, overload and graceful stop.
- Compare whole-service behavior under equivalent work; use appropriate static, race, memory and input-exploration methods without conflating their coverage.

## Sources

- Repository evidence lives in `engine/go/go.work`, `engine/go/src/engine/engine.go`.
- [Go release history](https://go.dev/doc/devel/release) · [Go modules and workspaces](https://go.dev/ref/mod) · [Go net/http](https://pkg.go.dev/net/http)

## Routing

For Gin or x/sync work, read the [library dispatcher](../../lib/index.md) with the relevant library selections. If no external library applies, read the [language dispatcher](../../lang/index.md) with Go selected. Follow other library context when relevant; return here for module ownership.
