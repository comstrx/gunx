# Next

Status: Next 16.4.5 (App Router, Turbopack) in the web fragment: a static export for panels, a standalone server for public roles.

The framework of the web fragment: Next with the App Router on Bun over the engine, rendering every web role of a product from its spec. The engine never imports Next; only the fragment's route tree and build tools know it.

## Use

- Two output modes derived from the spec, never from a flag: a client-only export for panels (no server, served as static files behind the edge) and a standalone server-rendered, indexable site for public roles. `build --all` builds every role.
- The engine is linked (`link:engine`, React and React DOM linked from the engine too) and compiled by Next through `transpilePackages` (the facade plus every member); `turbopack.root` and `outputFileTracingRoot` sit at the repository root so the linked sources resolve; Node runs Next's build and the standalone server; Bun runs everything else.
- Server-only code (the request context from routed headers and cookies, the api client with Next's caching, `read` memoized per request) lives in files a browser file never imports; the analyzer refuses the import.
- Tailwind through PostCSS; a proxy fronts the standalone server with the engine's security headers and the immutable rule for content-hashed files only.

## Laws

- **Specs own identity:** routes, titles, indexing, localized urls, the export or standalone choice, navigation and screens come from the compiled spec; the route tree is a thin renderer over the engine's spec runtime and the feature registry.
- **Caching is explicit:** every fetch names its cache mode and tags; a private read is never cached across users; `revalidate` only where data has a known freshness.
- **Session:** tokens never in web storage; a panel export has no server, so the session rides an httpOnly cookie at the gateway, and the api owns refresh.
- **Detail routes in an export:** an export refuses `:param` paths; record pages are query-bound screens with deep links and refresh intact, settled before the first record page.
- **Security:** CSP, origins and CORS per role at the edge and the gateway; no secret in the bundle; the server is the authority on permissions, a 403 is a designed state.
- **Performance:** lazy features, minimal first load, no needless renders, virtualized long lists, stale-while-revalidate where honest; `build --all` weighs the first load of every page and audits what crawlers see.

## Traps

- Browser origins default to `localhost`: open panels on `http://localhost:<port>`, never `127.0.0.1`, or cookies and CORS lie.
- `link:` needs the engine's registry first: the engine's `link` script registers `engine`, `react` and `react-dom` under its own global directory through `BUN_INSTALL_GLOBAL_DIR`, then the surface installs with the same directory; locally, in CI and in the web image.
- A linked React outside the project root: Turbopack answers "Can't resolve react/jsx-runtime" until `turbopack.root` covers the engine.
- Only content-hashed files (`_next/static/`, stamped assets) may be served `immutable`; a page or a manifest served immutable survives a deploy in the user's cache.
- A server component that imports a client-only member (DOM, store bindings) fails at build with an unhelpful message; the fragment's layer order prevents it.
- The standalone output copies only traced files: an asset read at runtime by path must be listed in `outputFileTracingIncludes`.
