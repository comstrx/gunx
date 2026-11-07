# engine/go

The cloud-native engine, built for the future beside Rust: one Go workspace (`go.work`) of modules, one per domain under `src/` (`engine/<domain>`, each a package that stands alone), one facade module `engine` (`src/engine`), and the development modules `tests`, `benches` and `fuzz` that link the engine the way a consumer does. Its tool is `gox`; it owes no other engine its domains. Written in `language/go`. Gate: the commands under **Gates**.

## Layout

```
engine/go/
├── go.work  go.work.sum  the workspace: the one Go version, `use` of every module below, the one workspace sum
├── src/engine/           module `engine`, the facade: doc.go, engine.go (aliases and constructors); its go.mod names no sibling (the workspace resolves them)
├── src/<domain>/         module `engine/<domain>`, one package: doc.go, arch.go (types, interfaces, errors), <concern>.go, go.mod naming only the libraries it imports; no test file
├── src/internal/         what no consumer imports: stage, testkit, generated code (a module when it exists)
├── src/cmd/<name>/       binaries: main.go only (a module each)
├── tests/                module `tests`: one <domain>_test.go per domain plus engine_test.go and api_test.go (the recorded exported names of every package), package tests
├── benches/              module `benches`: one <domain>_test.go per domain holding Benchmark* only, package benches
├── fuzz/                 module `fuzz`: one <domain>_test.go per domain holding Fuzz* only, package fuzz
└── .golangci.yml         every linter on, no formatter (`exhaustruct gomodguard wsl` deprecated and off; `gomodguard_v2` off: depguard owns imports; `whitespace wsl_v5` off: they fight the hand style; `testpackage` allows `tests benches fuzz`); depguard allows the standard library and `engine`
```

## Laws

- **Workspace law** (test): one `go.work` naming every module; a domain is its own module `engine/<domain>` that imports no facade and names only the libraries it imports, so it works alone; `tests`, `benches` and `fuzz` hold every `_test.go` of the engine, so `src/` ships test-free; no `go.mod` names a sibling module, no `require` of one, no `replace`, no `v0.0.0`: the workspace resolves siblings by directory, and the release kit writes `require engine/<domain> vX.Y.Z` into the published facade (a path dependency becomes a tag reference, as in every engine); `go mod tidy -diff` is empty in every module; the version of Go lives in `go.work` and is copied into each `go.mod` by the gate (`go mod edit -go`), never by hand.
- **Final wrapper:** no dependency type crosses a domain's exported API; the engine owns its `Client Pool Job Request Response …`. Hiding a library means owning its semantics, errors and options.
- **Product-free:** no business, product, tenant, role, endpoint, brand or UI word in sources or tests; a test asks "would this survive deleting every product?".
- **Faults:** `fault.Fault` (code, reason, message, errors) over a closed code set; reasons unique across the engine; wrapped once per layer, read with `errors.Is` / `errors.As`.
- **Layers:** `log` is the floor, `fault` above it, then what this engine needs in the order it needs it; a DAG, refused by a test over `go list -deps`. The ladder is this engine's own; a domain from another engine arrives by decision, when a Go consumer needs it, never as an obligation.
- **Adapter law:** one DSL per family with an adapter per provider chosen in code; declared capabilities; an unsupported capability is a `Fault` before any I/O; a memory or log implementation for tests, the real one proven against the service or its exact wire; no configuration inside the engine.
- **Security law:** input validated at the boundary, secrets redacted in every log, paths confined, SSRF-safe egress, timeouts on every I/O, bounded readers on every body.
- **Cross-platform:** `linux darwin windows` on `amd64 arm64` build, vet and test in CI; cgo off.
- **Stage law:** `src/internal/stage` carries provisioning, clients, samples and the bench rig, so tests and benches need no product.

## Domains

`hello`, the proof verb. The first round names the rest from real need, floor first (`log fault`), then what a consumer asks for.

## Gates

From the workspace root, over every module (`go list -m -f '{{.Dir}}/...'`; a bare `./...` has no module at the root): `go mod edit -go=<go.work's>` then `go mod tidy -diff` in each module · `go vet` · `golangci-lint run` · `go test -race -shuffle=on -count=1`; `govulncheck -C <module> ./...` per module. Fuzz: `go test -run='^$' -fuzz=Fuzz<Verb> -fuzztime=<s> ./fuzz`. Benches on demand: `go test -run='^$' -bench=. -benchmem ./benches/...`.

## How to add

- **A verb:** in its package, declared in `arch.go`, implemented in its concern file, aliased by the facade, pinned in `tests/<domain>_test.go`, fuzzed in `fuzz/<domain>_test.go` when it parses input, benched in `benches/<domain>_test.go` when hot.
- **A domain:** `src/<domain>/` as module `engine/<domain>` with `go.mod` (`module` and `go` lines only), `doc.go`, `arch.go`, a `use` line in `go.work`, its alias in the facade, its test file under `tests/`, its place in the DAG; the wall refuses anything less.
- **A provider:** an adapter behind its family's DSL with declared capabilities, a memory or log implementation for tests, the real one proven against the service or its exact wire.
- **A binary:** `src/cmd/<name>/main.go`, `--version`, a row in the release's native builds.

## Direction

The engine of operators, controllers, providers and CLIs; its own domains at its own pace, shipped as `gox` on every tag.
