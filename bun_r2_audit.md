# GunX Bun Engine — R2 Deep Independent Enterprise Audit

**Audit ID:** `GunX-Bun-R2`  
**Date:** 2026-11-14  
**Input:** `bn1.zip` SHA-256 `034c58c60df0bd8f4570f7d8ea4cdb1a27562a2991d0ee9d81ee5d7e5a249b3d`  
**Baseline:** `bun.zip` SHA-256 `b4aa9833b2b5c970e86c1c69f46fcf6a4e797bb4c9914778c8222657f1a2b5ac`  
**Scope:** exact source contents of the supplied Bun workspace (`src/`, `tests/`, `fuzz/`, `benches/`, manifests, bundled assets), compared against R1.  
**Explicit exclusions:** runtime-integrated Bun `gate`, target React/Next/Expo/Electrobun consumer builds, release artifacts, live pentests, external CI, real production load and deployment infrastructure. None was supplied/executable here.

> **INDEPENDENT VERDICT — PROGRESS PROVEN, ENTERPRISE PRODUCTION SIGN-OFF WITHHELD.** R2 fixes multiple genuine correctness issues and improves package ownership. It **does not** fix overlapping async adapter scope, introduces a proven out-of-order Presence sync error, and cannot yet demonstrate compiled runtime/release compatibility or measured performance and memory without the lockfile and Bun execution.

## 1. Executive scorecard (engineering judgement, not scientific certification)

| Dimension | R1 | R2, provisional | Reason |
|---|---:|---:|---|
| Package architecture, dependency DAG | 8.5/10 | **8.7/10** | Same disciplined 37-package graph; protocol moved from low-level `socket` into `api`; React-specific renderer removed from core state. |
| Overall architecture and code evidence | 7/10 | **7.5/10** | Five R1 findings closed in source/focused repro, but a critical shared async primitive remains wrong and new concurrency issues found. |
| Production readiness | 4.5/10 | **5.5/10** | Several blocking correctness issues improved; no complete install/check/test/device/security/load evidence and remaining P1 risk. |
| Runtime performance, cold start, RSS, throughput | Unverified | **Unverified** | No Bun release benchmarking was executable; performance cannot legitimately receive a measured score. |
| Web / mobile / desktop compatibility | Unverified | **Unverified** | This ZIP is engine-only, not consumer build evidence. |

### What was actually analyzed

| Measure | R1 | R2 |
|---|---:|---:|
| Domain packages + aggregate facade | 36 + 1 | 36 + 1 |
| Domain source `.ts` files (incl. facade re-exports) | 267 | 271 |
| Declared directed workspace dependencies | 188 | 194 |
| Workspace dependency cycles discovered | 0 | 0 |
| Unit `.test.ts` files | 76 | 79 |
| Literal `it(` test declarations, static | 706 | 750 |
| Literal `fc.assert(` assertions, static | 280 | 283 |
| Explicit `numRuns: N` sum in fuzz source | 177,637 | 183,637 |
| Benchmark files | 41 | 41 |
| Changed / added / removed files | — | **90 / 7 / 0** |
| TypeScript files parsed syntax-only for R2 | — | **431**, zero parser errors |

**Numbers are static inventory, not passed-test counts.** Syntax parsing used installed TypeScript 5.8.3 and is not a substitute for pinned TypeScript 7.0.2 type checking. R2 contains no `bun.lock` file. No `bun` binary was available in the assessment runtime, and package registry downloads were inaccessible, so **`bun install --frozen-lockfile`, `bun run check`, `bun run test`, `bun run fuzz`, `bun run audit`, benchmark suites, Metro/Next native builds were not executed**.

**Independent reproducible experiments:** Node.js 22 transpiled the exact selected TS implementations to JavaScript with minimal documented import stubs; four R1 regressions, Base64 randomized round trips (2,000), a new Presence race, plus syntax scan. This tests JavaScript semantics of the extracted implementation, **not** its behavior under Bun, browser or Hermes as a complete app.

## 2. Critical deltas and verdict

- **KEEP:** domain members with package-specific public exports, `engine` facade and subpath imports. Static import DAG remains acyclic and the declared internal dependencies match scanned imports. This is architecture evidence, not proof against dynamic cycles or capability coupling.
- **KEEP / STRONGLY APPROVE DIRECTION:** `socket` becomes transport-focused; protocol codec, connection policy and presence move into `api`; `state` separates headless state from renderer. This is proper ownership **if** consuming apps migrate.
- **FIX CONFIRMED:** `cache.box.touch` original expiry repro; limiter capacity-churn bypass repro; decoder-watcher unhandled rejection repro; raw-secret-containing crypto Map keys gone (source inspection); `fs.lines` delegates to `string.lines`.
- **PARTIAL:** Outbox now requires a lock unless `guard: "local"` explicitly opts into local-only semantics; cache bulk operations have bounded concurrency but still materialize the entire key set; proxy facts default to remote IP; coverage inventory now attempts to enforce source completeness.
- **BLOCK:** concurrent `adapter.port.with` still returns another task’s adapter when promises interleave, despite existing nested-single-task tests.
- **NEW BLOCK FOR FEATURE CORRECTNESS:** `api.presence` overwrites newer sync state with stale response when two requests complete in reverse order.
- **NOT PROVEN:** direct-dependency choices are reasonable but lack comparative production benchmarks, full licenses/SBOM and runtime performance evidence; new facades cannot be certified against Next/Expo/Electrobun from this engine ZIP alone.

## 3. Original R1 finding register — revalidation across every ID

Statuses: **5 closed with current evidence** (3 focused Node reproduction, 2 source fixes), **4 partial**, **11 open or unproven**. “Closed” is a limited finding-level closure, not a whole production sign-off.

| ID | Priority | R2 status | Delta / test evidence |
|---|---|---|---|
| `R1-ASY-001` | P1 | OPEN | port.with and bundle.with still share mutable stack across overlapping async tasks; Node repro fails |
| `R1-CACHE-001` | P1 | **FIXED—reproduced** | set({ttl:1})->touch()->get preserves original absolute expiry; same Node repro now passes |
| `R1-CRYPTO-001` | P1 | **FIXED—source** | Secret label now HMAC-pseudonymous with per-Source random CryptoKey; no raw secret strings as Map keys |
| `R1-SEC-001` | P1 | OPEN-CONDITIONAL | General auth Session persists bearer material through caller-supplied Box; secure storage/BFF policy remains a deployment obligation |
| `R1-QUEUE-001` | P1 | PARTIAL | Fail-closed if store.lock absent; explicit guard local permits process-local single-owner use, not shared multi-instance CAS |
| `R1-LIMIT-001` | P1 | **FIXED—reproduced** | Capacity churn scenario fails closed; regression Node repro passes |
| `R1-CACHE-002` | P2 | **FIXED—reproduced** | Unhandled rejection stopped in Node repro; observable error delivery now requires driver flush |
| `R1-MEM-001` | P2 | PARTIAL | list.eachAsync bounds concurrency while keys() and all() still materialize unbounded inputs |
| `R1-NET-001` | P2 | PARTIAL | facts defaults hops=0 using remote; valid only with externally verified trusted proxy count |
| `R1-NET-002` | P2 | OPEN-CONDITIONAL | URL guards do not replace egress ACL and DNS pinning for server-side arbitrary URLs |
| `R1-GATE-001` | P2 | OPEN | R2 ZIP still has no bun.lock; frozen package graph unreproducible |
| `R1-GATE-002` | P2 | PARTIAL, runtime unverified | New coverage inventory validation and tests but TypeScript 7/Bun integration not executed |
| `R1-GATE-003` | P2 | OPEN | Static facade export proof remains shape/name oriented; behavior coverage still incomplete |
| `R1-PERF-001` | P2 | OPEN | No sustained load/heap/bench performance gate; new single JSON RSS test is not a service soak |
| `R1-OWN-001` | P2 | **FIXED—source** | fs.lines now delegates to string.lines |
| `R1-MONEY-001` | P2 | OPEN-SEMANTICS | Display CLDR digits and exact currency minor precision contract remains unresolved |
| `R1-ASSET-001` | P2 | OPEN | Flag provenance still only carried over from earlier projects |
| `R1-VALID-001` | P2 | OPEN-CONDITIONAL | Zod compile dynamic codegen/CSP and JS bundle cost still need platform tests |
| `R1-XPLAT-001` | P2 | OPEN-EVIDENCE | No Next/Expo/Electrobun consumer sources/build results in R2 ZIP |
| `R1-PKG-001` | P3 | OPEN-EVIDENCE | Runtime asset memory/bundle tree-shaking not profiled |


### 3.1 R1-ASY-001 — **P1 / reproduced / NOT FIXED** — shared async adapter binding leaks across operations

**Evidence:** `src/adapter/src/port.ts:80–102,103–106,133–185`; also `family` preference relies on a shared `port` at `:203–260`. Source R2 preserves one `stack: Slot<T>[]` for each port. `port.with(value, work)` calls `scoped(made.use(value),work)`; the `scoped` helper waits for promise settlement before restoring, but **does not carry any per-promise context**.

Source-faithful test (two overlapping work units):

```ts
const tenant = adapter.port<string>("tenant");
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const a = tenant.with("tenant-A", async () => {
    await sleep(10);
    return tenant.get();
});
const b = tenant.with("tenant-B", async () => {
    await sleep(40);
    return tenant.get();
});
console.log(await Promise.all([a, b]));
// Expected if this is an async-isolated scope: ["tenant-A", "tenant-B"]
// Actual R2 focused Node source repro:      ["tenant-B", "tenant-B"]
```

**Risk condition:** If a shared port holds request-specific credentials, tenant identity, locale, storage or transport, cross-request confusion may occur. This repro proves the primitive is unsafe **for async task-local binding**, not that an actual deployed GunX customer has leaked data. `tests/adapter.test.ts` covers nested synchronous and single async callbacks, but not two simultaneous `with` executions; `tests/engine.test.ts` nested disk adapters are still the single-task case.

**Required decision:** `with` must either be **explicitly synchronous and reject promise/thenable callbacks**, or use a genuinely task-local context implementation on each supported runtime, or stop implicit scope for async APIs and pass an explicit immutable operation context. Node-only `AsyncLocalStorage` cannot silently become a requirement of browser and Hermes domain code. Separate application-wide provider registration from per-request dependency selection. Test overlap, nested interleaving, rejection, cancellation, mixed port families, host boundaries and cross-tenant operation logs.

**Closure gate:** no cross-operation reads under deterministic seed schedules, mock load (>=100k interleavings), browser and Hermes/native integration, error recovery and teardown. Do not pass by disabling the test or serializing all independent user requests.

### 3.2 R1-CACHE-001 — **P1 / fixed in focused test** — touch TTL preservation

**Evidence:** `src/cache/src/box.ts:214–224`. Previously a box without default TTL did `set("k",value,{ttl:1}) → touch("k")` and dropped the `e` expiration. New R2 line `keep?.ttl === undefined && ttl === undefined ? kept.e : ...` keeps the previous absolute deadline when no TTL is specified anywhere. Our controlled-time test now sees `before.e=2000`, `after.e=2000` and value expired at clock 3000. **Original failure resolved**.

**Residual contract:** if the box has a default TTL and an item has an explicitly different TTL, a bare `touch` refreshes against box default rather than preserving item expiry. Could be intended “refresh to default” semantics; must be specified and tested, **not declared a new bug without defining the contract**. Add absolute-vs-sliding-expiration tests across actual drivers, durability/restart, concurrent updates and clock skew.

### 3.3 R1-CRYPTO-001 — **P1 / fixed in source** — secrets in cache-key text

**Evidence:** `src/crypto/src/digest.ts:50–105`, `src/crypto/src/seal.ts:11–45,54–87`. R1 used `text:${secret}` or raw hex bytes as long-lived Map keys. R2 makes a per-crypto-source non-exportable random HMAC key (`WeakMap`) and builds opaque labels via `subtle.sign`, so the stored key label no longer directly includes the original string/byte secret. The key-label cache is bounded; this is a **real improvement**.

**New cost to measure:** `macKey` at digest `:109–115` imports raw HMAC keys on calls, and seal/open derive the opaque label asynchronously before using AES-GCM caches. That raises at least theoretical cold-path / burst CPU allocation costs relative to prior memoization. Do not weaken secret handling for speed; measure `sign`, `verify`, `seal`, `open` on browser/JSC/Hermes, cold/warm and concurrent load. Check weak-key strength policy at the **caller/provisioning** boundary rather than pretending an arbitrary user-provided string is always cryptographically strong.

### 3.4 R1-SEC-001 — **P1 conditional / open** — sensitive tokens and storage capability

**Evidence:** `src/auth/src/session.ts` and `src/cache/src/box.ts`. The session layer may persist access/refresh tokens via a general-purpose Box. `cache.open()` supports encrypted storage, but selecting it is the caller’s decision; neither a browser BFF cookie policy nor secure Keystore/Keychain storage is guaranteed by the generalized session contract. This is **deployment-dependent**; not proof that all apps store unencrypted refresh tokens. Enterprise policy should differentiate browser session (HttpOnly/Secure/SameSite & CSRF controls where appropriate), native secrets, desktop OS credential vault and server-side token storage. Never put refresh tokens into generic LocalStorage merely because a semantic `cache` driver exists.

### 3.5 R1-QUEUE-001 — **P1 conditional / partial** — outbox atomicity and lock semantics

**Evidence:** `src/queue/src/outbox.ts:90–154,188–213`; `src/cache/src/storage.ts:113–151`. `locked` now fails when no `raw.lock` is available, unless `options.guard === "local"` is explicitly chosen. **A substantial correctness fix**: caller cannot silently assume cross-instance atomicity when none exists.

But `cache.serial()` is an in-process lock. A custom shared Redis/SQL driver must supply distributed mutual exclusion or, preferably, atomic claim/CAS/transactional state machine. Offline single-device queue is a different guarantee from a multi-worker durable outbox. Lease expiry, duplicate delivery, idempotency keys, crash between side effect and ACK, clock skew and priority fairness still need a two-worker fault test. Do not market exactly-once execution; rely on effectively-once side effects through idempotent consumers.

### 3.6 R1-LIMIT-001 — **P1 / fixed in original repro** — limiter capacity churn

**Evidence:** `src/cache/src/limit.ts:14–113`. At capacity, `room` now denies insertion of a new key when the oldest bucket is still live; it deletes only expired entries. Re-run outcome: `firstAllowed=true`, `secondAllowed=false`, `otherAllowed=false`, `firstAllowedAgain=false`, `bypassed=false`. **Original bypass no longer reproduced**.

**Availability tradeoff:** high-cardinality traffic can now saturate the bounded map and **deny legitimate new keys until expiration**. This is not a correctness regression necessarily; it's fail-closed behavior. Document admission policy, retry time, metric for saturation, proper distributed limiter for security-critical gateway use, and multi-process consistency. A local `Map` cannot claim global rate-limit correctness under horizontal scaling.

### 3.7 R1-CACHE-002 — **P2 / fixed in original Node repro; observability remains**

**Evidence:** `src/cache/src/box.ts:227–249`; `src/cache/src/storage.ts:10–89,162–223`. Promise tails now consume asynchronous watch decode rejection, and the supplied scenario emits zero unhandled Promise rejections. The default `driver` gathers watcher errors and provides `flush()` to surface them. **No process-wide unhandled rejection** in the tested path.

**Residual:** if nobody invokes `box.flush()` / storage `flush`, observer faults may be invisible to the caller, or a custom Storage implementation may ignore a rejected listener Promise. This is a new explicit contract gap, recorded as R2-WATCH-001; add mandatory `onObserverError` capability or robust failure reporting and a test for the non-default drivers.

### 3.8 R1-MEM-001 — **P2 partial** — bounded fan-out, still whole-key materialization

**Evidence:** `src/cache/src/box.ts:155–161,193–213`; `src/list/src/async.ts`. Replacing unbounded `Promise.all(keys.map(...))` with `list.eachAsync` bounds concurrent I/O for clear/all (positive), but `keys()` and `all()` still materialize the full key universe, and `all()` builds an equally large result map. This is normal for explicit `all()` semantics **if it has a documented hard item/byte limit**. For large stores introduce `keysPage` / async iteration or a safe opt-in snapshot and clear-by-namespace/batched server-side cursor operation. Measure RSS with 10k/100k/1M keys, both failure and cancellation.

### 3.9 R1-NET-001 / R1-NET-002 — **P2 partial and open conditional**

`net.headers.facts(headers, remote, hops=0)` at `src/net/src/headers.ts:136–157` defaults to the provided `remote` and only trusts forwarded values when a nonzero hop count is specified. That is safer by default. However no generic helper can determine whether your ingress really has exactly `hops` trusted proxies; a misconfigured deployment is still spoofable. Keep the trust policy at the reverse proxy / ingress integration. For server-side fetching untrusted URLs, URL syntax/origin filtering is not a full egress guard: DNS rebinding, private addresses, redirects, IPv4/IPv6 and resolved-IP restrictions need network or verified resolver-level controls. A browser client has a different SSRF exposure model from a privileged server adapter.

### 3.10 R1-GATE-001 / 002 / 003 and PERF-001 — **shipping evidence still insufficient**

`bun.lock` remains absent from R2 ZIP, while `package.json:gate` runs a frozen install. This is a **snapshot/reproducibility finding**, not proof that the author's local repo lacks a lockfile. R2 `tests/coverage.ts:39–165` now attempts an AST-based executable source inventory using `typescript/unstable/{ast,async}` and rejects empty/missing/bad counters; `tests/coverage.test.ts` adds checker cases. This directly addresses R1's source-inventory loophole **in source**, but actual pinned TS7/Bun behavior is not executable here. Test `inventory()` with normal source file, type-only source, nested exports, invalid LCOV and deletion/missing records before closing.

Export-name occurrence scan remains a **public surface shape check**, not evidence every exported function was executed along useful failure paths. `tests/resources.test.ts` now starts an isolated Bun process and checks one cyclic JSON serialization RSS under 512MiB. Good smoke, **not** a memory regression budget for `cache`, API, websocket, large datasets or an hour-long workload. The `bench` script remains outside `gate`; no real performance measurements are included in the ZIP.

### 3.11 R1-OWN-001 — **P2 fixed source** — strict delegated responsibility

`src/fs/src/disk.ts:287–290` now does `const found = string.lines(await text(path))`. This is the intended ownership rule: `fs` owns IO and file-level trailing empty-line semantics; `string` owns text splitting. **Keep this invariant across all members**. Audit should continue searching for misplaced formatting, encoding, URL math, JSON path parsing and cryptography done in the wrong owner, even when the copied code is only two lines.

### 3.12 R1-MONEY-001 — **P2 still needs explicit semantics**

The baseline comparison across the 153 currency dataset rows found 16 discrepancies between display fraction digits and `value.money` precision: `AFN ALL COP HUF IDR IQD IRR KPW LAK LBP MGA MMK PKR SOS SYP YER`. R2 does not establish a unified public contract for `displayFractionDigits`, `minorUnitExponent`, cash rounding and storage scale. These differences may be **correct** (CLDR display and ISO minor-unit rules are not identical), so don't rewrite monetary math to match formatting blindly. Require an immutable monetary representation, explicit overflow/rounding behavior, currency catalogue version policy, full matrix tests and migration guidance before ERP/accounting/payment products depend on the engine.

### 3.13 R1-ASSET-001 / R1-PKG-001 — **P2/P3 evidence gaps remain**

`src/world/asset/LICENSE.txt` contains substantial notices for Microsoft Fluent Emoji artwork, CLDR/Unicode data and OFL fonts. The flag SVG/WebP family is still described only as **“carried over from earlier projects”**, without an original source/version/license chain. This does **not** prove copyright infringement; it prevents confident enterprise redistribution certification. The assets directory contains **1,836 files and ~15.4 MB** on disk (in bytes: 15,396,578); that's **not** proof the runtime bundles all of it. Require artifact-tree listing and actual HTTP/Metro/Electrobun package transfer-size tests after tree shaking and asset pruning.

### 3.14 R1-VALID-001 / XPLAT-001 — **P2 conditional / evidence gap**

`zod/mini` and a consistent schema DSL are sound defaults. The exposed `z.compile` feature, however, uses `new Function` (documented officially), which behaves differently under strict CSP and Hermes; isolated bundle sizes are not demonstrated. Source bundling tests exist in `tests/engine.test.ts`, but were not executed in the actual Bun build and do not substitute for target product surfaces. Include three real consumer fixtures, even if business components are minimal: Next release SSR/client navigation, Expo Android/iOS Hermes release, Electrobun window/IPC build and runtime smoke. Test imports in browser/edge/worker without Node or Bun leakage.

## 4. New R2-specific findings

### R2-PRES-001 — **P2 / REPRODUCED** — async Presence snapshot regressions

**Evidence:** `src/api/src/presence.ts:50–81`. Two `presence.sync()` operations can run simultaneously. Each completion calls `replace(data)`, which unconditionally installs that response's member list. There is no monotonic request generation, ordering check, invalidation on reconnect or merge-safe post-snapshot event reconciliation.

**Independent Node semantic reproduction (actual source with minimal API stubs):** start request A, then B; deliver **B**'s newer response first (`new-user`), then **A**'s stale response (`old-user`). Observed:

```json
{"latest": ["new-user"], "final": ["old-user"], "staleOverwrote": true}
```

This is a real concurrency defect for Presence clients that expect latest state after concurrent refresh/reconnect. Impact: online membership becomes stale, potentially affecting chat visibility/UX, and correctness of realtime status-driven UI; it is **not** proof of authorization bypass. Fix with generation sequence or single-flight lifecycle, and make snapshot replacement safe relative to concurrent push events and connection epochs. Add delayed, disconnected, reconnect, duplicate ID, joined/left-while-loading, stop-during-sync and out-of-order tests.

### R2-MIG-001 — **P2 / SOURCE-PROVEN** — cross-platform public API migration required

**Evidence:** `src/socket/src/index.ts`, `src/api/src/index.ts`, `src/engine/package.json:7–12`, `src/engine/src/runtime.ts`, `src/state/src/bind.ts:14–21`, `tests/api.json`. The engine intentionally relocates `socket` protocol encode/decode/presence into `api` and makes `socket.open()` use a supplied `Protocol`; `state.bind()` now needs an injected `Renderer` to use the React-like `useSelect` / `useState` hooks. Runtime facade conditionally excludes server-only `test/tool` from browser/react-native aggregate imports.

Architecture **improves**, but old consuming apps may fail at type check/bundle/runtime. This is a semantic API break that needs migration cases, aliases/deprecation (if compatibility is a goal), typed compatibility tests, explicit supported platforms and versioning. Because no surface consumer ZIP was provided, the impact on Apex web/mobile/desktop is **unverified**, not an asserted current crash. Avoid app-specific React code in core to “fix” consumer errors.

### R2-WATCH-001 — **P2 / SOURCE-PROVEN, conditional runtime impact** — observer fault visibility is opt-in

**Evidence:** `src/cache/src/storage.ts:10–89,162–223`; `src/cache/src/box.ts:227–249`. Async callback failures are now captured and can be thrown by `flush()`. This cures the R1 unhandled rejection. However, without `flush()` or a dedicated error observer, errors can remain unreported to the application; custom Storage `watch` implementations may have different error-delivery guarantees. This is **contract and integration maturity work**, not a proof that the default driver silently discards all errors. Require a bounded error sink and clear ownership of promise settlement, lifecycle and cancellation.

### R2-CRYPTO-PERF-001 — **P3 / NOT MEASURED** — crypto hardening needs cost accounting

**Evidence:** `src/crypto/src/digest.ts:50–115`, `src/crypto/src/seal.ts:54–87`. Security-relevant opaque labels remove raw-key retention but introduce HMAC key generation/signing and import work; the streaming/HMAC-heavy workload costs are not measured. Do **not** revert the hardening. Add warm and cold micro/macrobenchmarks, imports per second, key rotation, JSC/Hermes/Bun `SubtleCrypto` compatibility, and heap snapshots without exposing secrets in diagnostics.

## 5. Architecture / dependency direction / owned responsibilities

**Static package-graph assessment: PASS**. 37 packages, 194 directed internal dependency declarations, no cycles and no undeclared `engine-*` imports in scanned module forms. The `engine` facade purposely depends on every member; its namespace tree should be shaken in client entrypoints. DAG is necessary, but not sufficient: duplicate logic inside legal downward edges, runtime capability coupling and async context leakage need independent evidence.

### Four architectural rules to keep

1. **Portable core, runtime adapters:** no implicit `Bun`, `node:*`, DOM or Hermes requirement in core; host-specific functionality resolved via capability and explicit driver. Keep `engine/test` and `engine/tool` out of production client bundles.
2. **Delegated semantics:** `fs→string` for text; `api→net` for HTTP/fetch; `queue→cache/event/func` for mechanisms; `spec→validate/world` for schemas/tokens. Don't build duplicate encoders/parsers/formatters inside each domain.
3. **Cross-platform semantic API, not fake platform equality:** a shared `device` contract must identify unsupported/denied/not-yet-granted features. Native capabilities are accessed by thin platform adapters with lifecycle and security scopes, not by sprinkling platform checks in shared business code.
4. **Comprehensive, still predictable:** a 36-domain member inventory does not mean all enterprise operations are solved. Each package needs a finite responsibility, small public surface and domain-specific behavior; adding 100 functions without daily production value is not progress.

### Lifecycle and scope maturity

The core missing unifying concept is **ownership over time**. Every Port, Cache, Socket, Queue, Watcher, File/Blob, Timer and Device API needs clear answers to: who created it, who may use it, whether it is process-/request-/tenant-/window-scoped, how it is canceled, when it closes, whether errors are observed, and whether a fallback changes semantics. Distinguish **global configuration** from **per-operation capability**. `port.with` demonstrates why configuration stacks must not masquerade as request-local async context.

A provider-neutral DSL should support **capability negotiation** (`atomicCAS`, `sharedLock`, `transactions`, `keyScan`, `binary`, `secureStorage`, `backgroundSync`, `abort`) and expose incompatible features instead of emulating them with weaker guarantees while keeping the same return types.

## 6. Package-by-package independent matrix

The following table scans all member facades/manifests and tests and provides **targeted** next verification questions. It is a package responsibility and critical-delta review; it is not a claim that every path of every method executed or every implementation line manually verified.

| Member | Source TS | R2 verdict | Verified focus + remaining audit obligation |
|---|---:|---|---|
| `adapter` | 6 | FIX / P1 | Port, Family and bundle semantics; still unsafe async scope interleaving; must prevent cross-user binding and validate scope/close |
| `api` | 13 | IMPROVED / P2 | Transport contracts, client and new `realtime/presence`; fix out-of-order Presence sync and test idempotency, headers, cache identity |
| `auth` | 4 | HARDEN / P1 conditional | Session semantics are reusable; require platform-appropriate secret storage, CSRF/PKCE policies where applicable and expiry/revocation |
| `cache` | 8 | IMPROVED / P2 | TTL, limiter and rejection R1 repros improved; limit bulk key memory and define observer error/atomic lock contracts |
| `crypto` | 6 | IMPROVED / measure | Opaque secret labels eliminate raw-key Map keys; benchmark WebCrypto overhead, secret rotation and serialization/heap hygiene |
| `date` | 8 | KEEP / temporal proof | Typed time/date helpers; verify DST transitions, epoch units, timezones, monotonic vs wall clock and locale matrix |
| `device` | 7 | KEEP / native proof | Native capability ports/permissions/watchers; verify deny/unavailable states on Hermes, Desktop and Web, resource teardown |
| `engine` | 38 | IMPROVED / release proof | Aggregate and subpath facades; runtime conditional browser/native excludes tool/test; test every bundler/exports condition |
| `error` | 4 | KEEP / contract | Typed Fault taxonomy; test lossless cause, status, retryability, secure logging and transport envelopes |
| `event` | 7 | KEEP / concurrency | Emitter, signal and cancel/deadline machinery; stress reentrancy, unsubscription, leak/late callbacks and listener faults |
| `fake` | 6 | KEEP / test-only | Fixtures/fakes generate realistic data; verify deterministic seeds, PII-safe shape and no accidental shipped runtime overhead |
| `form` | 4 | KEEP / async race | Field state and validation; test concurrent validators, stale results, accessible errors, dynamic arrays and offline submit |
| `fs` | 6 | FIXED ownership / native proof | `fs.lines` delegates string; add traversal/symlink, stream backpressure, abort, large files and target host implementations |
| `func` | 5 | KEEP / scheduling | Lanes and async workflows; prove bounded queue, abort fairness, error ordering and retry idempotency |
| `geo` | 7 | KEEP / correctness | Geospatial math/location; antimeridian, precision/error bounds, provider privacy/permissions |
| `history` | 4 | KEEP / platform integration | Navigation URL/memory abstraction; deep linking, back/forward, focus, restore, locale and concurrent transitions |
| `json` | 8 | IMPROVED / hostile inputs | CSV injection guards and object handling; verify deep nesting, prototypes, cyclic/large payloads and memory budget |
| `list` | 9 | IMPROVED / streaming | Bounded `eachAsync` and helpers; assess short circuit, cancellation, error ordering and async iterables |
| `log` | 4 | KEEP / trace integration | Structured sinks; privacy redaction, async flush, trace/span propagation and bounded backpressure |
| `net` | 8 | IMPROVED / security | Safer default forwarded facts; still proxy-trust/SSRF egress deployment tasks; retry budgets/redirect/abort tests |
| `number` | 6 | IMPROVED / locale | Intl plural handling and KiB wording; verify Decimal vs Number, rounding, Unicode and locale coverage |
| `parse` | 5 | KEEP / malformed data | Query/URL parser ownership; hostile encoding, max-length, duplicate keys and consistent normalization |
| `queue` | 4 | IMPROVED / distributed proof | Outbox fail-closed without a lock; distributed CAS, lease loss, exactly-once claim vs idempotent effect tests |
| `rand` | 4 | KEEP / security origin | CSPRNG versus deterministic test RNG; seed ownership, secure IDs and browser/Hermes availability |
| `search` | 4 | KEEP / scale proof | Search/filter/query primitives; large dataset memory/time, incremental indexing and locale correctness |
| `seo` | 5 | KEEP / web surface | Metadata and SEO helpers; Next SSR/static generation, canonical/alternate escaping and role-driven index policy |
| `socket` | 4 | IMPROVED ownership / migration | Now transports a Protocol injected by API; test disconnect/backpressure, max frame, backlog, retry/heartbeat |
| `spec` | 8 | KEEP/EXTEND / DSL | Compiler/runtime defines features/screens/effects and hooks; compile-time contract, action auth, infinite loop and compatibility |
| `state` | 9 | IMPROVED ownership / migration | Headless store + renderer parameter; test Zustand/React bindings and selector identity on actual Next/Expo apps |
| `string` | 8 | IMPROVED / correctness | New typed base64 decoder; 2,000 randomized b64/b64url round trips passed in Node; Unicode/fuzz across runtimes |
| `test` | 5 | KEEP / integrity | Runtime testing helpers, coverage; ensure empty/false coverage cannot pass and instrumented source inventory is exact |
| `tool` | 6 | KEEP dev-only | Assets/catalog/fs tooling; isolate from web/mobile output and verify reproducible stage/release |
| `translate` | 6 | IMPROVED / locale | Currency naming and locale utilities; fallback behavior, plural morphology, RTL and large catalogue cache |
| `validate` | 7 | KEEP / CSP proof | Zod Mini schemas; optional compile path triggers dynamic codegen; measure validator alternatives and browser/Hermes CSP |
| `value` | 7 | KEEP / money semantics | Typed money/decimal and value primitives; clarify CLDR display digits versus minor storage precision before finance |
| `virtual` | 5 | KEEP / UI load | Virtual window/scroll primitive; measure 10k/100k rows, variable height, recycle, rapid scroll and accessibility |
| `world` | 16 | KEEP / assets and ownership | Large catalogues/themes/fonts and flags; provenance, lazy-loading, minify/asset pruning, mobile bundle split |


### 6.1 Semantic DSL completeness and actual enterprise use

Treat the DSL as an **application-standard library**, not Laravel emulation or a giant generic abstraction. Currently the code has coherent primitives for transport contracts, session helpers, cache, validation, form, state, event, search, navigation, world, geo, real-time and offline outbox. The gaps below are **feature proof/contract requests**, not assertions that zero implementation exists; only consumer scenarios can establish completeness.

| Real production workflow | What the engine should prove with a reference contract | Why it matters |
|---|---|---|
| SaaS B2B / ERP | tenant-aware API cache isolation, role/permission refresh, workflows with cancellation/retry, long table virtualized updates, timezones, money correctness | A correct one-user demo does not prove safe multi-tenant concurrency or accounting. |
| E-commerce | cart optimistic updates + reconciliation, idempotent checkout retry, inventory refresh, media and uploads, refund/failed payment state | Race and network error handling cannot be hidden behind a success-only facade. |
| E-learning | long video progress resume, offline downloads/resync, background interruptions, push/permissions, realtime classroom reconnect | Mobile lifecycle, battery and storage quota dominate; do not fake these via common browser logic. |
| SaaS admin panels | query invalidation by tenant/user/role, session expiry, audit-friendly error contracts, large dynamic forms, accessibility | Any cache key missing identity or permission dimension becomes a latent leak. |
| Desktop operations | native file stream, multiwindow isolation, IPC capabilities, update/restart recovery and OS secrets | Renderer crash and native bridge are not ordinary WebView events. |
| International finance | exact decimal/monetary repr, currency rules, locale display, durable import/export, CSV formula defense | Correct data storage and display have different contracts. |

**Do not blindly add** ORM/SQL/PostgreSQL clients, Redis, background jobs, upload providers, push providers or charts to the browser bundle. Add provider interfaces only where shared semantics genuinely exist, keep implementation adapters in compatible host packages, and avoid business-specific fields in the engine. “Broad stdlib” means deep, useful common operations and escape hatches, not eager import of every vendor. Confirm coverage by implementing at least one complete production-like vertical slice for each surface, then extract only genuinely reusable mechanisms.

### 6.2 Recommended DSL consistency audit

- One predictable verb across domains when semantics are identical (`get`, `set`, `watch`, `open`, `close`, `read`, `write`, `use`), but **never** unify verbs with different consistency/failure guarantees.
- Async-by-default where operations may hit disk/network/device; keep pure transformations synchronous. Don't wrap a trivial in-memory computation in a Promise for stylistic parity if it adds allocation/hot-path cost.
- For every user-facing public symbol, document by **types/tests**, not necessarily comments: input shape, return value, thrown/rejected fault, cancellation, disposal, storage scope, size/TTL, concurrency, privacy/security, runtime support.
- Ensure errors include typed codes and retryability but not tokens, secrets or unredacted PII; all adapter-relevant failures observable.
- Pin semantic contract tests across provider swaps. E.g. a `CacheDriver` without atomic CAS must **not** transparently claim the same capabilities as one with CAS.
- Preserve user hand style and comment-free source: no style-only penalty and no auto-format rewrite. Architectural clarity, predictable naming, types and tests are the gate.

## 7. Direct dependencies, licensing and ecosystem evaluation

### 7.1 Manifest-grounded runtime dependency inventory

The 36 domain packages have **four direct external runtime dependencies**, with other catalog entries used for dev/test/tooling: `engine-string → unicode-segmenter`, `engine-validate → zod`, `engine-state → zustand`, `engine-test → mitata`. The root pins Bun, TypeScript, React/React DOM, fast-check, Biome and type packages. This is good restraint for a 36-domain surface; do not award speed victories without matched load testing.

| Package | Pinned in R2 | Public license evidence | Release/community verdict | Replacement conditions |
|---|---|---|---|---|
| Bun | `1.4.4` | MIT (official/npm) | Active latest stable on 2026-11-14 | Keep. Cross-runtime semantics matter more than replacing framework plumbing; Bun is tooling manager for Expo, not runtime on device. |
| TypeScript | `7.0.2` | Apache-2.0 (Microsoft) | Native 7 compiler active | Keep. Compiler speed is NOT JS runtime speed. Verify `typescript/unstable/async` APIs used by the new coverage utility. |
| React/React DOM | `19.3.0` | MIT | Active; patch `19.3.1` available in web | Pin to actual RN/Expo renderer compatibility. 0.88.1 currently pairs with React 19.3.0. Avoid duplicate React/invalid hooks. |
| Zustand | `5.0.16` | MIT | Active, `5.1.0` published 2026-11-06 | Keep pending binding/SSR perf proof. Benchmark 5.1 on persistence semantics; don't auto-upgrade only for patch count. |
| Zod Mini / Zod | `4.6.7` | MIT | Actively developed | Keep; compare Valibot/ArkType/Typia on **same schemas and runtime**; measure payload, parse, memory and error fidelity. Keep compilation optional. |
| unicode-segmenter | `0.17.3` | MIT | Specialized focused library; check maintainer concentration | Compare with `Intl.Segmenter` for Arabic/graphemes/emoji, correctness, shipped bytes and Hermes support. |
| fast-check | `4.10.2` | MIT | Active, exact pinned version current | Keep and widen properties: concurrency, bad I/O, cross-runtime differential tests and shrinkable failure examples. |
| mitata | `1.0.34` | MIT | Stable use, npm last publish roughly two years prior | Not inherently bad; evaluate benchmark harness reproducibility versus `tinybench` and native tooling. Keep when results are trustworthy. |
| Biome | `2.6.6` | MIT OR Apache-2.0 | Active; `2.6.7` available 2026-11-11 | Keep lint discipline, formatter off as preferred; compare lint rules before upgrading. |
| subset-font | `2.9.0` | BSD-3-Clause per package metadata in R1 | Tooling dependency | Keep only if actually used in font pipeline, check subsetting accuracy/licenses/transitives. |

**License caveat:** direct public-project licenses are positive evidence, but no `bun.lock` or installed transitive dependency graph was supplied. Therefore **SBOM, transitive licenses, vulnerability scan, npm provenance and native artifact licensing are NOT certified**. Asset family notices are not a substitute for their original provenance.

**External references captured at audit date:**

- Bun v1.4.4 official: https://bun.com/blog/bun-v1.4.4 ; latest Bun: https://bun.com ; TypeScript 7.0.2 https://github.com/microsoft/TypeScript/releases
- Zustand v5.1.0 (2026-11-06): https://github.com/pmndrs/zustand/releases
- fast-check 4.10.2: https://www.npmjs.com/package/fast-check
- Biome 2.6.7: https://github.com/biomejs/biome/releases
- Zod CSP/compiler cost: https://zod.dev/compile
- mitata release/maintenance: https://www.npmjs.com/package/mitata
- React Native 0.88.1 / React 19.3.0 / Expo 58 compatibility: https://react-native.dev/

### 7.2 Benchmark requirements before changing a dependency

Run each candidate against identical corpora, exact Node/Bun/Browser/Hermes release targets, warmup and cold paths. Compare: **functional equivalence first; then p50/p95/p99, throughput, memory allocations, peak RSS, GC pause, error quality, binary size, upgrade risk, license, supply chain and community continuity**. A package winning a tight microbenchmark can lose on real workflows with network, rendering and cache. Use a fixed manifest/lockfile and commit SHA in the report; always include raw samples and hardware description. Never replace a stable provider only because a competing README quotes a larger percentage.

#### Priority comparison experiments

1. **Validation:** 8 representative DTO schemas (nested arrays, unions, product catalog, typed forms, malformed input), measure Zod Mini vs Valibot vs ArkType; include schema build time and CSP profile.
2. **Grapheme handling:** Arabic, Indic scripts, ZWJ emoji, astral characters, invalid surrogate halves; unicode-segmenter vs Intl.Segmenter if available with exact correctness first.
3. **State:** Zustand vs minimal `useSyncExternalStore` vs Jotai for 10k row selectors, 100 subscribers, independent edit fan-out, SSR hydration, React Compiler compatibility.
4. **Networking:** native `fetch` vs GunX `net/api` with equivalent retry/deadline/cache rules and 1/100 concurrent requests; network errors, body size caps, duplicates, credentials.
5. **Crypto:** WebCrypto key import and pseudonymous label overhead, cold/warm throughput; security properties unchanged.
6. **Desktop/mobile:** client bundle closure from `engine/xxx` versus `engine` namespaced facade; ensure optional world data/React/tool/Node dependencies do not leak.

## 8. Tests and fuzz — adequacy analysis

**Inventory is stronger**, with 79 unit `.test.ts` files and 750 textual test declarations, 283 `fc.assert` occurrences, ~183,637 explicitly enumerated `numRuns` samples and 41 benchmark files. These values do **not** represent tests that passed, nor enough independent failure distributions to certify production stability.

### Specific holes demonstrated by R2

| Hole | Why the current suite missed / did not prove | Required remedy |
|---|---|---|
| Async port isolation | Only single async and nested scopes; no overlapping schedule with two tasks | Seeded deterministic Promise interleavings and cross-user data isolation fixture |
| Presence stale snapshot (new) | Tests cover join/sync basics but not two overlapping sync requests returning in reverse order | Fake clock/transport with controllable response order; stop/reconnect generations |
| TTL contract | R1 tested only explicit refresh; R2 corrected one case | Matrix for box default TTL vs per-entry TTL, clock/time skew, concurrent touch |
| Rate limiter availability | R2 blocks new key when full, but no abuse-vs-legitimate reliability budget | 100k IDs, time windows, capacity saturation, retry, distributed independent nodes |
| Watcher errors | Avoided process unhandled, but delivery via flush is opt-in | Assert caller observes errors via defined sink or Promise/flush, test custom drivers |
| Outbox multi-instance | Local store tests can't verify cross-host lock/CAS | Two workers against real Redis/DB with crash injection, lease loss and duplicate consumer |
| Coverage gate execution | AST uses TS7 unstable API, no actual Bun run in supplied evidence | Execute on pinned toolchain against real LCOV; force expected missing source and 0-hit cases |
| Memory | Single cyclic JSON RSS threshold 512 MiB is extremely coarse | Measure slope per 10k/100k/1M rows, observer churn, hour-long soak and leak threshold |
| Cross-platform | No actual Web/Mobile/Desktop consumer source included | Compile and run release fixtures with actual native bridges and rendering paths |

### Gate set for R3

**Per-commit cheap gate:** frozen install with committed lockfile; TS7 full check; Biome lint **without mandating formatter**; unit tests; fuzz with deterministic seeds; license/direct dependency snapshot; export/type signature compatibility check; browser-target bundle integrity and size budgets; no forbidden host imports.

**Merge or nightly medium gate:** multi-worker concurrency, >100k deterministic state-machine schedules, HTTP/WS fault injection, 10k-input corpus security, perf smoke against fixed baseline (advisory until calibrated), important device emulators and one browser engine.

**Release hard gate:** Android/iOS *release builds* on physical devices, Next/Turbopack or configured production web build, Electrobun signed app/window/IPC package, long-run memory soak, genuine backend driver integration for required features, external security tests, transitive SBOM, vulnerability/license notices, benchmark artifacts, rollback and crash recovery.

Keep dev and release tests separate. Use actual low-end phones and disk-constrained desktops for memory/performance. Profile CPU/JSC/Hermes and browser memory separately; do not transfer Bun desktop benchmarks to React Native conclusions.

## 9. Performance and memory engineering verdict

**No legitimate numerical speedup claim can be made.** A change in line count, TypeScript compile result, microbench mock or static asset file size is not a measured faster app.

### Important hot paths by priority

- **Async operation isolation:** fixing shared mutable state before performance is paramount. An extremely fast wrong context is not a gain.
- **API request path:** cache identity dimensions `tenant/user/permissions/locale/endpoint`, body serialization cost, cancellation/deadlines, connection reuse, retry budget and queue pressure.
- **State and React:** renderer-bound hooks should avoid unnecessary re-renders with selector referential stability; test on React Compiler and Expo's real renderer.
- **Large transforms:** `json`, `string` and `list` should use chunked processing where whole buffers are not contractually required; test UTF-8 byte counts and memory duplication.
- **Cache/Queue:** all large storage operations must expose budgets; no global unbounded Promise.all or unbounded listener retention; hit/miss memory ratios matter.
- **Crypto:** new opaque key labeling is security-positive but requires additional WebCrypto overhead profiling.
- **World payload:** asset directory size is not a JS bundle metric; inspect actual chunk graph, compressed transfer bytes and decoder memory, especially animated assets/fonts.

### Proposed measured performance dashboard (not claimed results)

| Target | Suggested metrics | Correct test conditions |
|---|---|---|
| Bun HTTP/API | req/s, p50/p95/p99, CPU%, event loop lag, RSS slope, GC, network bytes | Mixed cache hits/misses/errors, realistic JSON, concurrent clients, several minutes minimum |
| Browser Next | JS initial/route chunks, hydration cost, INP, LCP, CLS, heap peak, server RSC CPU | production build; cold and warm CDN; authenticated and public screens |
| Hermes/Expo | cold start, JS/UI frame misses, GC pause, PSS/RSS, image decode memory, battery, offline restore | physical Android low-end and iOS, Release; airplane mode and background resume |
| Desktop Electrobun | cold start, idle/active RSS, multiwindow memory, IPC p95, crash/restart, installer/bundle | Windows/macOS/Linux signed or production packages, native bridge and file workloads |
| Shared primitives | ops/s, ns/op, bytes/op, allocator counts, wall vs CPU time, quality of error/abort | equal data sets, warmups, independent pinned baseline, no stdout in loop |

Establish a fixed historical baseline R2→R3. Report source commit hash, Bun/TS versions, OS/CPU/RAM and input sizes. No generic “max speed, min RAM” certificate is possible absent real hardware and representative workloads.

## 10. Delivery recommendation: three engineering phases

### Phase A — correctness gates before expanding DSL (hard blockers)

1. **P1 `adapter.port.with`** — select sync-only or cross-runtime task-local/explicit-context contract, fix and test under concurrent requests. Audit `bundle.with` and `family.use/prefer` for the same shared-state semantics.
2. **P2 `api.presence`** — prevent delayed stale snapshot from overwriting newer request and joining/leaving state after reconnect; add generation counter and event-order tests.
3. **Storage/queue semantics** — define observer error sink, `flush`, distributed vs local storage locks, cache `touch` default TTL and correctness under corruption, throw/cancel paths.
4. **Security boundary contract** — secure session storage policies; trusted proxy count at ingress; egress allowlist/resolved-IP validation for any privileged untrusted URL fetch.
5. **Reproducible artifact** — include `bun.lock`, exact scripts, tested Bun/TS, test output and copied benchmark outputs. All R1 repro harnesses must be included as regression tests.

### Phase B — compatibility, ownership, DSL deepening

1. Explicit semantic API versioning and migration map for `socket→api`/new `state.bind`; no silent consumer breakage.
2. Add three thin products/fixtures: Next Web, Expo RN/Hermes, Electrobun Desktop. Require release builds + basic auth/cache/API/navigation flows.
3. Rule-based audit for duplicated semantics across packages, one owner per operation; enforce DAG plus capability direction, not only import graph.
4. Build realistic vertical slices for ERP/SaaS dashboard, ecommerce checkout, e-learning offline media and desktop long-session work. Convert missing mechanisms into new engine features only after proof of reuse.
5. Formalize money precision, cache identity and remote-provider contract matrices; leave business rules in products.

### Phase C — hard performance and production-readiness evidence

1. Stable fixed hardware benchmark CI with p95/p99, warm/cold, allocated memory, RSS/heap, GC and native bridge overhead.
2. Stress/fuzz with adversarial data, latency, disconnect/retry, simulator time/clock skew, large data and concurrency. Add mutation testing for critical modules.
3. Real transitive SBOM/licenses, signed release provenance, software supply-chain scanning and tested rollback.
4. One-hour or longer soak of active watchers, queues, API caches and Socket reconnect under plausible production workload. Profile leak slope, not just peak.
5. Independent source/audit review R3 with R1+R2 evidence diff, performance and API compatibility scoreboard and all previous repros preserved.

## 11. Acceptance conditions for the next ZIP (R3)

The audit will not close an item because an AI agent says “done”. Supply the **new ZIP plus this R2 report + finding register + R2 replay scripts**, ideally `bun.lock`, a reproducible `bun run gate` transcript, package version list and build evidence for the actual surfaces. Each finding gets exactly one of `FIXED`, `PARTIAL`, `REGRESSED`, `OPEN`, `NOT-VERIFIED`, with source line, before/after harness and objective acceptance criteria. Re-run original R1 and R2 failure cases even if internal APIs were renamed. A deliberate API removal is not a hidden “fix” if it makes production consumers fail.

The goal is not 10/10 by assertion. It is **well-specified behavior, observable errors, bounded resources, robust independent boundaries, compatible runtime builds, and empirical performance**, with a public developer DSL much simpler than its internals.

---

**Summary:** R2 is a genuine improvement. Five R1 findings closed to the evidence available; four partially improved; eleven still open or without sufficient proof; four new R2 findings recorded (including a reproduced Presence sync race). The remaining concurrency isolation and production integration barriers make the current engine **not yet approved for critical enterprise deployments**, despite a sound architectural direction.
