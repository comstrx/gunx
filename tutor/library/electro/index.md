# Electrobun

Status: no `product/*/desktop` exists yet; this file governs the first one.

The runtime of `product/<project>/desktop`: Electrobun, installed through Hutch, carrying the web's page inside a native window with one typed native layer. The engine never imports it; `native/` is the only folder that knows it, and it is replaceable as one folder.

## Use

- `native/` is its own workspace: `src/{contract, view, plugin, host, index}`, `tools/`, `tests/`, `benches/`, `types/`, its own manifests and lockfile. `bun run native prepare` installs the pinned toolchain and projects the SDK into an ignored devkit folder; `dev` rebuilds and relaunches on change; `app` builds the installer and the update archive per role; `gate` runs its tests.
- The page is built by Bun's bundler and PostCSS into `dist/<role>/` with `index.html`, `client.json`, `host.json` and `theme.css`; `dist/current` points at the last build; `app [--all] [--env=dev|canary|stable]` builds the page then the runtime.
- The contract between the page and the runtime is four names and two folders: `@native/contract`, `@native/view`, `@native/plugin`, the scripts `prepare dev app gate`, and the `dist` layout above.

## Laws

- **One bridge:** the page reaches the operating system only through `native/bridge.ts`, a typed DSL (`host.window host.shell host.clipboard host.dialog host.notify host.on`) over `@native/contract` and `@native/view`; a hook or feature never calls the runtime.
- **Complete map:** the host's handlers are a complete map over the contract's request names, so a request without a handler fails `tsc`; every handler has a test over a mocked SDK.
- **Honest outside a window:** in a browser or a test `host.ready` is false, `host.info()` is null, every verb refuses with one typed failure; the page renders without a host.
- **Isolation:** no node integration in the view; the page talks RPC only; file and shell verbs validate paths and arguments in the host, never trust the page.
- **Release:** installers and update archives are built on the release tag, attested with provenance, listed in `SHA256SUMS`; the update channel is `env`, never a flag in the page.
- **Another runtime** is a rewrite of `native/` with the same names, scripts and `dist` contract; the desktop root stays untouched.

## Traps

- The SDK is not on npm: `prepare` projects it; the devkit's own sources do not pass the strict wall, so the desktop types them itself in `types/electrobun.d.ts`.
- `electrobun/view` resolves through `@native/plugin` in the page bundle; a direct import breaks the browser build.
- Under WSL the app renders in software (EGL warnings, `GLXBadWindow`) and still opens; a performance number from WSL is not a number.
- Numbers for Windows and macOS come from real machines, never claimed.
