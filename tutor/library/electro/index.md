# Electrobun

Status: Electrobun 2.0.5 through Hutch in the desktop fragment; the dev build opens its window under WSLg.

The runtime of the desktop fragment: Electrobun, installed through Hutch, carrying the web page inside a native window with one typed native layer. The engine never imports it; one folder knows it, and that folder is replaceable as a whole.

## Use

- The SDK is not a dependency: `prepare` installs the pinned Hutch and projects the SDK into an ignored devkit folder, and the CLI runs as `bunx electrobun@<pin>`; `dev` rebuilds and relaunches on change; `app` builds the installer and the update archive per role. Hutch is told to use Bun so the one lockfile stays `bun.lock`.
- RPC: `BrowserView.defineRPC<Schema>({ maxRequestTime, handlers })` on the main side, `Electroview.defineRPC` + `new Electroview({ rpc })` on the page, `rpc.request.<name>(params)` and `rpc.send.<name>(payload)` proxies; the host's handlers are a complete map over the contract's request names, so a request without a handler fails `tsc`.
- The page is bundled by Bun and PostCSS into a folder per role whose `host.json` (identity, window) the runtime reads; `electrobun.config.ts` runs with the process environment and may read files; `build.copy` copies directories.
- Window options are `title frame url rpc titleBarStyle sandbox` (no minimum size); the window starts hidden and shows on the page's `ready` mark, or after two seconds when the page never marks; a blank window is never shown.

## Laws

- **One bridge:** the page reaches the operating system only through one typed DSL over the contract and the page-side view; a hook or feature never calls the runtime; the bridge grows one contract request at a time, each with its handler and tests.
- **Honest outside a window:** in a browser or a test `host.ready` is false, `host.info()` is null, every verb refuses with one typed failure; the page renders without a host.
- **Isolation:** no node integration in the view; the page talks RPC only; file and shell verbs validate paths and arguments in the host, never trust the page.
- **Release:** the update channel is `env`, never a flag in the page.
- **Another runtime** is a rewrite of the one folder with the same names, scripts and output contract; nothing else moves.

## Traps

- The npm package is a shim that maps every subpath to one file, which collapses `electrobun/main` and `electrobun/view` into one module and breaks the mocks; the devkit's own sources do not pass the strict wall, so the fragment types the SDK surface itself.
- The page's requests leave from the `views://` scheme: the gateway's origin allowlist names the desktop's origin, or every call is refused at the preflight.
- `electrobun/view` resolves through the fragment's bundler plugin in the page bundle; a direct import breaks the browser build.
- A request handler that returns `void` does not satisfy a `response: undefined` contract: return `void expression`.
- Under WSL the app renders in software (EGL warnings, `GLXBadWindow`) and still opens; a performance number from WSL is not a number.
- Numbers for Windows and macOS come from real machines, never claimed.
