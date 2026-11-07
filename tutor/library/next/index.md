# Next

Status: no `product/*/web` exists yet; this file governs the first one.

The framework of `product/<project>/web`: Next with the App Router on Bun over `engine/bun`, rendering every web role of a product from `specs/<role>`. The engine never imports Next; the surface's `app/` and `tools/` are the only files that know it.

## Use

- Two output modes derived from the spec, never from a flag: a client-only export for panels (no server, served as static files behind the edge) and a standalone server-rendered, indexable site for public roles. `build --all` builds every role.
- The engine is linked (`"engine": "link:engine"`) and compiled by Next through `transpilePackages`; Node runs Next's build and the standalone server; Bun runs everything else.
- Server-only code lives in `api/base.ts` and `specs/server.ts`: the request context from routed headers and cookies, the api client with Next's caching, `read` memoized per request. A browser file never imports them (the analyzer refuses).
- Tailwind through PostCSS; `proxy.server.ts` fronts the standalone server with the engine's security headers and the immutable rule for content-hashed files only.

## Laws

- **Specs own identity:** routes, titles, indexing, localized urls, the export or standalone choice, navigation and screens come from the compiled spec; `app/` is a thin renderer over `engine/spec` and the feature registry.
- **Caching is explicit:** every fetch names its cache mode and tags; a private read is never cached across users; `revalidate` only where data has a known freshness.
- **Session:** tokens never in web storage; a panel export has no server, so the session rides an httpOnly cookie at the gateway, and the api owns refresh.
- **Detail routes in an export:** an export refuses `:param` paths; record pages are query-bound screens with deep links and refresh intact, settled before the first record page.
- **Security:** CSP, origins and CORS per role at the edge and the gateway; no secret in the bundle; the server is the authority on permissions, a 403 is a designed state.
- **Performance:** lazy features, minimal first load, no needless renders, virtualized long lists, stale-while-revalidate where honest; `build --all` weighs the first load of every page and audits what crawlers see.

## Traps

- Browser origins default to `localhost`: open panels on `http://localhost:<port>`, never `127.0.0.1`, or cookies and CORS lie.
- `link:engine` needs `bun install && bun link` in `engine/bun` first, locally, in CI and in the web image.
- Only content-hashed files (`_next/static/`, stamped assets) may be served `immutable`; a page or a manifest served immutable survives a deploy in the user's cache.
- A server component that imports a client-only member (DOM, zustand bindings) fails at build with an unhelpful message; the layer order in `stack/fragment/web` prevents it.
- The standalone output copies only traced files: an asset read at runtime by path must be listed in `outputFileTracingIncludes`.
