# engine/go

One Go workspace (`go.work`) of modules, one per domain under `src/` (`engine/<domain>`, each a package that stands alone), one facade module `engine` (`src/engine`), and the development modules `tests`, `benches` and `fuzz` that link the engine the way a consumer does.

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
└── .golangci.yml         every linter on (`exhaustruct gomodguard wsl` deprecated and off; `gomodguard_v2` off: depguard owns imports; `whitespace wsl_v5` off: they fight the hand style; `testpackage` allows `tests benches fuzz`); depguard allows the standard library and `engine`
```

## Laws

- **Workspace** (test): one `go.work` naming every module; a domain is its own module `engine/<domain>` that imports no facade and names only the libraries it imports, so it works alone; `tests`, `benches` and `fuzz` hold every `_test.go` of the engine, so `src/` ships test-free; no `go.mod` names a sibling module, no `require` of one, no `replace`, no `v0.0.0`: the workspace resolves siblings by directory; `go mod tidy -diff` is empty in every module; the version of Go lives in `go.work` and every `go.mod` repeats it.
- **Fault:** `fault.Fault` (code, reason, message, errors); wrapped once per layer, read with `errors.Is` / `errors.As`.
- **Layers:** `log` is the floor, `fault` above it, then what this engine needs in the order it needs it; a DAG, refused by a test over `go list -deps`.
- **Cross-platform:** no code assumes one system; the gate runs on Linux; cgo off.
- **Stage:** `src/internal/stage` carries provisioning, clients, samples and the bench rig.

## Domains

`hello`, the proof verb. The first round names the rest from real need, floor first (`log fault`), then what a consumer asks for.

## Gate

`infra gate --part go`, over every module of the workspace (`go list -m -f '{{.Dir}}'`; a bare `./...` has no module at the root) = deps (golangci-lint and govulncheck at their pins, `go mod download` in each module) · check (`go mod tidy -diff` in each module, `go vet`) · lint (`golangci-lint run`) · test (`go test -race -shuffle=on -count=1`) · safety (`go test -asan` on Linux with a C compiler) · audit (`govulncheck -C <module> ./...`); `bench` (`go test -run '^$' -bench . -benchmem`) and `fuzz` (each `Fuzz*` target alone: `-fuzz '^<Target>$' -fuzztime <s>`) by name.

## How to add

- **A verb:** in its package, declared in `arch.go`, implemented in its concern file, aliased by the facade, pinned in `tests/<domain>_test.go`, fuzzed in `fuzz/<domain>_test.go` when it parses input, benched in `benches/<domain>_test.go` when hot.
- **A domain:** `src/<domain>/` as module `engine/<domain>` with `go.mod` (`module` and `go` lines only), `doc.go`, `arch.go`, a `use` line in `go.work`, its alias in the facade, its test file under `tests/`, its place in the DAG; the wall refuses anything less.
- **A provider:** an adapter behind its family's DSL with declared capabilities, a memory or log implementation for tests, the real one proven against the service or its exact wire.
- **A binary:** `src/cmd/<name>/main.go` as its own module, `--version`.

## Direction

The engine of operators, controllers, providers and CLIs; its own domains at its own pace, shipped as `gox` on every tag. The gate grows to `linux darwin windows` on `amd64 arm64`, a binary becomes a row of the release's native builds, and the release writes `require engine/<domain> vX.Y.Z` into the published facade.
