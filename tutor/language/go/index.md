# Go

How Go is written here, in the engine and in every Go binary. The hand style is the format: no `gofmt`, no `goimports`; golangci-lint and `go vet` check rules, the hand writes the shape, the reviewer reads it.

## Toolchain

- One Go version, written once in `go.work`; `GOTOOLCHAIN=local` in CI so the written toolchain is the one that runs; every `go.sum` and `go.work.sum` committed.
- golangci-lint with every linter on and exclusions by rule with a reason; `go vet`; `govulncheck`; `go mod tidy -diff` and `go mod verify` as gates. `//nolint:<linter> // reason` is the only knob.
- cgo off by default; on only for a proven need, behind a build tag, with a pure fallback.

## Hand style

```go
package cache

type Cache struct {
	store Store
	ttl   time.Duration
}

func New ( store Store, ttl time.Duration ) *Cache {

	return &Cache{store: store, ttl: ttl}

}

func (c *Cache) Remember ( ctx context.Context, key string, load Loader ) ( []byte, error ) {

	found, ok, err := c.store.Get(ctx, key)

	if err != nil { return nil, fault.Wrap(err, fault.Unavailable, "cache.get") }

	if ok { return found, nil }

	value, err := load(ctx)

	if err != nil { return nil, err }

	if err := c.store.Set(ctx, key, value, c.ttl); err != nil {

		return nil, fault.Wrap(err, fault.Unavailable, "cache.set")

	}

	return value, nil

}
```

- Tabs for indentation (the one shape Go tooling and `.editorconfig` agree on), braces on the opening line, one blank line after a function opens and before it closes, blank lines between steps, never between statements of one step; early return, no `else` after a return. Columns 120. An editor that reformats on save is turned off for this tree.
- `ctx context.Context` first on every function that does I/O or may wait; every I/O carries a deadline from it.
- Errors are values: returned, never panicked outside `main`; wrapped once per layer (`%w`), checked with `errors.Is` / `errors.As`; one fault package per engine, codes closed.
- No `init()`, no package-level mutable state, no global logger or client; everything reaches a function through its arguments or its receiver.
- Interfaces belong to the consumer and stay small (three methods or fewer); accept interfaces, return structs; constructors are `New` and return `*T`; no getters and setters.
- Names: the package is the noun (`cache.New`, never `cache.NewCache`); short names in short scopes; no `util`, `common`, `helpers`, `base` packages.
- Generics only for a real type set; a concrete type first, a parameter when the second use arrives.
- Files: `doc.go` (the package comment), `arch.go` (types, interfaces, errors), `<concern>.go` per concern; one package per folder; `internal/` for what no consumer may import; no `_test.go` beside the code.
- Comments: `// Name …` on every exported identifier, full sentences; nothing else unless an invariant needs a line.
- Binaries: `cmd/<name>/main.go` with a `run(ctx, args, stdout, stderr) error` body and `main` that exits loud; every binary answers `--version` with `<bin> <version>` and exposes no library surface.

## Concurrency and memory

- Every goroutine has an owner and an exit: `errgroup` with `SetLimit` or a bounded worker set under one `context`; no fire-and-forget; channel sizes are decisions with a reason.
- `http.Server` and every client carry read, write and idle timeouts; no `time.Sleep` as synchronization.
- Allocation is a decision after a bench: preallocated slices, `sync.Pool`, `strings.Builder`, `bytes.Buffer` reuse; `-race` in every test run.

## Tests and benches

- Tests, fuzz targets and benchmarks live in their own modules, never beside the code; table-driven, `t.Parallel()`, `t.Context()`; `go test -race -shuffle=on -count=1`.
- Benches are `Benchmark*` with `b.ReportAllocs()` and `b.Loop()`.
- A law is a test: the package DAG (`go list -deps`), the facade's export list, no `init`, every exported identifier with a caller or a contract test, every binary answering `--version`.
