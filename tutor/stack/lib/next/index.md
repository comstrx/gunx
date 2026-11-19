# Next

## Contract

Own Next rendering, routing, caching and build behavior. The consuming part chooses its application composition; spec integration belongs to that part and its engine.

## Structure

The consuming application owns its route tree and configuration. Use supported runtime/build modes and resolve linked packages in the actual consumer graph.

## Rules

### Rendering and data

- Select static export or a server deployment from the application contract. Static export has no request-time server; request-dependent handlers and server-only runtime secrets cannot operate in that output.
- Static export can render Server Components at build time and emit HTML plus navigation payloads. It is not synonymous with client-only rendering or absent SEO; distinguish build-time content from request-time capabilities.
- Parenthesized route groups apply to the Next app route tree: they omit a URL segment, not collisions. Separate groups cannot resolve to the same URL, and crossing different root layouts causes a full page load. A custom specs directory needs its own loader contract.
- Resolve linked engine sources from their actual installed path; transpile facade and members and set the shared Turbopack and tracing roots. Verify one React instance and runtime assets.
- Server Components can access privileged sources, but props passed to Client Components are exposed. Keep server-only imports out of the client graph and return minimal authorized DTOs.
- Validate route, query and action input. Server Functions can receive direct POST requests: authenticate and authorize every operation at its data owner. Render is a read; mutations, cookie writes and invalidation are explicit operations.

### Cache, security and performance

- Define cache key, tenant/user scope, freshness and invalidation for each value. Request memoization, data cache, generated output, CDN and browser cache have different lifetimes; invalidating one does not establish freshness of all.
- Only content-hashed assets receive immutable headers. Derive CSP and CORS from the actual application/origin contract; don't add unsafe-eval, broad origins or public secrets merely to pass a build.
- Measure first-load JS and network waterfalls on built application entries. Lazy-load where useful, parallelize independent safe reads and virtualize genuinely long lists, preserving loading and error states.
- Verify exported-route refresh, locale, title, metadata and navigation. Separately inspect standalone tracing, server behavior and production headers. Check official stable release, support and security advisories before changing a pin.

### Request boundaries

- Check framework security advisories for the installed release, not only the major support window. An official latest-docs patch may differ from the locked patch.
- Closure encryption and unguessable Server Function identifiers do not replace the operation authorization required above.
- Review trusted host/proxy origin handling, CSRF boundaries and cache identity together during self-hosting; do not disable origin checks to fix a proxy mismatch.
- Keep request-specific values out of shared module state and shared cache entries. Verify logout, membership changes and concurrent tenants across deployment instances.

### Build, run and test modes

- Development serving, production compilation, serving the production output and static hosting are different modes. Select the mode from the surface's actual deployment contract.
- Build from the resolved workspace graph; inspect required traced files, static assets and runtime configuration in the artifact. A monorepo development import may conceal a missing standalone dependency.
- Direct NEXT_PUBLIC_ references are inlined at build time. Promoting that artifact with different process environment values does not rewrite its client configuration; choose a new build or an explicit public runtime-config boundary. Neither mechanism may expose server secrets.
- Linux, macOS and Windows are development hosts. Resolve the pinned Node/native dependency requirements on each; an installed native package from one host is not a portable dependency directory.
- Test the built output for performance and deployment behavior. Development compilation, hot reload and diagnostics distort startup and request costs.
- Component tests cover isolated behavior; async Server Components and request/render/cache integration may require the framework's real server and browser path. A DOM mock cannot establish those boundaries.
- Compare cold render, cache hit/miss, revalidation and concurrent identity changes separately. Client rendering, server time, network waterfalls and full user interaction latency are different measurements.
- Verify export-only features against static-export support. For a multi-instance server, exercise the configured cache/invalidation and rolling-deployment behavior rather than assuming a single-process result generalizes.

### Cache operation semantics

- Select the caching model supported by the installed release and configuration. Cache Components and use-cache directives are explicit model choices, not assumptions derived from old fetch examples.
- Match invalidation to the product's freshness requirement. In supported releases, revalidateTag with the max profile marks data stale for stale-while-revalidate; updateTag provides immediate expiration for read-your-own-writes from Server Actions.
- Neither operation establishes authorization or a database commit. Commit the business change through its owner, then invalidate the relevant cache identity; account for failure between those steps.
- Framework render/data caches and engine capability caches have different owners. Define their keys, lifetime and invalidation relationship without maintaining a second source of business truth.

### Image service cost

- The image optimizer fetches and processes input at runtime; static export needs a compatible external/custom loader or unoptimized assets. Budget native CPU/memory and cache growth separately from component rendering.
- Constrain permitted remote image sources and parameters through the installed release's configuration. Remote-pattern permission is not proof that every redirect, local destination or decoded image is safe; inspect those controls and preserve the owning egress contract.

### Multi-instance deployment

- Shared cached values and shared invalidation are separate requirements. For multiple App Router instances, implement the selected cache-handler contract for tag propagation; invalidation on one process must not be assumed visible everywhere.
- Keep deployment/build identity, build-time Server Function keys where used, and immutable asset availability coherent across a rollout. Keep keys in deployment secrets; they do not replace authorization. Version-skew handling can reload a client and lose local state; it does not migrate product state or authorize an incompatible API transition.
- Verify streaming through the real ingress. Proxy buffering can turn a progressively rendered response into one delayed delivery; an application-local streamed result does not establish the user-visible benefit.
- Bound cache-handler latency and handle backing-store failure according to the cache contract. Do not turn a shared cache dependency into an unbounded wait on every request.

## Proof

Cover affected application entries, rendering and cache boundaries, authorization, navigation and runtime configuration. Distinguish browser behavior, server behavior and static-export limitations; choose suitable methods for the assigned work.

## Sources

[Data security](https://nextjs.org/docs/app/guides/data-security) · [Mutations](https://nextjs.org/docs/app/getting-started/mutating-data) · [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting) · [Support policy](https://nextjs.org/support-policy).

[Testing coverage](https://nextjs.org/docs/app/guides/testing) · [Production checklist](https://nextjs.org/docs/app/guides/production-checklist) · [Deployment modes](https://nextjs.org/docs/app/getting-started/deploying) · [Host requirements](https://nextjs.org/docs/app/getting-started/installation).

[Revalidation profiles](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) · [Read-your-own-writes](https://nextjs.org/docs/app/api-reference/functions/updateTag) · [Cache Components model](https://nextjs.org/docs/app/getting-started/revalidating).

[Image optimizer controls](https://nextjs.org/docs/app/api-reference/components/image) · [Self-hosted image memory](https://nextjs.org/docs/app/guides/self-hosting#image-optimization).

[Static rendering in exports](https://nextjs.org/docs/app/guides/static-exports) · [Route group semantics](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) · [Build-time public configuration](https://nextjs.org/docs/app/guides/environment-variables).

## Routing

Continue through [languages](../../lang/index.md) with TypeScript. A reading route grants no code import.
