# Bun engine and apex surfaces: port brief and production audit

Date: 2026-11-14. Audience: the agent developing `engine/bun` and `product/apex/{web,mobile,desktop}` in this repository.

The document has two jobs:

1. **Part A** lists what the lab version (`/var/www/projects/gunx-lab/gunx-bun`) gained that this repository still lacks. Each item has evidence, the files to port and an acceptance test.
2. **Part B** is a strict production audit of this repository's current engine and surfaces. It covers correctness, security, DSL gaps, missing capabilities, performance, memory, surfaces and the evidence system.

Parts C and D add real product needs (Zainlak) and a second pass. Part E (2026-11-15) is the final pass: the frontend-only boundary, ownership, DSL coherence, speed, memory and security. Part F covers the host runtime on mobile, attack paths, retention and missing interaction models. Part G covers contract hardness: definitions, refusals, caps and duplicated guards. Parts H, I and J self-audit this document and close the last wiring gaps.

Read Part A for quick wins, Part E1 before any new work, and Parts B to E for what decides whether this engine can carry large enterprise products.

---

## 0. Scope, method, evidence

| Item | Value |
| --- | --- |
| Audited tree | This repository's working tree, HEAD `d118064` plus 747 uncommitted entries. It was snapshotted on 2026-11-14 at 22:30 EET into `/var/www/projects/gunx-lab/real-snap`, outside the repo. The snapshot was content-checked with `rsync -c` as identical to the working tree at 22:41. |
| Lab tree | `/var/www/projects/gunx-lab/gunx-bun`, a copy taken 2026-11-14 19:16 and developed separately. Lap log: `/var/www/projects/gunx-lab/LOG.md`. |
| Box | WSL2, 8 cores, 15 GB. It was shared with another session running Python load tests, so microbenchmarks are noisy (±2×). Runtime: Bun 1.4.4. Browser: Playwright Chromium. |
| Probes | `/var/www/projects/gunx-lab/probe/{duel,audit,memory,world}.ts` take the engine root as an argument. Example: `bun probe/audit.ts <root>/engine/bun`. Rerun them after every fix. |
| Fake API | `/var/www/projects/gunx-lab/fakeapi/server.ts`: HTTP + WS, `/api/hello`, `/api/notes` CRUD with idempotency and validation, `/__plan` fault injection, `/__push`, `/__note` live push, `/__seen`. |

Evidence labels:

- **run**: a test or probe was executed and its output observed.
- **measured**: a number was observed under the stated conditions.
- **read**: source reading only.
- **doc**: an upstream primary source, not executed here.

Nothing labelled read or doc is claimed as executed.

### 0.1 Where both versions stand (all run)

| Gate | This repo | Lab |
| --- | --- | --- |
| `engine/bun` `bun run gate` | exit 0: 756 tests, 245 fuzz, coverage 98.83 / 98.48 (inventory-checked), audit clean, biome 0 errors / 197 warnings | exit 0: 737 tests, 244 fuzz, coverage 98.83 / 98.39, biome 0 / 197 |
| Members / exports | 36 + facade / 1193 | 37 + facade (`style` split out of `world`) / 1189 |
| web gate | exit 0: 31 tests, hello only | exit 0: 35 tests, hello + notes |
| mobile gate | exit 0: 32 tests, Hermes 3,327,399 B | exit 0: 36 tests, Hermes 3,377,553 B (one more feature) |
| desktop gate | exit 0: 33 + 5 native tests | exit 0: 37 + 5 native tests |

The two lines are close. Both independently did:

- React outside the engine
- a browser-safe facade
- lazy features
- desktop code splitting
- one api client per surface
- a CSP that allows the WS origin
- text through `translate`
- locales taken from settings

This repo is ahead on breadth:

- `socket` protocol moved into `api`
- outbox lock policy
- forwarded-header trust
- per-call locale
- `trace: false`
- KiB units
- base64 strictness
- `budget` including token acquisition
- pre-paint appearance (CLS 0.005)
- `MIGRATION.md`

The lab is ahead on the specific items in Part A. Part B applies to this repo, and several findings apply to the lab too; those are marked **(both)**.

---

## Part A — Port these lab gains

Each gain shows: the behavior in this repo (probe output), the lab change, the files to read in the lab, and the acceptance test. Port behavior, not text; keep this repo's naming where it is already better.

### A1. `adapter.port/bundle.with` must not leak a binding across async work — P1, still open here

- **Here (run):** `probe/duel.ts`. Two overlapping `port.with("A", async…)` and `port.with("B", async…)` both read `["B","B"]`. This is R1-ASY-001 from the external audit. A tenant, locale, disk or credential bound by one async scope is read by another.
- **Lab:** `with()` scopes synchronous work only. If the work returns a thenable, the binding is restored first, the thenable's rejection is consumed, and `with()` throws `internal / <port>.async` with a message pointing to `use()` plus `restore`. There is no AsyncLocalStorage in shared code. Concurrent async lifetimes own `use()`/restore explicitly.
- **Lab files:**
  - `engine/bun/src/adapter/src/port.ts`: `scoped(name, restore, work)`
  - `engine/bun/src/adapter/src/bundle.ts`
  - tests: `tests/lifecycle.test.ts` (two new cases), `tests/adapter.test.ts`
  - test helpers `within()` in `tests/fs.test.ts`, `tests/fs.owner.test.ts`, `tests/crypto.test.ts`, `tests/engine.test.ts`
  - `fuzz/fs.test.ts`
  - surface `tests/states.test.tsx` on all three surfaces
- **Accept when:** the probe prints `throws … tenant.async`, no unhandled rejection is observed, and every sync `with` still restores on throw.

### A2. `spec.serialize/revive` must keep the declared screen order — High, still open here

- **Here (run):** `probe/audit.ts`. The menu reads `["home","deep"]` before serialize and `["deep","home"]` after revive. `serialize` drops `surface.screens` and `revive` rebuilds it from the route-ranked list. Every surface revives at runtime (`.cache/spec/current.json`), so with two screens of different depth the menu, `pathsOf()` and the denied page's "first page you can open" all follow routing rank instead of declaration. The lab's `notes` fuel exposed it: the menu showed Notes before Hello.
- **Lab:** `serialize` writes `surface.order` (the declared names). `revive` rebuilds `surface.screens` in that order, then appends anything unnamed. File: `engine/bun/src/spec/src/compiled.ts`. Test: `tests/spec.edges.test.ts`, "a compiled surface survives serialize and revive…" (three new expectations).
- **Accept when:** the probe prints `["home","deep"]` twice, and a surface with screens `/` and `/notes` lists the menu in declared order after a fresh compile.

### A3. Credentials only in confidential storage — High, security

- **Here (run):** `auth.session({ box })` on a plain driver box persists `{ access, refresh }`, so `probe/duel.ts` prints `persisted`. That is localStorage on web and AsyncStorage on mobile. `tutor/stack/fragment/web` says "tokens never in web storage", and `tutor/stack/fragment/mobile` requires "secure on-device sessions".
- **Lab:**
  - `cache.Storage.confidential: boolean`, declared by `Driver.confidential`. `memory()` is `true`, web, cookie and plain drivers are `false`, and `lazy`/`namespaced` forward it through a getter so a late-bound kind stays lazy.
  - `auth.session` checks it inside `begin` and `renewed`, before any effect, and throws `internal / auth.storage` unless `plain: true` is passed on purpose.
- **Lab files:**
  - `engine/bun/src/cache/src/{arch,storage}.ts`
  - `engine/bun/src/auth/src/{arch,session}.ts`
  - test: `tests/auth.test.ts`, describe "auth storage"
- **Accept when:** plain storage refuses before writing, confidential storage and `plain: true` persist, and memory boxes keep working.
- **Then:** bind a confidential driver on mobile. See B-C3.

### A4. Dates display in the user's zone — High, correctness

- **Here (run):** with `TZ=Africa/Cairo`, `date.format(23:30Z, "HH:mm")` prints `23:30`. A user in Cairo sees yesterday's time.
- **Lab:**
  - `date.zone`: an `adapter.port<string>` whose fallback is the runtime zone, read through `Intl.DateTimeFormat().resolvedOptions().timeZone` and validated.
  - `format` uses `options.timeZone ?? zone.get()`.
  - Calendar math stays UTC on purpose.
- **Lab files:** `engine/bun/src/date/src/{zone,format,index}.ts` and `package.json` (adds `engine-adapter`). Test: `tests/date.test.ts`, describe "date zone".
- **Accept when:** a bound `Africa/Cairo` prints `01:30` and `2026-01-02`, an explicit `timeZone` wins, an invalid zone is refused, and the default equals the runtime zone.
- **Hermes:** zone formatting relies on `Intl.DateTimeFormat.prototype.formatToParts`. The Hermes V1 source implements it on both platforms (see the corrected B-C1); prove it on the Hermes lane.

### A5. CSV formula guard on by default — Medium, security

- **Here (run):** `json.toCsv([{ a: "=1+1" }])` prints `=1+1`. That is OWASP CSV injection for any exported spreadsheet.
- **Lab:** the guard is on unless `guard: false` is passed. String cells starting with `= + - @ \t \r` are prefixed with `'`.
- **Lab files:** `engine/bun/src/json/src/csv.ts`, `tests/json.test.ts`, `fuzz/json.test.ts` (round trip passes `guard: false`).

### A6. `box.keys()` lists live entries only — Medium

- **Here (run):** after expiry, `box.keys()` still returns the expired key.
- **Lab:** `keys()` reads each entry, sweeps expired ones, drops undecodable ones and keeps order. File: `engine/bun/src/cache/src/box.ts`. Test: `tests/cache.test.ts`, "cache box listing".
- **Cost (measured):** the lab's `cache.box.keys` bench is about 27× slower, because it reads every entry. When porting, prefer keeping expiry in a side index (key → `e`) so `keys()` filters without decoding.

### A7. `translate.field` voices a plain rule code — Medium, DSL

- **Here (run):** `translate.field("min_length:3", "name", t)` returns `undefined`. Form errors (`form.errors()` holds codes like `min_length:1`) cannot be voiced through the engine, so every feature invents its own mapping.
- **Lab:** `field(failure: Fault | string, name, t)`. A string is treated as the rule code and looked up through the same `validation.<rule>` and `fields.<name>` keys, with the plural count taken from the argument.
- **Lab files:** `engine/bun/src/translate/src/localize.ts`, `tests/translate.test.ts`. Surface use: `product/apex/*/src/features/notes/hooks/use-notes.ts` (`ruled()`) and the `validation`/`fields` sheets in `specs/*/brand/messages.ts`.

### A8. Split `world` into data and style — Medium, ownership

- **Here (read):** `world` owns geo-cultural data (countries, currencies, languages, emoji, flags, fonts) and a style system (color math, theme, tokens/css, variants/states, motion, icons). No type crosses that seam.
- **Lab:**
  - `style` is a new member: `color`, `theme`, `tokens`, `variants`, `motion`, `icon`, plus their types. Its dependencies are `adapter cache event number string`.
  - `world` keeps the data. Its dependencies are `error list number string value`.
  - tests, benches and fuzz were renamed `style.*`, the facade exports `style`, and the surfaces import `engine/style`.
  - builds were unchanged within bytes.
- **Lab files:** `engine/bun/src/style/**`, `engine/bun/src/world/**`, `engine/bun/src/engine/{package.json,src/index.ts,src/style.ts}`.

### A9. Smaller items

- **`string.studly`:** remove it. It is an alias of `pascal` and still exported here.
- **`number.ordinal`:** here, non-English ordinals print plain numbers (`"1"`). The lab prints marks for the locales it knows (fr `1er/2e`, nl `e`, sv `:a/:e`, `.` for de/da/fi/cs/sk/pl/hu/tr/hr/sr/bs/sl/et/lv/lt/is/fo, `º` for es/pt/it/gl) and plain digits elsewhere. File: `src/number/src/format.ts`, test "number locales". This is optional UX; keep this repo's refusal discipline.
- **Web budget metric:**
  - Here (run), `tools/build.ts` sums all chunks: `792,271 B` against an `800,000` budget for a hello-only app. The next lazy feature fails the build even though no route's initial JS grows.
  - The lab measures each exported route's initial JS from its `<script>`/`<link>` tags, excludes `noModule` scripts (Next's 112 KB legacy polyfill chunk, which modern browsers do not fetch) and still prints the all-chunks total. File: `product/apex/web/tools/build.ts`.
  - Do the same for desktop (lab: `initial()` in `product/apex/desktop/tools/build.ts`).
- **Favicon:**
  - Here (run), `/favicon.ico` returns 404 on web and desktop.
  - The lab has a titled provisional `src/app/icon.svg` (Next icon convention), copied and linked by the desktop build.
- **Proof fuel `notes`:**
  - The flow: list pages, idempotent create with server field errors, live WS patches, delete, debounced search, relative dates, plural count.
  - It runs on all three surfaces with identical code apart from elements. It is what found A2 and A7.
  - Files: `product/apex/*/src/{api/notes.ts,features/notes/**,components/notes.tsx,elements/{field,row}.tsx,types/notes.ts,stores/live.ts}`, `specs/*/schema/notes.ts`, `tests/notes.test.tsx`, plus `liveOf()` in `src/specs/deployment.ts`.
  - Measured in Chromium against the fake API: list 20 → more 40, create, server `taken` error voiced in ar and en, live push, delete, search 16, locale switch and reload persisted.

### A10. Do **not** port

| Lab change | Why not |
| --- | --- |
| `cache.open` ttl in ms | This repo's "no silent duration-unit conversion" is safer. Callers passing seconds would silently get milliseconds. |
| Arabic `pluralize` falls back to the singular for 3–10 | This repo's refusal (`a plural form is required`) is more honest. |
| `bytes` labelled KB | This repo's KiB is correct. |
| `socket.vocabulary` option | This repo's `api.connect` / `encodeFrame` / `presence` move is more complete. |
| Lab `net.deadline` | This repo's `budget` also covers token acquisition. |

---

## Part B — Production audit of this repository

Severity scale:

- **Critical:** blocks a production mobile, web or desktop release.
- **High:** wrong behavior, a security gap or a scale blocker that will be hit in a normal enterprise product.
- **Medium:** a defect or gap with a workaround.
- **Low:** polish.

Every item has an acceptance test that must fail before the fix and pass after.

### B-Critical

**B-C1. The engine assumes a full ECMA-402 runtime; Hermes does not provide one.**

- **Facts:**
  - The Hermes Intl document lists only `Collator`, `NumberFormat` and `DateTimeFormat` (plus the locale string helpers). That holds on `main` and on the exact Hermes V1 tag React Native 0.88.1 ships (`hermes-v260318099.0.5`, `doc/IntlAPIs.md`). On iOS, `NumberFormat` has no `notation: compact` or `signDisplay`.
  - The tag's code (corrected 2026-11-15; the first version of this item relied on the doc alone):
    - `lib/VM/JSLib/Intl.cpp` defines no `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `DisplayNames`, `Segmenter` or `formatRange`.
    - `NumberFormat.prototype.formatToParts` is defined only under `#ifndef __APPLE__` (`Intl.cpp:1295`), so it does not exist on iOS.
    - `DateTimeFormat.prototype.formatToParts` **is** implemented on both platforms (`Intl.cpp:985`, `PlatformIntlApple.mm:1979`, `PlatformIntlAndroid.cpp:534`), even though the doc omits it.
  - Engine use (read):
    - `Intl.PluralRules`: `number/src/plural.ts`. This feeds `number.category`, every `translate` plural and plural forms in `date`.
    - `Intl.RelativeTimeFormat`: `date/src/format.ts`, used by `date.relative` for non-ar/en locales.
    - `Intl.ListFormat` and `Intl.DisplayNames`: `translate/src/locale.ts`.
    - `formatToParts`:
      - `number/src/format.ts` (currency parts): absent on iOS, a real risk
      - `date/src/{zone,names}.ts` (`inTimeZone`, `zoned`, `offset`, names): present in Hermes V1, to be proven on the lane
    - `notation: "compact"` and `signDisplay`: `number/src/format.ts`.
    - `formatRange`: `translate/src/localize.ts`.
  - `selected()` in `plural.ts` constructs `new Intl.PluralRules` in both `try` and `catch`. If the constructor is absent, the fallback throws too.
  - Every engine proof runs on JavaScriptCore (Bun), which ships full ICU.
- **Risk:** plurals, relative dates, list formatting, display names, date ranges, compact and signed numbers, and iOS currency parts crash or degrade on the mobile surface (Hermes in RN 0.88.1, `sdks/.hermesv1version`).
- **Evidence:** doc, the Hermes V1 tag's source (read through the GitHub API) and the engine source. It was not executed on Hermes; no Hermes VM is installed on this box.
- **Fix:**
  - `adapter.capabilities()` gains an `intl` probe per API, plus option support: compact, signDisplay, formatToParts.
  - Each consumer declares a fallback:
    - a CLDR plural-rule subset for the shipped locales (the old hand-rolled `number.category` is a starting point)
    - offset arithmetic from `Intl.DateTimeFormat` resolved parts
    - English or code display names behind an explicit `unavailable` status
  - Alternatively, the mobile surface binds `@formatjs` polyfills at boot through a port, as a measured bundle cost.
  - Add a Hermes lane: build `hermes` from the RN 0.88.1 Hermes source tag, or run the portable test subset in an emulator, and run `tests/{number,translate,date,string}` under it.
- **Accept when:** the portable subset passes under Hermes V1, and a `capabilities().intl` snapshot is recorded per runtime.

**B-C2. A1 is still open here.** Async `port.with` leaks bindings across tasks. See Part A.

**B-C3. Credentials go to plain storage on every surface, and mobile has no secure or crypto adapters.**

- **Facts (run and read):**
  - See A3.
  - `product/apex/mobile/src/native/index.ts` binds only `rand.engine` (expo-crypto random), AsyncStorage, device, appearance and history.
  - Hermes has no `crypto.subtle`, so `crypto.seal/open/sign/verify/hmac/digest/hash`, sealed or signed `cache.open({ secret | sign })`, signed cookies and token verification all refuse with `unavailable` on mobile.
  - There is no `expo-secure-store` in the dependencies.
- **Fix:**
  - A3.
  - The mobile `src/native` binds a confidential driver: `expo-secure-store` for small secrets, with async access and an explicit unavailable or locked state.
  - Bind a `crypto.engine` subtle provider (e.g. `react-native-quick-crypto`, after measuring startup and size), or declare engine crypto unsupported on mobile and keep sealing server-side.
- **Accept when:** the mobile session persists through the confidential driver, `crypto.seal` round-trips on a device build, and a refused case shows a designed state.

**B-C4. No error boundaries in any surface.**

- **Facts (read):** a `grep` for `getDerivedStateFromError|componentDidCatch|ErrorBoundary` across `product/apex/*/src` and `engine/bun/src` returns nothing. One throwing feature render unmounts the whole screen, including nav and dialogs, on all three surfaces.
- **Fix:**
  - A twin `Boundary` in `src/app/` wraps each placed feature, inside `Placed` in `app/screen.tsx`.
  - It reports through `report()` with the feature name and renders a designed failed state with a retry that re-keys the feature.
  - On web, `app/error.tsx` and `global-error.tsx` cover the route level.
- **Accept when:** a feature that throws in render leaves nav and other features alive, logs once, and recovers on retry. Prove it on all three surfaces.

### B-High

**B-H1. A2 is still open here.** Revive loses the declared screen order.

**B-H2. Any write wipes every cached read (both).**

- **Run:** `probe/audit.ts` prints `[1,3]`. A `POST /b` dropped the cached `GET /a`.
- **Read:** `api/src/client.ts`, `sent()`, `.finally(() => { if ( write ) wipe(); })`.
- **Impact:** in an admin app each save refetches every list on screen, multiplying load and flicker.
- **Fix:** declared invalidation.
  - An endpoint's `invalidates: string[]` names features or tags. Reads carry tags (`feature` by default).
  - A write invalidates its own feature plus its declared tags.
  - `client.invalidate(tag)` stays public.
  - Keep the full wipe for identity changes only.
- **Accept when:** an unrelated write keeps the cache (`[1,2]`), a related write refetches, and an identity change wipes.

**B-H3. No 401 → renew → single replay (both).**

- **Run:** the probe sees one call and a thrown `expired`. After the provider holds a fresh token, nothing retries.
- **Read:** `auth.session` has a single-flight `renew`, but the client never consults it on 401.
- **Fix:** `api.create({ token, renew })`. On 401 for an `auth: true` endpoint:
  - await one shared `renew()` per bearer
  - replay once with the new bearer, never for unsafe writes without an idempotency key
  - surface `unauthorized` when renewal is refused
  - wipe owned caches when the bearer changes (already done)
- **Accept when:**
  - 5 concurrent 401s lead to 1 renew and 5 replays
  - a refused renew means no replay
  - a POST without a key is not replayed

**B-H4. Realtime has no resync contract after reconnect (both).**

- **Read:** `api/src/{live,realtime}.ts` and `socket/src/socket.ts` have no replay cursor, sequence or resync event. Frames missed while disconnected are lost, so subscribed lists go stale silently.
- After 8 attempts (the new default) the link stops. `socket` and `api/realtime` read neither `online` nor `visibility` (grep: no match), so nothing resumes it.
- **Fix:**
  - `live.subscribe(feature, handler, { resync })`, invoked after every reopen. Subscribers refetch; feeds call `refresh()`.
  - An optional server-supported `since` or sequence on join, with gap detection.
  - Resume the reconnect budget on `device` `online` and visible.
- **Accept when:** the fake server drops the socket, two notes are pushed while down, and on reopen the list contains both. After the budget is exhausted, going offline then online reconnects.

**B-H5. A4 is still open here.** UTC display by default.

**B-H6. Heavy work runs on the UI thread; there is no worker capability (both).**

- **Measured** (`probe/audit.ts`, Bun):

  | Work | Cost |
  | --- | --- |
  | `search.index` of 100k rows | 997 ms, 63 MB retained |
  | `query("customer 42")` over 100k | 113 ms |
  | `search.index.addAll` of 10k (bench) | 116 ms |
  | `validate.check` of 50k rows | 82 ms |
  | `crypto.seal`, cold | 111 ms (PBKDF2 210k) |

- Every one of these is a long task on the main thread (> 50 ms ruins INP), and on Hermes it is several times slower.
- **Fix:**
  - A new `worker` member (Part B §5): a port over Web Worker (web, the desktop renderer), with structured-clone messages, cancellation, a bounded pool and a sync fallback that declares itself. Hermes and React Native have no standard background JS thread, so on mobile the declared fallback (cooperative chunking, E5.5) is the default unless the fragment binds a native thread module, weighed by the phone criteria.
  - `search.index` and `query`, `json.fromCsv`, bulk `validate` and `seal` derivation gain worker-backed variants.
  - `search` postings move to typed arrays to cut the measured 63 MB / 100k (~630 B per row).
- **Accept when:** a 100k index builds off-thread with main-thread long tasks under 50 ms (Chromium trace), retained memory is at most 30 MB per 100k rows, and query p95 over 100k is under 16 ms.

**B-H7. No production observability (both).**

- **Read:**
  - There is no `traceparent` (W3C Trace Context) on requests; only `x-request-id` exists, so API traces cannot join client spans.
  - There are no web vitals (LCP/INP/CLS), no metric instruments and no span API.
  - `log` sinks never flush on `pagehide` (`sendBeacon`), so the last logs of a session are lost.
- **Fix:** a new `telemetry` member (§5). Bounded buffers, sampling, beacon flush, a traceparent injector bound into `net` through a port, web-vitals collection through `device`, and low-cardinality attributes. (The first version cited a "root/arch observability law"; no such law exists for this engine, since the tutor states observability only for `engine/rust` and `library/hyper`. This rests on product need.)
- **Accept when:** a request carries `traceparent`, a forced unload delivers the buffered logs (fake collector), and the buffer never exceeds its cap under a 10k-event burst.

**B-H8. No structured local store (both).**

- **Read:** web persistence is `localStorage` only: synchronous, about 5 MB and on the main thread. Mobile uses AsyncStorage only. There is no IndexedDB or SQLite driver and no query or index layer. Offline catalogs, drafts at scale and large caches are impossible.
- **Fix:** a new `store` member (§5) behind a port: IndexedDB on web and in the desktop renderer, with SQLite bound by the mobile vendor home or by the desktop host over RPC (the renderer has no `bun:sqlite`). Typed collections, secondary indexes, transactions, migrations, quota and eviction reporting, cursor iteration. It is a `cache` driver for large values and the base for `sync`.

**B-H9. No upload/download lifecycle (both).**

- **Read:** `net.request` has no progress events, no chunked or resumable upload, no pause or resume, and no streaming download with progress.
- **Fix:** a new `transfer` member (§5).

**B-H10. A5 is still open here.** CSV injection is unguarded by default.

**B-H11. Mobile navigation is not native-complete.**

- **Read:** `history.memoryAdapter("/")` is used and nothing in `product/apex/mobile/src` uses `BackHandler`. `Linking` appears only for external links. The Android hardware back button and incoming deep links are not wired to `history` or the spec.
- **Fix:** the mobile `src/native` binds a history adapter that consumes `BackHandler` and `Linking.getInitialURL/addEventListener`, mapped through `spec.match`.
- **Accept when:** Android back pops spec history and exits at the root, and a cold deep link opens the matched screen with its params.

**B-H12. The bundle budget metric is wrong, and the initial JS is heavy.**

- See A9.
- **Measured:** the hello-only web route ships 588,540 B raw / 185,430 B gzip of initial JS, and mobile Hermes is 3,327,399 B for one feature. Neither has a per-part composition report, so nobody knows how much is engine and how much is framework.
- **Fix:**
  - per-route initial JS budgets in gzip, with a composition dump (emit a bundle stats file or a source-map size report)
  - `expo export --dump-sourcemap` plus a module-size table for mobile
  - targets set from measurement, not guessed
- **Accept when:** each build prints initial gzip per route and the top 10 modules, and budgets fail on regression.

### B-Medium

- **B-M1. A6.** `box.keys()` lists expired entries.
- **B-M2. `state.feed.put/drop` is O(n) per call.**
  - Read: `put` maps the whole `items` array and calls `key()` per item. Measured: the `state.feed.put + drop` bench took 150 µs.
  - A 10k-row live list at 50 patches/s is 500k key calls per second and a new array each time, which re-renders every row consumer.
  - Fix: keep an `index: Map<key, position>`, patch in place with a version counter, and expose `rows` selectors per key for virtualized rows.
- **B-M3. A7.** Form rule codes have no engine voice.
- **B-M4. A8.** `world` mixes data and style.
- **B-M5. Pagination is page-number only (both).**
  - Read: the wire envelope paths are `meta.page/limit/total/pages`, while `state.feed` is cursor-based, so every surface converts.
  - Fix: add `next` (cursor) and `prev` paths to `api.wire.envelope` and `api.pageOf`, and make `feed.load` able to return the envelope's cursor directly.
- **B-M6. `crypto.seal` cold derivation costs 111 ms (measured, Bun).**
  - The cost is PBKDF2 at 210k iterations per secret per process, before any lane reuse. It suits user passwords, not machine keys.
  - Fix: accept a raw 32-byte key (or a pre-derived `CryptoKey` handle) and skip PBKDF2 for non-password material, then measure cold start on a device.
- **B-M7. Duplicated or ambiguous verbs (read, `tests/api.json`).**
  - `string.studly` duplicates `pascal`.
  - `translate.regionName` (Intl) and `world.regionName` (data) answer the same question differently.
  - `string.asciiDigits` overlaps `number.numerals(…, "latn")`.
  - `rand.isUlid`, `validate.ulid` and `value.ulid` all check ULIDs.
  - Search is split across `string.rank/grade`, `list.search`, `list.catalog`.search and `search`.
  - `tool.walk/readJson/writeJson` mirror `fs.*`; that is defensible only as a sync host-tooling contract, so state it in the member contract.
  - Fix: one owner per question, and the others delegate or go.
- **B-M8. The engine evidence runs on one runtime (both).**
  - Every engine proof runs on Bun/JSC. There is no browser or DOM lane and no Hermes lane (see B-C1).
  - The surfaces have no end-to-end lane in their gates. The lab's Chromium checks were manual.
  - Fix: a Playwright lane per surface against the fake API (boot, navigation, locale and theme, notes flow, offline banner), the Hermes subset lane, and a DOM lane for `device`/`history` web adapters.
- **B-M9. Lint warnings hide conditional assertions (both).** 194 `noConditionalExpect` warnings in `fuzz/*` (`fuzz/fs.test.ts` 28, `validate` 22, `cache` 20, `virtual` 17, …). A branch that never runs passes silently. Fix: assert on computed expectations (`expect(kind).toEqual(model ? a : b)`) and keep the rule at warning level until it reaches zero, then make it an error.
- **B-M10. Benchmarks are not evidence yet (both).**
  - They are single mitata runs, there is no baseline file and no regression gate. Measured noise on this box is ±2×.
  - Fix: `benches/baseline.json` per runtime, N≥5 interleaved runs, a median and dispersion, a gate only on stable scenarios, plus a nightly long soak (see §6).
- **B-M11. `number.ordinal` prints plain digits outside English.** This is honest but poor UX. See A9.
- **B-M12. `validate.check` failure path is 11× the success path** (measured: 13.7 µs vs 1.24 µs per row). Forms re-validate on every keystroke while invalid. Fix: lazy issue materialization (build messages only when read) or `compile` for hot forms.

### B-Low

- Favicon 404 on web and desktop (A9).
- `contracts.realtime: false` in every role, so the realtime path has no surface proof here (the lab's `notes` covers it).

---

## 4. DSL audit

### 4.1 Spec DSL (`engine/bun/src/spec`)

The spec DSL has these parts today:

- **Effects (14):** `set clear show hide enable disable emit call step confirm check refresh navigate when`
- **Hooks:** `load leave submit success failure change`
- **Values:** scalar or reference
- **Bindings:** read, write, data, signal

That is enough for static pages with simple reactions. It is not enough for the interactive screens of an enterprise admin or commerce product. Each gap below comes with a proposed shape (no `eval`), the owner and the proof required.

| Gap | Real need | Proposed shape | Proof |
| --- | --- | --- | --- |
| Computed values | Totals, "selected count", `price * qty`, string templates in titles | `Value` gains `{ fn: "sum" \| "count" \| "mul" \| "add" \| "concat" \| "format" \| "not" \| "min" \| "max" \| "round", args: Value[] }`. The function table is closed and compiled, depth- and size-bounded, and reference cycles are rejected at compile. | compile rejects unknown fns, depth > N and cycles; runtime results are table-tested |
| Debounce / throttle | Search as you type, autosave | `watch` and `trigger` accept `{ debounce: ms }` or `{ throttle: ms }`, bounded (≤ 10 s) and cancelled on unmount | fake clock; unmount cancels pending |
| Timers | Polling, "resend code in 30 s", auto-dismiss | `{ after: ms, do: Effect[] }` and hooks `every: { ms, do }`, owned by the mount | unmount clears; pause on hidden |
| Lifecycle hooks | Refresh on return, offline UX | *Corrected:* the mechanism exists: the `device` context namespace, `watch` and `runtime.patch`. What is missing is the binding that feeds device facts into the runtime (I1). After that, `watch: { "device.online": [...] }` covers online, offline and visible; `resume` needs a device event. | device fake emits; effects run once |
| Focus / scroll / announce | Accessibility after actions | effects `focus: "<id>"`, `scroll: "<id>"`, `announce: "<text key>"` routed to surface handlers | the surface handler receives the call; ids validated against blocks |
| Notify | Toasts and snackbars | `{ notify: "<text key>", tone, with }` emitted on a reserved topic the surface renders | topic emitted with resolved text |
| Optimistic write | Instant UI with rollback | `{ write: "<binding>", optimistic: Effect[], rollback: Effect[] }`, where rollback runs on failure or unknown outcome | the fake API fails the write; state returns |
| List operations | Cart lines, tags, rows | `append insert remove move toggle` on array paths, bounded size | path validation; bounds |
| Dirty guard | "Leave without saving?" | hook `beforeLeave` with `confirm`, wired to `history.guard` | navigation blocked until confirmed |
| Device actions | Copy, share, open external, download | effects routed to `device` (`copy share open download`) with declared capability checks | an unsupported capability is refused at compile from `platformShape` |

### 4.2 Engine DSL gaps (outside spec)

- **`api`:**
  - declared invalidation (B-H2)
  - `renew` on 401 (B-H3)
  - a cursor envelope (B-M5)
  - an optimistic mutation helper over `state` (stage, commit, rollback, with an unknown outcome distinct from failure)
  - typed upload endpoints delegating to `transfer`
- **`state`:**
  - O(1) keyed feed (B-M2)
  - `resource` stale-while-revalidate with focus and online refetch
  - an undo/redo history for form-like stores (bounded)
- **`form`:**
  - input masks (phone, money, date, card) owned by `validate` and `form`
  - field-array helpers exist; add async field dependency (`dependsOn`)
- **`translate`:**
  - ICU `select`/gender
  - nested plural inside params
  - A7
- **`date`:** A4; RRULE recurrence (schedules, bookings); business calendars.
- **`device`:**
  - push token registration and local notifications as one contract
  - background fetch status
- **`log`:** a flush on `pagehide`/`visibilitychange` through a beacon or `keepalive` (B-H7, I2). *Corrected:* the remote sink with backoff already exists (`log.batchSink`).

---

## 5. Is 37 members enough for large production? No

The current members cover building blocks well. They do not cover several capabilities that large web, mobile and desktop products need on day one. These should be new members, each with one owner and a place in the DAG below `api spec`. Each needs contract, failure, cancellation and bounded-resource proofs. That is a proposed acceptance bar: the tutor's Proof law today covers tests, coverage and fuzz only.

| New member | Owns | Depends on | Why it is not an extension |
| --- | --- | --- | --- |
| `worker` | Off-main-thread execution port: Web Worker on web and in the desktop renderer; pool, cancellation, transfer; a declared fallback (cooperative chunking) where the host has no worker, which is mobile by default | adapter, error, event | A host capability every CPU-heavy member needs (B-H6) |
| `store` | Structured local database behind a port: IndexedDB on web and in the desktop renderer; SQLite bound by the mobile fragment's vendor home (expo-sqlite) or by the desktop host over RPC. The engine never imports either. Collections, indexes, transactions, migrations, quota | adapter, error, json, validate | `cache` is key-value with TTL; this is query and transactions (B-H8) |
| `sync` | Offline-first replication: per-record revision, tombstones, push queue, pull since cursor, conflict hook (the product decides), resume after reconnect | store, queue, event, error | Different guarantees from `queue` (a single-owner outbox) and `cache` |
| `transfer` | Upload and download: chunked or resumable, progress, pause/resume, integrity hash, bounded concurrency, background on mobile through an adapter | net, crypto, worker, event | `net.request` is one-shot (B-H9) |
| `telemetry` | Spans, metrics, web vitals, traceparent propagation, sampling, bounded export, beacon flush | log, event, device | Production need (B-H7); not a tutor law today |
| `flag` | Feature flags and remote config: typed definitions, defaults, a cached snapshot **evaluated by the server**, kill switch, exposure events. No targeting rules on the client, since rules shipped to a client leak and can be bypassed | cache, validate, event | A product-independent mechanism every enterprise rollout needs |
| `media` | Images: decode, resize, compress, EXIF strip, placeholder hash, behind a port: canvas/OffscreenCanvas on web, and the mobile vendor home binds its image module. The engine never imports Expo | adapter, worker, fs | Upload pipelines and memory (a 4096² RGBA image is 64 MiB) |
| `table` | Headless data-grid model: sort, filter, group, aggregate, selection, column visibility/pinning/sizing, integrated with `virtual` and `search` | list, virtual, search, state | ERP and admin screens; today every feature would rebuild it |

These should be extensions, not members:

- query semantics: `state` + `api` (B-H2, B-H3, §4.2)
- Intl fallbacks: `adapter` capabilities plus `number`/`date`/`translate` (B-C1)
- masks: `validate` + `form`
- push and local notifications: `device`

The final count is in H4. The number is not the goal; each member must earn its place with a consumer (the `notes` fuel pattern) and a contract proof.

---

## 6. Performance and memory (measured)

### 6.1 Memory: no retained growth under churn

`probe/memory.ts` ran 200 warm-up rounds, then N rounds, with `Bun.gc(true)` twice before reading `heapStats().heapSize`:

| Workload (this repo) | Rounds | Retained |
| --- | --- | --- |
| `state.define` instance + subscribe/unsubscribe | 5,000 | 30 KiB (6 B/round) |
| `state.feed` refresh + abort | 3,000 | 35 KiB |
| `form.define` set + submit | 3,000 | 109 KiB (37 B/round) |
| `api.create` + cached call | 2,000 | 170 KiB (87 B/round) |
| `event.bus` subscribe/publish/unsubscribe | 20,000 | 30 KiB |
| `translate.dictionary` per call | 5,000 | 32 KiB |
| `spec.compile` + runtime mount/unmount | 500 | 45 KiB |

These figures are within allocator and JIT noise; no leak was found in these paths.

| Other memory and load figures | Value |
| --- | --- |
| Facade cold import | 132 ms; heap 3.1 MiB; RSS 46.5 MiB (Bun) |
| `world.load` all catalogs | 11 ms; 1.4 MiB retained. Data on disk 856 KB; assets 19 MB, shipped only by surface choice |
| Web, Chromium, hello route | median of 3 per mode, 2 alternating rounds: JS heap after forced GC ≈ 6.5 MB; FCP 120–132 ms (local static server) |
| Web CLS | 0.005 fresh and 0.005 for a returning en+dark user (the pre-paint works here; the lab's en+dark was 0.065) |

**Not measured, and required before claiming memory safety:**

- a long soak (1 h of live patches and navigation) with heap snapshots every 5 minutes
- repeated mount/unmount of every screen through the real renderer, on web and on device
- Hermes heap on a release build
- desktop renderer process tree on window close/reopen

### 6.2 Speed

The comparative microbenchmarks between this repo and the lab are inconclusive. They were single interleaved runs on a shared box, and group medians of lab/real fall within 0.8–1.4. The one systematic difference is the lab's `cache.box.keys`, about 27× slower by design (see A6). Neither version is faster.

These absolute hot paths matter for products:

| Path | Cost |
| --- | --- |
| `search.query` on 10k rows | exact 280 µs; two terms 794 µs; filter + boost 1.2 ms; offset 100 1.46 ms |
| `search.index` and `query` on 100k rows | 997 ms build; 113 ms per query |
| `validate.check` per row | ok 1.24 µs; fail 13.7 µs; compiled ×100 24 µs vs 150 µs plain |
| `api.call` (stub path) | ~114 µs per call, envelope and validation included (the lab's run read 68 µs, inside the ±2× noise) |
| `cache.box.signed` get/set | 268–303 µs (HMAC via WebCrypto per operation) |
| `state.feed.put + drop` | 150 µs (B-M2) |
| `crypto.seal` | 111 ms cold, 0.57 ms warm (B-M6) |

Targets to adopt, measured with N≥5 and reported with median and p95:

- UI-thread work under 50 ms per interaction on web, and the same on a mid-range Android release build
- `search.query` under 16 ms p95 over 100k rows (after B-H6)
- `feed.put` O(1) (after B-M2)
- `api.call` overhead excluding network under 50 µs p95

---

## 7. Surfaces (web, mobile, desktop)

Already strong here (read and run):

- twin file layout
- `stores/{bind,client}`
- lazy features
- translate-driven text and locales
- pre-paint appearance (`/appearance.js`, CSP-friendly)
- a desktop CSP with the exact WS origin
- 31/32/33 tests green

Gaps, in priority order:

1. **B-C4:** no error boundaries.
2. **B-C3:** mobile has no confidential storage and no crypto adapter.
3. **B-C1:** mobile Intl capability.
4. **B-H11:** Android back and deep links.
5. **B-H12:** budget metric and composition reports.
6. Realtime is off in every role (`contracts.realtime: false`). Turn it on with a real feature (port `notes`, A9) so `api.connect`/`live` gets surface proof.
7. **States:** surfaces render loading, failed and denied, but there is no offline banner or retry policy tied to `device` `online`. Add a twin `Offline` component bound to `device.watch("online")`.
8. **Desktop:** the 5 native tests cover the bridge contract only. Add window close/reopen, a navigation attempt to a remote origin, and an oversized RPC payload against the real host (Electrobun, packaged), per `tutor/library/electro` (isolation, RPC, origin allowlist).
9. **Mobile:** gates prove a JS bundle, not a release APK. Add a release build with startup, memory and frame numbers on an emulator, per `tutor/library/expo` (the phone criteria). It runs as a lab measurement outside CI: the tutor says "a store build is a release step, never a part of CI".

---

## Part C — Needs of real products (Zainlak panel, web, mobile) against the engine

### C0. Method

`/var/www/projects/zainlak/{panel,web,mobile}` are real Laravel-backed production clients: a multi-role admin panel (super, admin, vendor, delivery), a multi-tenant commerce and booking site, and an Expo app.

| App | Files studied (outside node_modules) |
| --- | --- |
| panel | 876 |
| web | 1,356 |
| mobile | 990 |

What was studied: the general mechanisms each app had to build or import. That means their `lib/std`, `lib/spec`, `api/core`, `hooks`, `stores`, `query`, `std` and `model` folders, their dependency lists, and their `issues.md`/`REMAINED.md`.

Brand, design, product names and copy were ignored.

Each row below is a capability one of these apps needed. The second column holds the evidence, read from those paths. The third is what this engine offers today, read from `tests/api.json` and the source. The verdict is **covered**, **partial** or **missing**.

The headline: each app rebuilt an engine of its own.

- The panel carries a 14-module `lib/std`, its own spec vocabulary (`lib/spec/types.ts`, 416 lines), its own resource engine (`features/engine`, 845 lines) and 6,008 lines of role schemas.
- The web app carries 48 `lib/std` modules and its own API DSL (`api/core`, 1,968 lines).
- The mobile app carries `std`, `model`, `query` and `store` layers.

Some of these overlap this engine. The rows below are where they do not.

### C1. Coverage matrix

| Need | Evidence in Zainlak | Engine today | Verdict | Owner and proposal |
| --- | --- | --- | --- | --- |
| **Resource screens: list, record form, detail, dashboard** | panel `lib/spec/types.ts`: `SpecRoute{table, form, detail, board, actions, realtime, relations, threads, except, scope, children}`; `features/engine/*` | `spec` composes opaque features; `Binding.list{sort, filter, page, limit, search}` only | **missing** | `spec`: a resource vocabulary (C2) |
| Table columns with typed display | `SpecColumn{type, display, path, options, currency, unit, href, align, sortable, optional, editable, need}`; displays counted in schemas: inline 114, dot 94, relative 34, badge, percent, bytes, money, rating, status… | none | **missing** | `spec.column` + a display registry the part renders |
| Tabs and filters bound to the list query, URL-synced | `SpecTab{filters}`, `SpecFilter`, `use-list-controls`, `use-sort-menu`, `use-faceted-search`, `price-facet`, `place-facet` | `history.patchQuery` exists; no list-state ↔ URL binding | **partial** | `state.query`: a typed list state (filters, sort, page, search) with two-way URL binding through `history`, debounced and validated by a schema |
| Server-declared list capabilities | web/mobile `issues.md`: `meta.supports.filters`, `facets.type` in list replies | `api.pageOf` reads page meta only | **missing** | `api.wire.envelope` gains `supports` and `facets` paths; `api.listOf(reply)` returns `{ rows, page, cursor, supports, facets }`; the spec checks filters against `supports` at runtime |
| Bulk selection and bulk actions | `SpecTable.selectable`, `SpecActionScope = row \| page \| record \| bulk`; web `trash()` with `removeMany` / `restoreMany` | none | **missing** | `state.selection` (keys, all-matching flag, bounded) plus `spec.action{scope}` |
| Prompt actions (an action with its own form) and download actions | `SpecAction{kind: link \| call \| prompt \| download, fields, confirm, expect, follow, body}`; panel `use-download` (blob, filename) | `spec` `call`/`confirm`; no prompt, no download | **missing** | `spec.action{prompt: fields}`; `api` download endpoints returning `{ blob, filename, type }` parsed from `Content-Disposition` (RFC 6266), which a cross-origin web call can read only when the server exposes it (H2) |
| Field types for forms | schemas count: number 186, text 109, select 104, boolean 95, **remote 92**, switch 61, textarea 32, datetime 29, date 21, phone 19, tags 17, url, email, image 13, rating 11, entity, json, code, segmented, daterange 7, time, money, **editor 5**, bytes, multiselect, pairs, color… | `validate.fields` and `rules` (Laravel dialect); `form` holds values | **partial** | `spec.field` types compiled to validators and to part element kinds; `remote` options (below) |
| Remote option sources, dependent selects | `SpecField{source, sourceKey, sourceLabel, filters: Computed}`; panel `loaders.ts`; 92 remote fields | none | **missing** | `spec.field{source: "<feature.endpoint>", key, label, filters: {field: "form.parent"}}`, compiled against the catalogue, with debounced search, cached pages and a refetch when a dependency changes |
| Computed and conditional field state | `Computed<T> = T \| (ctx) => T` for title, options, default, value, required, disabled, hidden; `showWhen`; `derivedOf` | `when` conditions; no computed values | **partial** | the closed expression table (Part B §4.1) |
| Repeaters and translatable fields | `SpecField{repeat, fields, multiLang}`; panel `issues.md` B6 (translations with empty fields) | `form.rows` (arrays) exist; no per-locale field groups | **partial** | `spec.field{repeat}` → `form.rows`; `spec.field{locales: true}` expands to one value per `surface.locales`, validated per locale with a "complete in N of M locales" status |
| Relations: attach, detach, nested lists | `SpecFormRelation{attach{source, key, detach}, parent}`; `SpecRoute.relations` | none | **missing** | `spec.relation` bound to endpoint families (C3) |
| Dashboards: stat, goal, compare, chart, list, table cards; periods | `SpecCard`, `SpecFact`, `use-analytics` (`Period`, `statisticsOf`), recharts in the panel | `number.change` and percent; no series model | **missing** | `spec.board` + a `series` capability in `date` + `list`: bucket by period with time-zone-correct boundaries, fill gaps, compare with the previous period, aggregates; the chart renders in the part |
| Onboarding tasks and checklists | `SpecStep{done}`, `SpecTask{source, filters}` | none | **missing** | a `spec.board` card kind `steps` with `done` as a condition |
| CRUD endpoint families | web `api/core/dsl.ts`: `browse(list, suggest, view)`, `trash(remove, restore, removeMany, restoreMany)`, `engage(verbs)`, `document(resource)` | `api.feature` + `get/post/put/patch/del` | **partial** | `api.resource(base, key, item, { verbs, bulk, trash, suggest })`: one call yields a consistent family with caching and invalidation tags, and is the binding target of C2 |
| Mutation-scoped invalidation | web `api/core/invalidation.ts`: `onMutation(feature)`, `invalidate(feature)` | any write wipes all (B-H2) | **missing** | B-H2 |
| Session rejection as an event | web `onSessionRejected/rejectSession`; `use-auth-error` | none (B-H3) | **missing** | B-H3, plus `auth.session` emitting `rejected` |
| Persisted server-state cache, offline reads | mobile `@tanstack/react-query-persist-client` with MMKV, `query/saved.ts`, `useReachable` (NetInfo) | the api client cache is in-memory only | **missing** | the api client cache optionally persists to a `cache` box (per bearer and tenant, versioned, size-bounded) and rehydrates stale data marked `stale` until refetched |
| Realtime over Pusher / Laravel Reverb | panel and web: `laravel-echo` + `pusher-js`; web `api/core/realtime.ts` (private and presence channels, `auth` signature); mobile `useRealtime(channel, event, kind)` | `api.connect` with a protocol object; house protocol only | **covered (the mechanism)** | *Corrected:* no vendor protocol ships in the engine. A product on Pusher passes its own protocol object to `api.connect({ protocol })`. The engine owns only the protocol interface and its proof against a fake, and GunX's own backend speaks the house protocol. |
| Chat: typing, presence, edit, forward, reports, reverse history | web `use-chat-{messages,typing,presence,room,search,contacts}` (378 lines) | `presence` (api), `state.feed` forward only | **partial** | `state.feed{direction: "backward"}` for older pages with scroll anchoring plus client ids for optimistic sends and dedupe on echo; a throttled `emit` helper for typing |
| OTP, countdowns, expiring offers with server time | web `use-countdown`, `use-expiry`, `otp-step`; web `issues.md` #5 (`retry_at` without offset) | `date.clock`, no shared ticking signal, no server clock | **missing** | `date.ticker(ms)`: one shared, visibility-aware signal per interval. `net`/`api` estimate the server clock offset (bounded and smoothed), and `date.now` can use it. On a cross-origin web call the `Date` header is invisible unless the server exposes it (H2), so the envelope should carry a `meta.now` path as the primary source. |
| Booking availability and opening hours | web `use-booking-slots`, `use-availability`, `stay-quote`; mobile `std/date-range.ts` (nights, spans); issues #16–17 (flexible ± days) | `date.range/span/grid` | **partial** | `date.interval`: overlap, merge, subtract and split by step in a time zone, DST-safe; weekly opening-hours rules → slots; flexible date windows |
| Phone numbers per country | web `libphonenumber-js` (`providers/phone.ts`: country, international, valid, typed); mobile `std/identity` (e164, dial) | `validate.phone` (regex after `value.phone`); `world.dialings` | **partial** | numbering-plan metadata per country (lengths, mobile ranges, national prefix, formatting) in `world` data; `value.phone` parse/format/validate by country; measured bytes lazy per region |
| Password policy and strength meter | mobile `std/password` (rules, met, strong) | `validate.password(min, max)` | **partial** | `validate.policy{length, classes, banned, notEqual}` returning per-rule results for a UI meter |
| Rich text editing and safe HTML | panel `@tiptap/*` (5 editor fields: articles, pages, FAQ); web renders that HTML | `string.escapeHtml` only | **missing (security)** | a `rich` member. Untrusted HTML **in** → an allow-listed document tree (JSON) **out**: tags, attributes, URL schemes, `rel` on links, a size and depth cap, and plain-text extraction for SEO and search; fuzzed against XSS corpora. *Corrected:* the engine never emits HTML (Runtime law); the parts render the tree, and the editor UI stays in the part. |
| Media: image pick, crop, resize, compress, gallery order | mobile `expo-image-picker`, `std/picture.ts` (responsive rungs); web `use-avatar-editor`; panel `issues.md` B5 (order images, promote main) | `fs.imageSize`, `device.pick` | **missing** | `media` (Part B §5): resize, compress, EXIF strip, responsive `srcset` rungs from width breakpoints |
| Uploads with limits and progress | web `api/core/client.ts` `UploadLimits`; ticket attachments (panel B10); identity verification documents | `net.request` one-shot | **missing** | `transfer` (Part B §5) + `api` multipart endpoints declaring limits that the client checks before sending |
| External handoff: OAuth, payment 3DS, identity verification | web `use-social-sign-in`, `linked-accounts`, `subscription-pay`, `wallet-deposit`; mobile `store/payment.ts`, `expo-linking`; issues #20 (payment intents beside data) | none | **missing** | one `handoff` mechanism in `history` + `device`: open an external URL or in-app browser with a `state` nonce and PKCE (`crypto`), await the return deep link or `postMessage`, verify `state`, then poll a status endpoint with a deadline. OAuth, 3DS and KYC are each a configuration of it. |
| QR and barcodes | web issues #10 (order QR); booking and ticket check-in | none | **missing** | `media.qr(text, { level })` returns a module matrix; the part draws it. *Corrected:* no SVG from the engine. A scan capability goes through `device.media`. |
| Push notifications end to end | mobile `expo-notifications`, `store/push.ts`; web issues #22 (browser push refused) | `device.pushToken`, `notify`, `badge` (contract) | **partial** | the contract exists; the parts bind no adapter (web has no service-worker push, mobile has no `expo-notifications`). Add a `device` push lifecycle: permission → token → register through the api → token rotation → foreground/background routing to `history` |
| Observability | web `lib/observe/{browser,server}.ts`: beacon queue, global error capture, call outcomes, `onRequestError`, signal receiver | `log` sinks | **missing** | `telemetry` (Part B §5) plus global `error`/`unhandledrejection` capture with dedupe and rate limits |
| SSR data and server execution | web `api` `execution: server \| client`; `site/request.ts` (`requestHost`, tenant from host, forwarded client IP, trace) | `api.create` is runtime-agnostic | **out of scope (retracted 2026-11-15)** | Server execution, request-scoped contexts and forwarded-IP reading are backend work, and they contradict E1. The web fragment is a static export (`force-static` routes, no middleware). If a server edge is ever decided, it lives in the web fragment, never in the engine. |
| Multi-tenant by host | web `resolveTenant(host)`, `X-Tenant-Domain` | ambient `tenant()` getter | **covered** (the mechanism) | a host → tenant resolver belongs to the product |
| Copy, share, clipboard, hotkeys, media queries | panel `use-copy`, `use-hotkey`, `use-media`; web `share` | `device.copy/paste/share/hotkeys`, `watch(size, motion, contrast)` | **covered** | — |
| Leave guard | panel `use-leave-guard` | `history.guard` | **covered** | the spec dirty-guard hook (Part B §4.1) |
| Coalesced refresh and debounce | panel `use-coalesced`, `use-debounced` | `func.debounce/throttle` | **covered** | spec `debounce` (Part B §4.1) |
| Calendars, emoji, flags, countries, currencies | web `react-day-picker`, `frimousse`; mobile `std/{color,number}` | `date.grid/hijri/weekStart`, `world` catalogs | **covered** | — |
| Money, wallets, allocation | web `wallet-{deposit,transfer,withdraw}`, `price-summary`; mobile `model/wallet` | `value.money` (allocate, convert, format) | **covered** | — |
| Virtual lists and carousels | panel and web `@tanstack/react-virtual`, `embla`; mobile `flash-list` | `virtual` | **covered** (math) | — |
| SEO graph for entities | web `lib/seo/{graph,product,metadata}` | `seo.jsonLd/product/organization/breadcrumbs` | **covered** | locale-prefixed URLs are still open (Part B, H12 of the first review) |

### C2. The resource vocabulary the spec needs

Admin and back-office products are lists, records, actions and dashboards over API resources. Zainlak's panel shows the shape. Today every surface must rebuild it; here 845 lines of resource engine sit beside 6,008 lines of schemas.

The engine should own the **declarative contract and its compile-time checks**. The parts own only rendering.

```ts
spec.resource({
    name: "orders",
    endpoints: "orders",                                   // an api.resource family in the catalogue
    table: {
        columns: [spec.column("ref", { display: "code", sortable: true }), spec.column("amount", { display: "money", currency: "currency" }), spec.column("status", { display: "badge", options: "order.status" }), spec.column("created_at", { display: "relative" })],
        tabs: [{ key: "open", filters: { status: "open" } }],
        filters: ["status", "vendor", spec.filter("created_at", { kind: "daterange" })],
        search: true, selectable: true, page: 25, realtime: "orders",
    },
    form: { sections: [{ key: "main", fields: [spec.field("vendor", { type: "remote", source: "vendors", label: "name" }), spec.field("notes", { type: "editor" })] }] },
    actions: [spec.action("refund", { scope: ["row", "record"], prompt: [spec.field("reason", { type: "textarea", required: true })], call: "orders.refund", confirm: true, need: "orders.refund", when: "record.status=paid" })],
    board: [spec.card("revenue", { kind: "chart", series: "orders.revenue", period: "month", compare: "previous" })],
});
```

Compile-time rejections, each with a path and the nearest valid name:

- a column, filter or sort that is not in the endpoint's output or input schema
- a `remote` source with no list endpoint, or a `label` that is not a field of its item
- a display or field type with no registered renderer in the part (`platformShape`)
- an action `call` with no matching write endpoint, or a `prompt` field missing from that endpoint's input
- a `need` that is not a declared grant
- a `when` that reads an unknown path
- a `realtime` topic nothing emits
- an empty set of translatable locales

The runtime keeps one list state per mount:

- query, selection and pages
- bound to the URL through `history`
- debounced
- invalidated by the family's tags
- patched by `live`

Proof: compile one role against a fake catalogue, then render the same compiled resource through the three parts with a Playwright flow (filter → page → select → bulk → prompt action → realtime patch).

### C3. API DSL additions shown necessary

- `api.resource(base, key, item, opts)`: the families listed in C1 (list, suggest, view, create, update, remove, restore, bulk), with consistent cache tags.
- An envelope with `supports` and `facets`; `api.listOf`.
- A download contract: a blob, `filename` parsed from `Content-Disposition` (RFC 6266 with `filename*`, exposed through CORS, H2), a size cap and progress through `transfer`.
- Multipart upload endpoints with declared limits (bytes, count, MIME types) checked before sending.
- `invalidates` tags (B-H2); 401 renew and replay (B-H3); a `rejected` session event.
- A persisted cache option. (The SSR request context first proposed here is retracted; see the C1 row.)
- The `api.connect` protocol interface, proven with a fake. Vendor protocols are supplied by the product (C1, corrected).

### C4. Updated member list, decided from real needs

Zainlak's dependencies and folders back some of the Part B §5 members directly; the rest stand on Part B's scale findings:

| Member | Backing |
| --- | --- |
| `transfer` | Upload limits, attachments, identity documents |
| `telemetry` | `lib/observe`: beacon queue, global error capture |
| `media` | Image picker, avatar editor, picture rungs, gallery order |
| `table` | The panel's resource tables |
| `store` | Mobile's MMKV-persisted query cache |
| `worker`, `sync`, `flag` | Not seen in Zainlak. They rest on Part B (B-H6, offline-first scale, rollout control). |

Part C adds:

| Change | Kind | Why |
| --- | --- | --- |
| `rich` | **new member** | Untrusted HTML in → allow-listed document tree out. A security owner; nothing in the engine sanitizes HTML today, and the engine never emits HTML. |
| `handoff` | extension of `history` + `device` | One external round-trip mechanism for OAuth/PKCE, payment 3DS and KYC |
| `series` | extension of `date` + `list` | Time bucketing and period comparison for dashboards |
| `interval` | extension of `date` | Interval algebra, opening hours, slots, flexible windows |
| `ticker` and server clock offset | extension of `date` + `net` | Countdowns that agree with the server |
| `query` list state + `selection` | extension of `state` | Lists bound to the URL; bulk selection |
| phone numbering plans | extension of `world` + `value` | Parity with what `libphonenumber-js` gave the web app |
| password `policy` | extension of `validate` | Rule-by-rule results for strength meters |
| `qr` | inside `media` | A module matrix for codes; the part draws it |
| push lifecycle | extension of `device` | Permission → token → register → rotate → route |

New members: `worker store sync transfer telemetry flag media table rich` (and `control`, F5). The final count is in H4. Each still needs a consumer feature and a contract proof before it lands.

### C5. Acceptance for Part C

Port two flows from Zainlak, built only with the engine and the twin parts against the fake API (extend `/var/www/projects/gunx-lab/fakeapi`):

1. **The orders resource of the panel:** table, tabs, filters, URL sync, bulk restore, prompt refund, download invoice, realtime patch, dashboard card.
2. **The booking flow of the site:** availability by date window, slots in the venue's zone, OTP with a server-synced countdown, payment handoff with a 3DS return, push registration.

Each flow must:

- need no surface-level mechanism beyond elements and components
- compile with the C2 checks
- pass Playwright on web and desktop and the native harness on mobile
- report bundle, heap and long-task numbers next to the hello baseline

## Part D — Deeper pass: gaps not covered above

This pass read Zainlak file by file:

- web: `lib/std` (48 modules), `api/core`, `api/workflow`, `lib/site`, every hook name
- panel: `lib/std`, `features/{engine,permissions,shell,record}`, `utils/i18n`
- mobile: `std`, `model`, `query`, `store`, `features/boot`

New probes are `probe/encode.ts` (query and form encoding) and `probe/arabic.ts` (Arabic search). Both ran on this repo and on the lab with identical results, so every item below applies to **both**. Nothing here restates Parts A to C.

### D-High

**D1. Nested query and form encoding loses or mangles data (run).**

`probe/encode.ts` printed:

| Call | Result |
| --- | --- |
| `parse.queryString({ items: [{…}], filters: { status: [...] }, flag: true })` | `flag=true`. `items` and `filters` are **silently dropped.** |
| `net.withQuery(url, { filters: { status: ["open","paid"] }, sort, page })` | `?page=2&sort=-created_at`. The filters are dropped. |
| `api` GET with a nested `filters` input | `?filters={"status":["open"]}&page=2`. JSON inside the query, unlike `net`. |
| `fs.formData(…)` | `items[]={"id":1,"qty":2}&filters={"status":[…]}`. JSON strings inside multipart. |

Laravel and Rails backends (Zainlak: `filters[feature]=wifi`, `meta.supports.filters`) expect `filters[status][]=open` and `items[0][id]=1`. A list filter written by a feature never reaches the server, and nothing fails.

**Fix:** one encoder owner.

- `parse.queryString(value, { style: "brackets" | "indices" | "repeat" | "comma" | "json" })` and its inverse in `parse.query`.
- A value it cannot encode is **refused with a fault, never dropped**.
- `api.wire.query` selects the style per backend, and `net.withQuery` and `fs.formData` use the same encoder. Multipart puts files at nested paths (`items[0][photo]`).

**Accept when:**

- the probe prints `filters[status][]=open&filters[status][]=paid&page=2&sort=-created_at` in brackets style
- round-trip fuzz (`parse.query(parse.queryString(x)) ≡ x` for JSON-safe trees) passes for every style
- a function or symbol value faults

**D2. No step-up authentication protocol (read).**

Zainlak web has `use-sign-in-lock`, `use-confirmation` and `std/contact-verification`. The server answers a sensitive call with "proof required" (a password, or an OTP `confirm_code` plus `retry_at` / `expires_at`). The client asks, then replays the same call with the proof. The engine has no such contract, so every surface rebuilds it.

**Fix:**

- The wire declares a challenge reply (code, kind, `retry_at`, `expires_at` paths). The client turns it into a typed `challenge` fault carrying a `prove(proof)` that replays the original call once, with the same idempotency key.
- `auth.challenge` mirrors the state the server declares: `requested → sent → verifying → verified | locked`, the resend cooldown (`retry_at`) and the attempts left. The client never enforces a lockout or a limit of its own; the server owns both.

**Accept when:** a write answered with a challenge replays exactly once after proof, never without one; an expired challenge refuses; the cooldown blocks resend.

**D3. `auth` has no deny precedence and no delegation ceiling (read, security).**

- Zainlak's panel edits a tri-state permission matrix (allowed, denied, inherited) with workspace and role scopes (`features/permissions/use-permissions.ts`).
- Its `issues.md` B12 is a privilege-escalation report: a team member created on a vendor surface became a tenant administrator.
- The engine's `auth` is allow-only abilities with wildcards (`can`, `expand`, `granted`, `missing`).

**Fix:**

- `auth.policy({ allow, deny, inherit })`, where explicit deny beats any allow and wildcard.
- `auth.assignable(holder, wanted)`, which returns only what the holder may grant. The UI uses it as a guard; the server still enforces.
- A catalogue reader that maps the server's ability tokens to resource × verb rows as data, so the parts render matrices without hard-coded names.

**Accept when:** a deny on `orders.refund` wins over `orders.*`, and `assignable` never returns an ability the holder lacks, tested with fast-check over random policies.

**D4. No coordinated scope switch (read).**

Zainlak switches workspaces (`use-workspaces`: active, unpaid, expired), restores sessions (`useSession.restore`), and changes locale and currency at runtime.

The engine keys its api cache by tenant and wipes it on a bearer change. Nothing else moves together:

- in-flight requests from the old scope can still land
- `live` keeps the old rooms
- persisted `state` stores are not namespaced by user or tenant
- `feed` and `resource` have no scope guard

That is the cross-tenant leak path the part law forbids ("a late response cannot overwrite … another tenant's state").

**Fix:** one scope epoch, a signal of `{ user, tenant, locale, currency }`, owned by `auth` (identity and tenant), with locale and currency joining it through their own ports. One owner: `adapter` stays the host reader only.

- `api` aborts and discards old-epoch flights.
- `live` leaves and rejoins its rooms.
- `state.define` persistence takes a scope prefix.
- `feed` and `resource` drop old-epoch completions.

**Accept when:** switching tenant mid-request shows no row from the old tenant, live rooms are rejoined, and persisted stores read the new scope's keys.

### D-Medium

**D5. No runtime settings overlay on a compiled spec (read).**

Zainlak web `lib/site/settings.ts` narrows the build's locales, currencies and themes to what the tenant enabled on the server, picks the defaults through a fallback chain, and gates the whole site behind `maintenance` plus a message. The engine compiles specs at build time and has no validated runtime layer.

**Fix:** `spec.overlay(compiled, settings)`, restricted to declared knobs:

- subsets of `surface.locales`, currencies and themes
- feature enable or disable
- a maintenance gate with a message key

It is validated by a schema, and the runtime recomputes `menuOf` and `opens`. No code and no new screens.

**D6. No runtime contract and no per-operation wire (read).**

Zainlak web `api/core/{wire,resolve,pack}.ts` gives every operation its own request and response wire (headers, envelope paths, empty replies allowed, enabled or not), resolved against a server-published contract. A packed form interns the duplicate tables before shipping them to the browser. Zainlak mobile reads `GET /contract` (capabilities, limits, password policy, realtime settings).

The engine has one `api.wire` per client and a static catalogue, and `api.openapi` only exports.

**Fix:**

- an endpoint-level `wire` override
- `api.contract(json)`, which validates a server catalogue against the local endpoint ids, disables refused operations and applies limits
- a packed, interned serialization for shipping

**D7. Retracted (2026-11-15): tolerant decoders for PHP/Laravel payloads.**

This item proposed `validate.dict` (mapping PHP's `[]` to `{}`) and a scalar-money `fromJson`. Those accommodate one vendor's encoding quirks and would carry a backend's habits into the engine. GunX's own backend speaks the house envelope.

A product on another backend adapts the payload in its own wire layer (an `api.wire` override in the fragment), or the backend fixes its encoding. `value.decimal` already reads numeric strings.

**D8. Arabic search misses definite-article forms (run).**

`probe/arabic.ts` shows `string.fold` normalizes alef forms, ta marbuta, alef maqsura, tatweel and diacritics correctly. But `search.query("امل")` does not find `مدرسة الأمل`. There is no light stemming, so the article and the clitic prefixes (ال، وال، بال، لل، كال) block prefix recall. This matches Zainlak web `issues.md` #3 (geo prefix suggestions).

**Fix:** `search.index({ analyzer })` with per-locale analyzers. For Arabic: article and clitic stripping, optionally light suffix stems.

**Accept when:** a recall/precision table on a fixed Arabic corpus is committed, and the query above matches.

**D9. No undoable actions (read).**

Zainlak panel's bulk trash and chat delete show "undo" in the toast, which restores through a compensating call (`features/chat/use-chat.ts`, the table bulk `settle(…, undo)`). There is no contract for it.

**Fix:** `spec.action{ undo: "<restore call>", window: ms }`, bound to the `api.resource` trash family. The runtime keeps the undo handle for the window, per mount, and expires it.

**D10. No command registry (read).**

Zainlak panel's shell opens a `mod+k` palette over screens, actions and records. The engine has `spec.menuOf` and `search` but no registry.

**Fix:** `spec.commands(compiled, context)`, which derives searchable commands (screens, actions, recent) filtered by grants and `when`. The parts render them.

**D11. The spec has no navigation topology and no safe return (read, partly security).**

Zainlak mobile's routes use groups and presentations: `(auth)`, `(tabs)`, stacks for catalog, order, payment, room, ticket and wallet, and sheets (`components/*-sheet`). Zainlak web validates `?next=` targets (`std/url.ts` `safeReturn`). The spec's screens are flat paths plus a menu.

**Fix:**

- screen `presentation: "tab" | "stack" | "modal" | "sheet"`, `group`, `back`
- a guard redirect that carries a return path, validated as same-origin and on a declared screen (open-redirect safe)
- the parts map presentations to their navigators

**D12. No boot orchestration (read).**

Zainlak mobile `features/boot` orders fonts, session restore, i18n start, the splash hold until ready, a minimum launch time, the deep-link entry, realtime and the query provider. It also reloads the app when the native text direction flips (`I18nManager.forceRTL` plus `reloadAppAsync`). In these parts, `boot()` is a synchronous bind.

**Fix:** a boot task graph `{ name: { run, needs, deadline, required } }`, owned by `event` (a readiness signal over the graph), with deadlines from `func`. *Corrected owner:* not `adapter`, which by the Host-free law only reads the host.

- It exposes a readiness signal and per-task status, with timeouts that degrade or fail as each task declares.
- The parts hold splash or pre-render until ready.
- A declared direction policy decides between per-view layout direction and a native-wide reload through `device.reload`.

**D13. Rich messages in translations (read).**

Zainlak web `std/text.ts` parses markup tags inside messages (`MarkupTag`, `MarkupNode`), for sentences like "<b>{name}</b> invited you". `translate` returns plain strings only.

**Fix:** `translate.rich(key, params)` returns a token tree with named tags only. It never returns HTML. The parts map each tag to an element.

**D14. Notification inbox consistency (read).**

Zainlak's panel `features/shell/use-notifications.ts` is 439 lines (corrected from 389; the file has been unchanged since 2026-10-04). With the web's `use-notification-bell` and the mobile's `query/notifications`, they keep an unread count consistent with pages, realtime arrivals, optimistic mark-read, mark-all and the badge. Zainlak panel `issues.md` B4: deleted notifications stayed in counts.

**Fix:** a generic counted feed, `state.feed({ count })`, with no "inbox" or "notification" noun in the engine (corrected):

- the count and pages reconcile on every patch
- mark-read is optimistic, with rollback
- the badge is driven through `device.badge`
- reconciliation is cross-tab

### D-Low

| Item | Zainlak evidence | Fix |
| --- | --- | --- |
| **D15.** Owned object-URL previews | panel record drafts call `URL.createObjectURL` and revoke on unmount | `fs.preview(file)` returns `{ url, release }`, owned by the mount; a leak test after repeated mount/unmount |
| **D16.** Recent lists | mobile `useRecentCatalogs/Categories`; 23 files mention recent | `cache.recent(box, key, { max, ttl })`: persisted, deduped, move-to-front |
| **D17.** Day sections | mobile `std/number` `dayKey/byDay`; web `format.dayBucket` | `date.bucketOf(value, { now, zone })`: a stable key (today, yesterday, this week, date) plus a label through `translate` |
| **D18.** Range-facet histograms | web `std/listing` `priceEdges/priceBuckets` | numeric range facets in `search` with nice edges from `number` |
| **D19.** Voiced change summaries | web `std/amendments` `reviewableChanges/changeText`; panel B13 audit log | `translate.changes(json.diff(a, b), fields, t)` → readable field-level lines |
| **D20.** *Retracted:* social links and share intents | panel `std/social` (12 providers, share targets) | A provider list is product data, not engine work. The generic part already exists: `device.share`, falling back to `device.copy` of the link. |

### D-Evidence for earlier findings

- Zainlak mobile `src/std/plural.ts` exports `installPluralRules`, which installs a `PluralRules` when Hermes has none. That app runs React Native 0.86.2 / Expo 57. The Hermes V1 source of React Native 0.88.1 still defines no `PluralRules` (corrected B-C1), so B-C1 holds.

## Part E — Final pass: frontend-only boundary, ownership, DSL coherence, speed, memory, security

Date: 2026-11-15. The engine source is unchanged since the 2026-11-14 snapshot (`rsync -c`: no difference under `engine/bun`), so every result below holds for this tree. Nothing here restates Parts A to D.

New probes, outside the repo, each taking the engine root as an argument:

- `probe/final.ts`: hot paths, deep JSON, prototype pollution, navigation and open guards, form keystrokes
- `probe/freeze.ts`: how an api reply's cost splits, history parsing
- `probe/leak.ts`: bearer containment and path templates
- `probe/closure/build.ts`: member closures with and without their server and tool parts. It uses `Bun.build` for the browser, minified, with splitting, counting the entry output only, the same way `tests/size.json` does.
- `probe/bundle.sh <bundle>`: marker strings in a shipped bundle

Bundles inspected:

- the snapshot's own gate builds (`real-snap/product/apex/{mobile/dist,web/out,desktop/dist}`, 2026-11-14 22:34, Hermes 3,327,399 B)
- one Android export with Expo's unstable tree shaking switched on

### E1. The engine carries server and tooling code, and the phone ships it (measured) — Critical

The surfaces import 19 of the 36 members, and `tool` only from build scripts. None of the code below has a consumer in `product/apex/*/{src,tools}` (grep):

| Code | Member | What it is | Where it belongs |
| --- | --- | --- | --- |
| `hashPassword verifyPassword needsRehash` (PBKDF2-SHA256, 600k rounds, 68 lines) | crypto | password storage | the server. A client sends the password over TLS and never stores or checks a hash. Delete. |
| `signToken verifyToken` (HS256, 156 lines) | crypto | issuing and verifying tokens with a shared secret | the server. A client that holds the HMAC key can mint tokens. Only claim decoding stays, and it moves into `auth`. |
| `signCookie unsignCookie headerCookies` | cache | cookie signing and a jar over the request `Cookie` header | the server. A browser cannot write `HttpOnly` cookies and has no secret to sign with. `documentCookies parseCookies serializeCookie` stay for non-sensitive client cookies. |
| `limiter` (95 lines, 10k buckets) | cache | per-identity quota | server rate limiting. Client pacing is `func.throttle`/`lane`. |
| `forwardedFor facts` (X-Forwarded-For / X-Real-IP trust, request facts) | net | reading an incoming request | the server. The web surface is `output: "export"` by default and has no request to read. |
| `securityHeaders contentSecurityPolicy` | net | response headers | build tooling: the desktop `index.html` CSP, a host's config. |
| `address.ts` IP fence (`isAddress isLoopback isPrivateAddress`, 282 lines) and the `guarded`/`policy` redirect fence | net | SSRF defence | the server. In a browser, `redirect: "manual"` yields an `opaqueredirect` with no readable `Location` (Fetch standard), so `guarded` refuses every redirect and its hop logic never runs. `api.address`'s release check needs only a small private-host test. |
| `disk` (31 verbs: `walk glob temp withTemp writeAtomic copy move …`, a POSIX errno map) and `path` (26 verbs) | fs | a filesystem | tooling; no surface binds `fs.disk`. The `file` half stays as the runtime member: Blob/File, MIME sniffing, limits, data URIs, slices, `formData`, and the file-name helpers `basename extension stem withExtension safe`. |
| `answer refuse paged`, `error.toEnvelope` | api, error | writing server replies | the test kit (stubs and the fake API) |
| `openapi transportIssues` | api | contract export and contract lint | build tooling |
| `fakes sample stub` and the member `fake` | api, fake | test doubles; `api` depends on `fake`, which depends on `world` | the test kit; `api` drops `fake` from its dependencies |
| `parse.env` | parse | a dotenv parser | tooling; Expo and Next inline public env at build |
| `rand.otp` | rand | generating one-time codes | the server. `value.otp` and `validate.otp`, which read a typed code, stay. |
| `auth.authorize` (throws `forbidden`) | auth | a request guard | a server pattern. A client asks `can`/`granted` and renders the denial. |
| the members `tool`, `test`, `fake` | — | build, test and fixture tooling registered as engine members | a dev-only kit (below) |
| `seo.sitemap sitemapIndex sitemaps robots manifest` | seo | static-export build outputs | web build tooling; no surface calls them today |
| `subset-font` | root `catalog` | pinned but imported by no member | delete the pin |

This cycle's work hardened exactly these paths. Three `MIGRATION.md` rows are about them: "Full limiter evicted active quota", "`facts` inferred identity from supplied forwarded headers", and "Crypto key-label hardening … password-based encryption".

**It ships to phones (run).** `probe/bundle.sh` on the Android Hermes bundle finds every marker:

- faker pools (`Mansour`) and the documentation test network (`198.51.100`)
- `pbkdf2-sha256` and `HS256`
- `x-forwarded-for`, `x-frame-options` and `permissions-policy`
- `openapi`, `transportIssues` and JSON Schema `draft-2020-12`
- a spec-compiler message (`give the block an id or name the feature`)
- `BreadcrumbList` and `sitemap`

The web export and the desktop build contain none of them; Next and Bun shake them out.

**Why only mobile (read and run):**

- Expo's Metro config sets `inlineRequires: false` and does no tree shaking by default (`@expo/metro-config` 58.0.x, `ExpoMetroConfig.js`).
- A namespace import (`import * as api from "engine/api"`, which is the facade law) pulls the member's whole `index.ts` graph, and every module in it evaluates at launch.
- Exporting with `EXPO_UNSTABLE_TREE_SHAKING=1 EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` gives 3,329,128 B, and every marker remains.
- So shaking is not the fix. On mobile, the member boundary is the shipping boundary.

**Cost (measured, `probe/closure/build.ts`):**

| Member | Whole closure (what Metro ships) | Without the server and tool parts | Dead weight |
| --- | --- | --- | --- |
| `api` | 187,067 B min / 69.7 KB gz, plus 557 KB of lazy `world` chunks reachable only through `fakes` | 99,618 B / 36.3 KB gz | 87 KB min / 33 KB gz |
| `spec` | 114,746 B / 38.0 KB gz | runtime only (`revive runtime match menuOf`): 33,409 B / 12.4 KB gz | 81 KB / 26 KB gz |
| `net` | 40,106 B / 15.8 KB gz | client only: 28,483 B / 10.9 KB gz | 12 KB / 5 KB gz |
| `fs` | 40,917 B / 14.9 KB gz | `file` only: 21,158 B / 7.9 KB gz | 20 KB (not imported on mobile today) |
| `crypto` | 15,888 B / 6.3 KB gz | client only: 11,716 B / 4.9 KB gz | 4 KB (ships through `spec → auth → crypto`) |
| `cache` | 27,998 B / 10.8 KB gz | client only: 26,065 B / 10.1 KB gz | 2 KB |

That is about 186 KB of minified JS leaving the phone. The Hermes byte delta was not measured.

**Fix — a hard frontend boundary:**

- `engine/bun/src/` holds runtime members only. Every member runs in a browser, in Hermes and in the desktop renderer, and carries no server or build concern.
- `engine/bun/kit/` is a dev-only workspace:
  - `kit-test`, `kit-fake` and `kit-tool` (today's `test fake tool`)
  - `kit-api`: `stub fakes sample answer refuse paged openapi transportIssues`
  - `kit-spec`: the compiler (`compile explain nearest` and the shapes)
  - It is consumed only by the surfaces' `tests/` and `tools/` and by the fake API. No `src/` member and no surface `src/` file may import it.
- Server-only code is deleted, not moved: password hashing, JWT signing and verifying, cookie signing, the request-header readers, the limiter, the SSRF fence, `rand.otp` and `auth.authorize`. GunX's backend engines own those domains.
- `auth` decodes claims itself (bounded base64url plus `json.parse`) and drops its `crypto` dependency.
- `spec` keeps `define revive runtime match menuOf when`, and `tools/compile.ts` calls the kit compiler. That makes the contract's "no compiler ships" true on mobile.
  - `runtime.ts` and `compiled.ts` import neither `compile.ts` nor `shapes.ts` (read), so the split cuts no runtime path.
  - Each surface's `src/specs/surface.ts` calls `spec.compile`. Runtime code imports only its types (`StackProps`); it is otherwise imported only by `tools/compile.ts`, `desktop/tools/build.ts` and the spec test.
  - So it moves out of `src/` (with `StackProps` into `src/types`), which changes the twin list (`GATE_TWINS` in `engine/infra/src/module/gate/src/bun.sh`). That is an infra change made on the owner's order.

**Accept when:**

- `probe/bundle.sh` prints 0 for every marker on the Android, web and desktop bundles.
- A law test fails when a `src/` member imports `kit-*`, or a runtime export is named after a server concern (password hashing, token signing, forwarded headers, rate limits, sitemaps).
- `tests/size.json` records each member's whole closure (what Metro ships) next to the entry closure.
- The Hermes size and its composition are re-recorded after the move (B-H12).

This changes the count in §5 and C4. The final count is in H4.

**Owner's decision needed.** `tutor/stack/engine/bun` names `tool`, `test` and `fake` as members. Its laws describe the cookie-signing, `limiter`, `answer/refuse/paged`, `openapi` and `fakes` contracts. It also states "no compiler ships", which is false on mobile. This part contradicts those laws, and the tutor changes only on the owner's order.

### E2. The contract has drifted from the code (read) — High

`tutor/stack/engine/bun/index.md`:

- says 37 members; the tree has 36
- names `store` ("stores, resources, actions, feeds, `useSelect`") with the doors `store/zustand.ts` and "`store/bind.ts` for React". The code has `state` and `state/zustand.ts`, and no React door: React left the engine, and `useSelect` lives in each surface's `stores/bind.ts`.
- says, in its Cache law, "`store` persists through a box"

An agent that follows the contract writes against members that do not exist. **Fix:** on the owner's order, re-sync the member table, the door law and the member names with the code, in the same change as E1.

### E3. Separation of responsibilities (read)

- **`api` is a god member** (2,753 lines): contracts, client, wire, envelope, realtime frames, presence and live patches, plus fakes (514), openapi (295) and stub (204). After E1 it is about 1,740 lines. Realtime stays there (moving it out of `socket` was right); nothing test-shaped or server-shaped does.
- **Five retry and backoff schedules**, each with its own factor, cap and jitter model:
  - `func.retry`, with jitter from `Math.random` (`func/src/flow.ts:230`)
  - `queue.backoff`
  - the `socket` reconnect (`rand.jitter`, 0.25)
  - the `net/stream` poll
  - `log.batchSink`
  
  **Fix:** one `func.backoff({ base, factor, max, jitter })` schedule, with jitter drawn through `rand`; the other four take it.
- **Ownership slips (grep).** Each of these bypasses its owning member, so tests cannot seed or freeze it:
  - `Math.random` in `func.retry`, and `Date.now()` + `Math.random()` for the store tag (`state/src/define.ts:24`)
  - `JSON.stringify` in `list/src/core.ts:49` and `JSON.parse` in `validate/src/rules.ts:405`
  - `Date.now()` in `fs/src/disk.ts:133` and `crypto/src/token.ts:14`
- **Three money formatters:** `number.currency`, `world.currencies.format` (one line over `number.currency`) and `value.money.format`. Money is `value.money`. `world` answers facts (digits, symbol), and `number.currency` stays the low-level formatter that money calls. **Fix:** remove `world.currencies.format`.
- **Two template engines:** `parse.interpolate` (`{a.b}` paths with a fallback) and `translate.interpolate` (`{x}` and Laravel `:x`). **Fix:** one tokenizer in `parse`, with the plural and select layer in `translate`.

### E4. DSL coherence (run and read)

**E4.1 Four `Readable` types in two shapes, and seven listening verbs — High, DSL.**

- `event.Readable<T>` is `{ get, watch, until }`.
- `state.Readable<T>` is `{ getState, subscribe }`. It is declared again in `world/src/arch.ts:132` and `spec/src/arch.ts:187`, and `state.Watched` bridges the two shapes. `derive` exists in both `event` and `state`.
- The members' contracts listen through seven verbs:
  - `watch`: adapter, api, auth, cache, device, event, form, queue, socket, spec, state, world
  - `subscribe`: api, event, spec, state, world
  - `on`: api, event, socket, spec
  - `onChange`: cache
  - `listen`: history
  - `handle`: spec
- The surfaces write the glue. The lab's `use-notes.ts` builds a `state.Readable` by hand from the socket's `status` and `watch`.

**Fix:**

- One `Readable<T>` (`get`, `watch(listener) → stop`, `until`), owned by `event` and implemented by every stateful handle: stores, feeds, resources, forms, sessions, the theme, socket status, device facts and history.
- `subscribe(topic, handler)` only where there is a topic, and `on` only for spec hooks. `history.listen` and `cache.onChange` become `watch`.
- The surface binding takes that one shape.
- Decide zustand on evidence. `state` stores are `zustand/vanilla` stores sitting beside `event.signal`, so two subscription engines run. Bench `state.define` against a signal-backed store (setting a store with 1,000 subscribers takes 15 µs today, `probe/final.ts`) and keep the faster one.

**E4.2 `:id` is silently a literal (run) — High, DSL.**

- `api.get("/a/:id", …)` sends `https://api.x.io/a/:id?id=…` (`probe/leak.ts`). The parameter moves to the query.
- *Corrected:* `spec.compile` does refuse `/orders/:id`. It returns an issue rather than throwing, and the first test of this item checked only for a throw. But the issue misleads: `screens.order | shape | name: lowercase letters, digits, dots, dashes and underscores` names neither the path nor the fix. `spec.match(compiled, "/orders/42")` then returns `undefined`.
- `:id` is the convention in React Router, Next and Express, so this is the likely mistake.

**Fix:** refuse a `:name` segment in api paths (accepted silently today) and `parse.match` patterns. For screen paths, give a precise issue (`path.param`: "`:id` → `{id}`") instead of the generic shape message.

**E4.3 Navigation goes by path text only (read) — Medium, DSL.**

`spec.navigate(path)` takes a string, and the parts build hrefs as strings.

**Fix:**

- `spec.navigate({ screen, params, query })` and `spec.href(compiled, screen, params, query)`.
- Both are typed by the screen's `{params}`, checked at compile and safe across renames.
- Strings remain only for external links through `device.open`.

**E4.4 One name, many meanings (read) — Low, DSL.**

`bytes` names five unrelated verbs:

- `fs.bytes` reads a blob
- `number.bytes` formats a size
- `parse.bytes` reads a size
- `rand.bytes` draws random bytes
- `string.bytes` encodes text

**Fix:** keep `rand.bytes` and `string.bytes`, and rename by meaning: `number.formatBytes` (beside `formatPercent`), `parse.byteSize`, `fs.read`.

### E5. Speed and memory (measured)

These are single runs of `probe/final.ts` and `probe/freeze.ts` on Bun 1.4.4, on an idle box (load 0.3–0.7). The ±2× noise from §0 applies.

| Path | Cost | Verdict |
| --- | --- | --- |
| `api.call`, 2,000-row reply, output `unknown` | 6.28 ms, against 1.26 ms for `JSON.parse` of the same body | **about 5 ms of engine overhead** |
| — of which deep freeze (`api/src/client.ts:139`, `frozen`) | parse 1.05 ms → parse + freeze 3.89 ms | 2.8 ms, 2.7× the parse |
| `api.call`, same reply, typed rows | 12.10 ms | validation adds 5.8 ms |
| `state` set with 1,000 subscribers | 15 µs | fine |
| `event.bus.publish` against 1,000 patterns | 53 µs | a linear scan |
| `translate.t` with a param, 5,000 keys | 2.3 µs | fine |
| `date.format`, `date.relative` (ar), `number.format`, warm | 1.9 / 0.8 / 2.6 µs | fine; the formatters are cached |
| `spec.revive`, 200 screens (53 KiB) | 1.50 ms (corrected; the first run used `:id` paths, see E4.2) | fine at boot |
| `spec.match`, 200 screens | about 11 µs per match, linear in screens (corrected; 0.65 µs measured non-matching literal paths) | fine; use a segment trie past about 500 screens |
| `form.set` per keystroke | 4 µs | fine |

**E5.1 Every reply is deep-frozen — High, performance.**

- A 2,000-row page costs about 6 ms of engine work on JSC before any validation. Hermes is slower (not measured), so this is a long task per page on a mid-range Android.
- **Why it freezes:** cached replies are shared by every consumer, so a consumer's mutation would corrupt the others. The fix must keep that isolation.
- **Fix:**
  - Freeze in dev and test, which catches the mutation where it is written.
  - In release, hand cached data out under `readonly` types plus a lint against mutating replies. Or freeze lazily, per row accessed.
  - Never drop the isolation silently.
- **Accept when:** with `unknown` output, `api.call` overhead for that reply is at most 1× `JSON.parse`.

**E5.2 Typed validation of large lists costs 2× the transport — High, performance.**

- Validation adds 5.8 ms per 2,000 rows.
- `validate.compile` depends on runtime evaluation, which a strict CSP refuses. Whether release Hermes allows it is unverified here (no VM).
- **Fix:** ahead-of-time validators. The build emits plain-JS validators for the declared output schemas, with no `eval` at runtime and the same rule codes, and a fuzz test proves them equal to the interpreted path.
- **Accept when:** typed 2,000 rows cost at most 2× `JSON.parse`.

**E5.3 The api cache is bounded by count, not bytes (read) — Medium, memory.**

- `capacity = 256` entries (`api/src/client.ts:14`), and it is not configurable.
- 256 large list pages can hold hundreds of MB on a phone.
- **Fix:** a byte budget estimated from the body length (`wire.cache.bytes`, defaulted per platform), eviction by size, and a flush on memory pressure (E5.5).

**E5.4 Feeds keep every page and copy the list on each page (read) — Medium, memory.**

- `state/src/feed.ts:108` does `[...items, ...added]`, and nothing ever drops old pages. Infinite scroll over 10k+ rows grows without bound.
- **Fix:** `feed({ keep })`, a window of pages that refetches when the user scrolls back. It complements B-M2.

**E5.5 Missing frontend performance primitives (read, grep):**

- no conditional requests (`ETag` / `If-None-Match` → 304) in `net` or `api`
- no fetch `priority` hint
- no prefetch-on-intent contract (hover, viewport, a route preloaded through the spec's `load`)
- no cooperative scheduling in `func`:
  - `yield`: `scheduler.yield` where the host has it, otherwise a macrotask
  - idle work
  - chunked loops that keep each task under 50 ms (complementing `worker`)
- no memory-pressure signal in `device` (RN `AppState` `memoryWarning`, web `deviceMemory`) for caches to shrink on
- no `BroadcastChannel` for cross-tab sign-out and cache invalidation
- `net.poll` keeps polling while the page is hidden (B-H4 covers only the socket)

**E5.6 Publishing is a linear pattern scan — Low.** Index exact topics in a map and wildcard patterns in a segment trie once subscribers pass a threshold, and bench at 10k.

**E5.7 Hermes evaluates everything reachable at startup (read) — Medium.** Expo's default is `inlineRequires: false`. After E1, measure `inlineRequires: true` (the members are `sideEffects: false`) for time to first render on a release build.

**Verified good:**

- 20,000-deep JSON passes `json.parse`, `stringify`, `clone`, `equal` and `api.call` without a crash.
- Intl formatters, plural rules, collators and display names are cached per locale.

### E6. Security (run and read)

**E6.1 Secrets are plain strings on the client (read) — High, security.**

- These take the key as JS data, so it either ships in the bundle or sits in the heap:
  - `cache.open({ secret, sign })`
  - `crypto.seal/open/sign/unsign/derive/mac(secret: string | Uint8Array)`
  - `crypto.key()`, which returns a string
- Sealing `localStorage` with such a key is obfuscation, and signing with it gives no integrity against the user who holds it.
- No surface uses them today (`stores/box.ts` opens plain boxes), so the API invites the mistake rather than preventing it.

**Fix:**

- `crypto.deviceKey(name)`: a non-extractable AES-GCM `CryptoKey`, generated once. On web it is kept as a structured-cloned `CryptoKey` in IndexedDB; on mobile it lives in the secure store (B-C3).
- `cache.open({ key })` takes that handle. `secret: string` and `sign` boxes leave the runtime.
- B-M6's raw-key path becomes this handle.

**Accept when:** `crypto.subtle.exportKey` refuses the key, and a sealed box reopens after a reload.

**E6.2 The credential-shaped-value law has not landed (read) — Medium, security.**

- The tutor lists it under "next laws". `spec/src` has no credential detection (grep for `credential|secret|apikey|password` finds nothing).
- **Fix:**
  - The compiler refuses settings, texts and props shaped like a credential: `sk_live_`, `ghp_`, `AKIA`, JWTs, PEM blocks, and long high-entropy strings under keys such as `secret`, `token` or `key`.
  - A surface lint refuses `secret:` literals in `src/`.

**E6.3 `net.guarded` cannot work in a browser** (see the E1 table). Delete it from the runtime.

**Verified good (run).** Keep these under fuzz as laws:

- `json.parse`, `parse.query`, `json.deepMerge` and `json.unflatten` refuse prototype pollution.
- Api paths refuse `//host`, absolute URLs and dot segments, so a path can never send the bearer away from `baseUrl`.
- `history.parse("//evil.io/x")` yields the local path `/evil.io/x`, and `javascript:` also becomes a local path.
- `device.open` allow-lists `http https mailto tel sms geo`.
- `seo.jsonLd` escapes `<`.

### E7. Surfaces (read)

- The twin `specs/runtime.ts` makes mobile and desktop import `seo` and compute web metadata: `robots`, `canonical`, `alternates`, Open Graph.
- **Fix (corrected):** the twins gate requires `specs/runtime.ts` to stay byte-identical on all three surfaces (`tutor/stack/fragment/web`, gate `twins`), so the twin is not split. The web-only metadata moves out of the twin into a web-only file, for example `src/app/metadata.ts`, and the twin no longer imports `seo`.

## Part F — Last pass: host runtime, attack paths, retention and missing interaction models

Date: 2026-11-15. Nothing here restates Parts A to E.

New probes, outside the repo:

- `probe/rnurl/strip.cjs`: strips Flow from React Native 0.88.1's own `Libraries/Blob/URL.js`
- `probe/rnurl/diff.ts`: 19 security-relevant URLs, WHATWG against React Native's `URL`, then the engine's guards running on it
- `probe/rnurl/diff2.ts`: the same cases against Expo's `whatwg-url-minimum`
- `probe/redos.ts`: super-linear regular expressions

Hermes facts come from the source tree of the exact Hermes V1 tag React Native 0.88.1 ships (`hermes-v260318099.0.5`, read through the GitHub API), plus the installed `react-native` 0.88.1 and `expo` 58.0.23.

### F1. Host runtime on mobile (doc and run)

**Present in the Hermes V1 source of that tag** (read through the API, not executed). Prove them on the Hermes lane, but no engine work is needed:

- Hermes V1 has `Promise.withResolvers` (`lib/InternalJavaScript/01-Promise.js:403`). The engine uses it in 7 files.
- It has `toSorted toReversed toSpliced with findLast findLastIndex` (`lib/VM/JSLib/Array.cpp`).
- It has `TextEncoder` as a core extension.
- Expo installs `structuredClone` (`@ungap/structured-clone`), and `json.clone` falls back anyway.
- The engine's `.union(` calls are zod's, not ES2025 `Set` methods. Hermes's `Set.cpp` has none of those methods, and `tsconfig` `lib: ES2024` already refuses them.

**F1.1 The engine's URL guards are only as good as the host's `URL` — High (conditional).**

React Native 0.88.1's own `URL` is a regex parser. All 19 inputs parse differently from WHATWG (run, `diff.ts`):

| Input | WHATWG | React Native |
| --- | --- | --- |
| `https://evil.com\@good.com/x` | hostname `evil.com` | hostname `good.com` |
| `HTTPS://GOOD.COM/A` | `good.com`, `/A` | empty hostname |
| `https://good.com/a/../b` | `/b` | `/a/../b` |
| `http://0x7f000001/` | `127.0.0.1` | `0x7f000001` |
| `https://good.com\t.evil.com/` | `good.com.evil.com` | the tab kept inside the host |
| `https://good.com:443/x` | origin without the port | origin `https://good.com:443` |

Expo's winter runtime replaces it with `whatwg-url-minimum` 0.2.0. Under that, all 19 cases match WHATWG exactly (run, `diff2.ts`).

So the apex mobile surface is safe only because `index.ts` imports `expo` first. These guards depend on that silently: `net.parseUrl`, `sameOrigin`, `originOf`, `hostname`, `policy`, `value.url`, and D11's proposed safe return. (Corrected: `device.targetOf` reads the scheme with its own pattern, not through `URL`.)

**Fix:**

- `adapter.capabilities().url` runs the 19 cases at boot.
- Security-relevant parsing refuses with `net.url.unconformant` on a host whose `URL` fails them.
- A mobile surface test proves the winter `URL` is installed before the engine evaluates.

**F1.2 `TextDecoder` is built at import time (read) — Medium.**

- `string/src/encode.ts:2` runs `new TextDecoder()` at module scope.
- On Hermes V1, `TextDecoder` is a *contrib* extension. It is on by default, but `HERMES_ENABLE_CONTRIB_EXTENSIONS=OFF` removes it ("Opt-Out Available … for critical deployments", contrib README).
- `string` is a floor member, so a missing decoder kills boot instead of refusing one call.
- **Fix:** construct it lazily, behind `capabilities().text`.

### F2. Attack paths (run)

**F2.1 `validate.rules("regex:…")` compiles any pattern — High, security (DoS).**

`/^(a+)+$/` against `a`×n followed by `!`:

| n | Time on JSC |
| --- | --- |
| 20 | 8.5 ms |
| 24 | 111 ms |
| 26 | 451 ms |
| 28 | 683 ms |

- Rules are authored in specs today, but D6 brings server contracts (password policy, field rules) to the client. That makes this a UI-thread freeze on every keystroke.
- The engine's own readers are safe: `value.email`, `value.money.parse`, `parse.semver` and `string.slug` stay under 0.3 ms at 100,000 characters, thanks to their length caps.

**Fix:**

- Refuse super-linear patterns when a rule compiles (nested or overlapping quantifiers, from a static check).
- Cap the length a pattern rule tests.
- Run pattern rules after a debounce, not on every keystroke.

**Accept when:** `rules("regex:/^(a+)+$/")` refuses with `validate.pattern`, and a ReDoS corpus is fuzzed.

**F2.2 Log redaction looks only at key names — High once logs leave the device (B-H7), privacy.**

- **Masked:** `authorization password token refresh_token apiKey cookie secret`, and `access_token` inside URLs.
- **Passes through:**
  - a card number under `card` (`4111111111111111`)
  - an OAuth `code=` in a callback URL
  - emails and phone numbers
  - an error message `db password=hunter2`, verbatim

**Fix:**

- Redact by value shape: Luhn-valid 13–19 digits, the JWT shape, `code` / `state` / `id_token` parameters, and `key=value` secrets inside messages.
- Add a per-sink policy that masks PII (emails, phones).

**F2.3 `error.messageOf` shows raw messages, and the engine carries English copy — Medium, security and law.**

- `messageOf` returns any `Error.message` verbatim. Its fallbacks are English HTTP reason phrases (`error/src/fault.ts:6`: "Something went wrong", "Authentication is required", …).
- The raw messages leak internals to users and bypass `translate.reason`.
- The phrases are copy inside the engine, which the Runtime law forbids ("no copy").

**Fix:**

- User text goes only through `translate.reason(fault, t)`.
- `messageOf` becomes a log-only `error.detailOf`.
- The phrase table leaves together with `toEnvelope` (E1).
- A surface law refuses `messageOf` in components.

### F3. Retention (run)

| API | Measured | Engine callers | Fix |
| --- | --- | --- | --- |
| `event.aborted(signal)` | Adds one listener per call, removed only when the signal aborts. 10k calls on one page-lifetime signal retain 2.9 MB (≈300 B each); 100k retain 29 MB. | none | Delete it, since `event.race` covers the need and cleans up (10k → 51 KiB). Or return a disposer. |
| `net.timeoutSignal(ms)` | Creates a timer and a controller per call, never cleared when the work ends. 10k calls at 60 s retain 2.2 MB for a minute; `timer.unref()` is a Node idiom. | none | Delete it; `event.deadline` already cleans up. |
| `virtual.layout` with variable sizes | Rebuilds every offset on each change: 1.43 ms per rebuild at 100k rows on JSC, 1.56 MB per layout in plain arrays. A list that measures rows as they mount rebuilds once per measurement. | surfaces | A Fenwick tree over `Float64Array` (O(log n) per update and prefix, about 0.8 MB per 100k), fed incrementally by `measures`. |
| Sealed box `get` | Decrypts on every read: 1.31 ms warm (`probe/audit.ts`). | `cache.open({ secret })` | Keep a decrypted mirror per open box, invalidated by `watch`. Clear text still never reaches storage. |

### F4. Throughput (run and read)

- **The outbox rewrites everything on each change (run) — Medium.**
  - `mutate` reads all rows and writes the whole job array (`queue/src/outbox.ts:188`).
  - One push costs 0.31 / 0.99 / 2.22 ms with 100 / 500 / 1,000 jobs queued (memory store, JSC). On `localStorage` that is synchronous JSON on the main thread, so 1,000 offline edits cost about 1 s of main thread.
  - **Fix:** per-job keys (append or patch one row) over `cache` or `store` (B-H8), with a counter index. The full array is written only when compacting.
- **`queue.schedule` flushes on a 15 s timer, whatever the device is doing (read).** **Fix:** flush on push, on `online` and on becoming visible. Keep the timer only as a fallback, paused while hidden (battery).
- **Notifications are not batched (read).** `state`, `event` and `form` notify on every set, so a live burst of 50 patches means 50 notifications × every selector. **Fix:** `state.batch(work)` (one notification at the end) and `feed.apply(patches)` (with B-M2).
- **Every locale's messages ship in the initial JS (read).** `translate.dictionary(dictionaries)` takes all locales up front, and the surfaces build it from `compiled.role.messages` (`web/src/specs/runtime.ts:17`). **Fix:** a `translate` loader port (`load(locale, namespace)`) with per-locale chunks. The active locale loads before first paint; the others load on switch.

### F5. Missing frontend capabilities (read; grep finds nothing in the engine or the surfaces)

| Need | Today | Owner and shape |
| --- | --- | --- |
| Headless interaction models: roving focus, typeahead, listbox/combobox, menu, tabs, tree, a dialog stack with focus return and scroll lock | Each surface would build them itself, three times over, and WCAG 2.2 behavior would differ per surface | A new `control` member: state machines only, fed by key and pointer intents from `device.keys`. The parts render. |
| User inactivity | `device.watch` topics are focus, language, visibility, network, scheme, motion and contrast; none reports user activity, and there is no session idle timeout. (Corrected: `idle` in `device` is only the no-op stop function returned for unsupported topics.) | `device.watch("activity")` plus `auth.session({ idle, warn })`, agreed across tabs. A common enterprise compliance demand. |
| Leaving with unsaved work | `history.guard` blocks in-app navigation only; closing or reloading the tab is not guarded | `device.watch("leaving")` (`beforeunload`), bound by the §4.1 dirty guard |
| Scroll restoration | none | per history entry, so list → detail → back lands on the same row; coordinated with `virtual.anchor` |
| Deploy skew | after a deploy, a lazy feature chunk from the previous build 404s, and nothing catches it | `error` classifies chunk-load failures; the surface reloads once per build id, then shows the designed failure (with B-C4) |
| Storage durability | no `navigator.storage.persist()` or `estimate()` | `device` facts consumed by `store` (B-H8) for offline-first |

The final count, with `control`, is in H4.

## Part G — Contract hardness: definitions, refusals, caps and duplicated guards

Date: 2026-11-15. Nothing here restates Parts A to F.

New probes, outside the repo:

- `probe/misuse.ts`: how each constructor answers a wrong definition, the validation issue cap, cookie defaults
- `probe/edge.ts`: double interpolation, memo bounds, navigation targets, date and number input, CSV, the reply size cap

### G1. A wrong definition is answered in three different ways (run) — High, DSL

`probe/misuse.ts`:

| Answer | Calls |
| --- | --- |
| A typed fault naming the rule (the bar) | `api.create({})` → `api.address`; `api.get("/a")` → `api.schema` |
| A raw `TypeError` deep in the implementation | `state.define({ name })` (`Object.hasOwn(initial…)`, and also any call without `actions`); `socket.open({})` (`protocol.retry`); `translate.dictionary(null, "en")`; `search.index({})` (`options.fields.map`); `history.create(null)`; `event.bus().subscribe(1)` (`pattern.includes`); `log.create({ sinks: 1 })` ("number is not iterable") |
| Silently accepted, failing later or never | `state.feed({})`, `form.define({})`, `spec.surface({})`, `cache.open({ kind: "nope" })`, `queue.create({})` (with no `owner` and no `perform`), `auth.session({})` |

TypeScript catches these for TS callers only. Specs, JSON, plain JS, runtime contracts (D6) and server-shaped settings never pass through the type checker.

**Fix — a definition law for every constructor** (`create`, `define`, `open`, `use`, `index`, `bus`, `session`):

- Validate the options once, at definition, and refuse with `<member>.<option>` plus the nearest valid name, the way `spec.compile` already does.
- Never accept an unknown kind, and never defer the failure to the first use.

**Accept when:** every row of the probe prints a `fault <member>.<option>`. A law test drives each constructor with `{}`, `null` and a wrong type, and refuses any `TypeError` or acceptance.

### G2. Retracted (2026-11-15): "navigation targets are not checked"

The compiler does check them. `spec.compile` reports `effect.screen: no screen answers this path` for `/nowhere`, `https://evil.io/x`, `//evil.io`, `javascript:alert(1)` and an unanswered `/orders/{id}`. The first probe tested only for a throw, and `compile` returns issues instead.

What remains belongs to G1: a raw effect object inside a built feature (`{ navigate: spec.query("next") }`) crashes the compiler with `TypeError: effect.navigate.indexOf is not a function` instead of a `shape` issue.

### G3. Nothing caps validation issues (run) — High, memory and performance

- `validate.check` of 100k invalid rows keeps **200,000 error entries** and takes 517–647 ms.
- An oversized or hostile reply (api output validation) therefore builds a fault of that size, and B-H7's sinks would then serialize it.

**Fix:**

- Cap the issues kept (for example the first 100, plus a count).
- Add `first: true` for output validation, which stops at the first issue.
- Keep paths short: `rows[*].qty` with indices sampled.

**Accept when:** 100k bad rows keep at most 100 entries and fail in under 50 ms.

### G4. Option guards are copied across members (read) — Medium, ownership

Private numeric-option guards, each with its own clamping, defaults and NaN handling:

| Guard | Members that copy it |
| --- | --- |
| `whole` | `api` (twice), `cache`, `event`, `fs`, `func`, `log`, `virtual` |
| `span` | `cache`, `date`, `device`, `event`, `func`, `queue`, `socket` |
| `sized` | `cache`, `fs`, `geo`, `rand`, `socket`, `validate` |
| `clean` | `fs`, `log`, `parse`, `queue`, `socket`, `value` |
| `finite` | `device`, `number`, `queue` |
| `seconds` | `api`, `crypto` |

That is 42 private definitions in all. One member truncates where another refuses, so the same "timeout: 1.5" behaves differently across members.

**Fix:** one owner. `value` option readers (`value.count(x, { min, max, fallback })`, `value.duration(x, { unit })`), used by every member and by G1's definition law.

### G4b. The client cookie jar accepts what a browser ignores (run) — Medium, security

- `serializeCookie("pref", "dark")` gives `pref=dark; Path=/; SameSite=Lax`: no `Secure`, even on an https origin.
- `serializeCookie("sid", "x", { httpOnly: true })` writes `HttpOnly`. A browser drops a cookie set from `document.cookie` with `HttpOnly`, so `documentCookies` turns it into a silent no-op.
- `documentCookies().set("token", …)` stores a credential where any script can read it; A3's confidential check does not cover cookies.

**Fix:**

- The client jar refuses `httpOnly`.
- It defaults to `Secure` on https origins.
- It refuses credential-shaped names and values unless `plain: true`.

### G5. A shared GET is cancelled by one consumer (run) — Low, performance

- Ten concurrent identical GETs make one fetch, cached or not (good).
- When one of two consumers of a shared flight aborts, the flight dies and the remaining consumer starts a second fetch: 2 fetches where 1 was enough.
- **Fix:** reference-count the shared flight. Abort the network only when every consumer has aborted.

### G6. Numeric input ignores the user's locale (run) — Medium, DSL

`value.number("1.234,5")` and `value.number("12,5")` answer `undefined`, so a German or French user typing a normal amount is refused.

The second argument is a fallback, so `value.number("1.234,5", { locale: "de" })` silently returns the options object itself.

**Fix:**

- `value.number(text, { locale })` and `value.decimal.parse(text, { locale })` read the group and decimal separators by formatting a known number (`Intl.NumberFormat(locale).format(1234.5)`) and taking its non-digit characters. Not through `formatToParts`, which Hermes lacks on iOS (B-C1). Arabic and Persian digits are kept.
- The fallback moves into the options, so an options object can never be mistaken for a fallback value.

### G7. Verified good in this pass (run)

Keep these as laws under test:

- `state.feed`: a late `more()` landing after a `refresh()` is discarded.
- `api`: an aborting consumer gets `api.aborted` while the other still completes, and a POST without a key is attempted once on 503.
- `translate`: a parameter holding `{other}` or `:other` is not interpolated again.
- `func.memo` is bounded at 256 by default.
- `rand` refuses when there is no CSPRNG; there is no `Math.random` fallback.
- Socket authentication travels in a frame, never in the URL.
- `date.from("2026-02-30")` and the ambiguous `02/03/2026` both answer `undefined`.
- `value.number` reads `1,234.5` and `١٬٢٣٤٫٥`.
- `json.fromCsv` parses 50k rows in 61 ms.
- `api` refuses a 30 MB reply with `net.body`.
- Storage quota errors map to a typed fault.

## Part H — Self-audit of this document, purity rules, last finding

Date: 2026-11-15.

Method:

- Every finding in Parts A to G was re-checked against the engine source, the tutor, and the source of the exact Hermes V1 tag React Native 0.88.1 ships.
- The probes were rerun wherever the first evidence could mislead. The main trap: `spec.compile` returns issues instead of throwing.
- The corrections below are already applied in place, so the items above now read correctly. This list says what changed, so nothing is implemented from an old reading.

### H1. Corrections and retractions

| Item | What was wrong | Now |
| --- | --- | --- |
| B-C1, A4 | Built on the Hermes doc alone | From the tag's code. `DateTimeFormat.formatToParts` exists on both platforms. `NumberFormat.formatToParts` is absent on iOS. `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `DisplayNames` and `formatRange` are absent. The risk list is rewritten. |
| A3 | Cited `tutor/stack/part/web`, which does not exist | `tutor/stack/fragment/web` ("tokens never in web storage") and `tutor/stack/fragment/mobile` ("secure on-device sessions") |
| B-H7, §5 `telemetry` | Cited a "root/arch observability law" that does not exist | Rests on product need. The tutor states observability only for `engine/rust` and `library/hyper`. |
| §5 intro | Called the proof bar a "tutor engine law" | A proposed acceptance bar; the Proof law covers tests, coverage and fuzz |
| §7.8, §7.9 | Wrong tutor paths (`tutor/lib/…`) | `tutor/library/electro`, `tutor/library/expo`. The release build stays a lab measurement outside CI, per the tutor. |
| B-H6, §5 `worker` | Named "RN worklets/JSI" as a worker host | React Native and Hermes have no standard background thread; on mobile the declared fallback is the default |
| B-H8, §5 `store` | "bun:sqlite on desktop" | The renderer has no `bun:sqlite`. It is IndexedDB, or SQLite through the host's RPC, or through the mobile vendor home. |
| §5 `flag` | Targeting by user/tenant/role on the client | The server evaluates; the client keeps the snapshot |
| §5 `media` | Named an Expo module inside an engine member | Behind a port; the engine never imports Expo (`tutor/library/expo`) |
| C1, C3 SSR context | A request-scoped server context with `net.facts` | **Retracted**: backend work, contradicting E1 |
| C1, C3 Pusher | A vendor protocol shipped in the engine | **Retracted**: the product supplies the protocol object |
| C1, C4 `rich` | Output to HTML | HTML in → document tree out; the engine never emits HTML |
| C1, C4 `qr` | SVG output | A module matrix |
| C1 clock offset, C3 downloads | Assumed `Date` and `Content-Disposition` are readable | Cross-origin, they need exposing (H2) |
| D2 | The client enforcing an attempts limit | The client mirrors the server's state only |
| D4 | Owned by `auth`/`adapter` | `auth` alone |
| D12 | Boot orchestration owned by `adapter` | `event`; `adapter` only reads the host |
| D7 | PHP payload quirks as engine decoders | **Retracted** |
| D14 | An "inbox" noun in the engine | A generic counted feed |
| D20 | A list of social providers | **Retracted**: product data |
| D-Evidence | "Confirms in production" | Zainlak runs React Native 0.86.2. The 0.88.1 Hermes source still lacks `PluralRules`. |
| E1 | The compiler split ignored the surfaces | Each surface's `src/specs/surface.ts` leaves `src/`, which changes `GATE_TWINS` (on the owner's order) |
| E4.2 | "The screen path `:id` compiles" | The compiler refuses it, but with a misleading `shape` issue. The api half stands. |
| E5 table | `spec.revive` and `spec.match` were measured on paths that never matched | Remeasured: 1.50 ms and about 11 µs |
| E5.1 | Dropping the freeze without saying why it exists | The freeze isolates shared cache entries; keep that isolation |
| E5.2 | "No plan for Hermes" | Unverified (no VM) |
| E7 | Splitting a twin file | Move the web-only metadata out of the twin |
| F1 | "Checked and clear" | Present in the tag's source; prove it on the lane |
| F5 | Read `device`'s `idle` as a placeholder | It is the no-op stop function; the gap stands |
| G2 | "Navigation targets are not checked" | **Retracted.** The compiler checks them. The remainder (a crash on a raw effect) joins G1. |
| G6 | The fix used `NumberFormat.formatToParts` | That method is absent on iOS; read the separators from `format()` |
| §5, C4, E1, F5 | Member counts of 45, 42 and 43 | One count, in H4 |

### H2. The exposed-headers contract (read, doc) — Medium

- The engine reads `retry-after` and `x-request-id` from response headers (`net/src/transport.ts`, `api/src/client.ts`).
- In a browser, a cross-origin response exposes only the CORS-safelisted headers, unless the server lists the others in `Access-Control-Expose-Headers` (Fetch standard).
- The envelope paths `meta.retry_after` and `meta.request_id` back up these two. But a 429 or 503 from a proxy or CDN carries no envelope.
- Three proposals also depend on headers that need exposing: C1's clock offset (`Date`), C3's downloads (`Content-Disposition`) and E5.5's conditional requests (`ETag`).

**Fix:**

- `api.house` declares the headers the client reads (`expose`), so the backend contract lists them.
- The fake API and the kit's contract lint check them.
- The client reports once (`net.header.hidden`) when a cross-origin response lacks a header it needs.

**Accept when:** a cross-origin fake without exposure yields the report, and with exposure the values are read.

### H3. Purity rules for whoever implements this document

1. **No product nouns.** No product noun goes into engine API names, data or fixtures (the Nameless law). The `orders`, `refund` and `vendors` in C2 are illustration only; fixtures use placeholder nouns. Ported flows (C5) live in `product/apex/*`, never in `engine/bun`.
2. **No vendors.** No vendor protocol, vendor encoding quirk or provider list goes into the engine. Products supply them through ports, protocol objects or their own wire layer.
3. **The client never decides security.** Authorization, lockouts, flag targeting, rate limits and token issuing belong to the server. The engine mirrors the server's state and renders the denial.
4. **No content from the engine.** It emits no content HTML, no SVG and no copy (the Runtime law). It hands out trees, matrices and codes; the parts render them.
5. **Three runtimes or no member.** A member runs in a browser, in Hermes and in the desktop renderer, or it is not a member (E1).
6. **Evidence is not a mandate.** A new member lands only with a GunX consumer feature in the surfaces and its proofs. Zainlak is evidence of a need, not a requirement in itself.
7. **Numbers need their probes.** A number in this document holds only with its probe, rerun after each fix. A probe that checks only for a throw must also read the returned issues.
8. **The tutor governs.** Where this document and the tutor disagree (E1, E2, E7, `GATE_TWINS`), the tutor governs until the owner orders a change.

### H4. The member count

| Step | Members |
| --- | --- |
| Today | 36 + facade |
| A8 splits out `style` | 37 |
| E1 moves `tool test fake` to the kit | 34 |
| Ten new members: `worker store sync transfer telemetry flag media table rich control` | **44 + facade**; the kit sits outside the count |

Each new member depends on H3's rule 6.

### H5. Re-verified as accurate in this pass

- A2, B-H2 and B-H3 (`probe/audit.ts`, rerun).
- E1's markers and closures.
- E1's "no server code in the web fragment": `robots.ts` and `sitemap.ts` are `force-static` and use Next's own `MetadataRoute`, and there is no middleware or route handler. `WEB_OUTPUT=standalone` exists but runs no server code.
- F1.1: `expo` → `Expo.fx` → `winter` installs the WHATWG `URL`.
- B-C4: no boundaries. B-H11: no `BackHandler`.
- B-M6: 210k PBKDF2 rounds in `seal.ts`. B-M7: the duplicated names exist. E4.4: the five `bytes` meanings.
- The engine's runtime source carries no product noun or business rule (grep). `order`, `driver`, `delivery` and `ticket` there mean sort order, a storage driver, a message delivery and a lease ticket.

## Part I — Second self-audit and the last wiring gaps

Date: 2026-11-15. Nothing here restates Parts A to H.

### I0. Second check of this document

**Corrected in place (§4):**

- **The "Lifecycle hooks" row.** The mechanism exists (the `device` context namespace, `watch`, `runtime.patch`); what is missing is the binding (I1).
- **The `log` line.** `log.batchSink` already batches and backs off; only the flush on `pagehide` is missing.

**Re-verified as accurate (read):**

- §4.1's list of 14 effects matches the `Effect` union in `spec/src/arch.ts`. `queued` is `call` with `queue: true`, and `branch` builds `when`.
- The "engine today" names in C1 all exist:
  - date: `number.change`, `date.clock`, `date.range/span/grid/hijri/weekStart`
  - values and validation: `world.dialings`, `validate.password`
  - flow and history: `history.guard`, `func.debounce/throttle`
  - data and output: `seo.jsonLd/product/organization/breadcrumbs`, `log.batchSink`, `state.resource`, `translate.reason`, `json.diff`, `fs.imageSize`
  - `device`'s `copy share pushToken badge pick keys` are instance methods of `device.create()`, not top-level exports.
- `translate` has plurals but no `select` (§4.2 stands). `log` has no `pagehide` or beacon (B-H7 stands).

### I1. Device facts never reach the spec runtime, so `queued` never queues (run and read) — High, correctness

- The tutor's law: "`queued` calls through the queue when the device is offline."
- The runtime tests `state.get().device.online === false` (`spec/src/runtime.ts:540`). The context starts with `device: {}` (`spec/src/when.ts:365`).
- The apex surfaces patch only `{ locale }` (`app/screen.tsx:56` on web and mobile), so `device.online` stays `undefined`.
- **Run:** with the device never fed, a `queued` call reaches the queue 0 times. After `patch({ device: { online: false } })`, it reaches the queue 1 time.
- **Result:** an offline save is never queued, and every spec `watch` on `device.*` is dead.

**Fix:**

- `spec.runtime(compiled, { device })` takes a `Readable` of device facts (`online`, `visibility`, `scheme`, `motion`, `size`), shaped as E4.1, and keeps the namespace live.
- The runtime refuses (`spec.device`) to mount a screen that uses `queued` or watches `device.*` without that source, instead of staying silent.
- The surfaces bind `device.watch` once.

**Accept when:** with the device fake offline, `queued` reaches the queue; online, it reaches the handler; a `watch` on `device.online` fires on each change.

### I2. `net.request` forwards five fetch options, and the session model the tutor demands has no transport (read) — High, security

- **`net/src/transport.ts:154` hands `fetch` only `method headers body signal redirect`.** There is no:
  - `credentials`
  - `mode`
  - `cache`
  - `keepalive`
  - `priority`
  - `referrerPolicy`
  - `integrity`
- **There is no CSRF support anywhere** (grep for `credentials|csrf|xsrf` in `api`, `net`, `auth`: nothing).
- **The consequence, given A3:**
  - "Tokens never in web storage" leaves one standard web design: the access token in memory and the refresh token in a `HttpOnly; Secure; SameSite` cookie set by the server.
  - On a separate API origin, that refresh call needs `credentials: "include"`. A cookie-authenticated call also needs a CSRF defense: a double-submit header, or a custom header plus `SameSite`.
  - The engine can express neither, so on web the tutor's own session rule cannot be met.
- `keepalive` is also the fetch-side twin of `sendBeacon` for B-H7's unload flush.

**Fix:**

- `net.request` passes the seven options through, typed, with safe defaults: `credentials: "omit"` unless the endpoint declares cookie auth, and `referrerPolicy: "strict-origin-when-cross-origin"`.
- `api` endpoints declare `auth: "bearer" | "cookie"`. A cookie endpoint sends `credentials: "include"` and the CSRF header that `api.wire` names (read from a cookie or from a token endpoint).
- `auth.session({ refresh: "cookie" })` keeps only the access token, in memory, and renews through the cookie endpoint (B-H3).
- The fake API and A3's test prove it end to end.

**Accept when:**

- On a cross-origin fake, renewal works with no token in any storage.
- A request without the CSRF header is refused by the fake.
- `credentials` is never `"include"` on a bearer endpoint.

### I3. Every endpoint schema is built at boot (run and read) — Medium-High, start-up and memory

- Each surface's `src/api/index.ts` imports every feature's transport, and builds `api.catalogue(contracts)` at module scope.
- `stores/client.ts` imports that file for `createClient`, so every endpoint's zod schemas are constructed at launch, lazy features included.
- **Measured (JSC):** a catalogue of 500 endpoints with 10-field schemas takes **73 ms to define and keeps 5.0 MB** before any call. Hermes is slower (not measured).

**Fix:**

- The client module never imports the catalogue. The catalogue is a build input (`tools/compile.ts`, kit), and each feature imports only its own transports, so lazy features stay lazy down to their schemas.
- Optionally, `api.get/post` accept schema thunks, built on first call.

**Accept when:** boot defines no schema of a lazy feature (a counter test), and the 500-endpoint fixture adds under 2 ms and 200 KiB at boot.

### I4. DSL ease, measured in lines of glue (read) — Medium, DSL

| Feature | Hook glue | Engine members used |
| --- | --- | --- |
| Real `hello`: one GET + refresh + bus event | 85 lines (`web/src/features/hello/hooks/use-hello.ts`) | `state`, `error` |
| Lab `notes`: list, create, delete, search, live | 188 lines (`use-notes.ts`) | 7 members, plus 3 surface stores |

The hello hook alone repeats this by hand:

- a `fresh` flag
- `useMemo` over `state.resource` and `client.call`
- `bind`
- `useEffect` refresh and abort
- `live.handle` wiring
- a status and reason mapping

The tutor's direction is "features stay business pipelines of a few lines".

**Fix:** `state.query(client, endpoint, input, { key, live, refresh })` (§5's query semantics). It is one bound resource that owns the cache key, `fresh`, abort on unmount, the live and handler wiring, and the status/reason/error mapping. `state.list` does the same over a paged endpoint, with the C2 vocabulary on top.

**Accept when:** `hello` drops to 15 lines or fewer and `notes` to 40 or fewer, with identical behavior under the existing surface tests.

## Part J — Third self-audit and validated live patches

Date: 2026-11-15. Nothing here restates Parts A to I.

### J0. Third check of this document

**Corrected in place:**

- D14: the Zainlak file is 439 lines, not 389.
- F1.1: `device.targetOf` does not depend on `URL`.

**Re-verified as accurate (run or read):**

- **E1's deletions break no internal caller (grep).**
  - The name matches in `validate`, `cache`, `func` and `queue` are local helpers.
  - `api.address` keeps only a small private-host test.
  - The `otp` calls in `validate` are `value.otp`, the reader.
- **The Zainlak figures:**
  - 876, 1,356 and 990 files
  - `lib/spec/types.ts` 416 lines, `features/engine` 845 lines, `api/core` 1,968 lines
  - role schemas 6,008 lines (admin 5,076 + super 751 + delivery 181)
  - chat hooks 378 lines
  - issues B12 and B4
- **Engine behavior:**
  - `history.memoryAdapter` caps its entries at 100.
  - `search.index` supports incremental `remove`.
  - Cross-tab `storage` events decode through `json.parse`.
  - Socket frames are capped at 64 KiB, text and binary alike.
  - `list.mapAsync/filterAsync/eachAsync/settle` default to 4 lanes and honor abort.
- **Hermes V1 regex support:** it supports every Unicode property escape the engine uses: `L M N ASCII Extended_Pictographic Emoji_Modifier Regional_Indicator` (`lib/Platform/Unicode/UnicodeData.inc`, binary-property map). Lookbehind appears only in `tool`, which moves to the kit.

### J1. Live patches bypass validation (run and read) — High, security and correctness

- `api.applyPatch` merges a realtime frame's `data` into cached rows by spread (`api/src/live.ts:62–88`). There is no schema check and no key guard, and a `created` row is inserted exactly as received.
- **Run:** a frame carrying `{ "__proto__": {…}, "constructor": { "prototype": {…} } }`:
  - The global prototype stays clean.
  - The patched row keeps both as **own keys**.
- **Why it matters:**
  - The HTTP path validates every reply against the endpoint's output schema, but the realtime path that patches the same rows does not.
  - So one malformed or hostile frame puts wrong types into typed UI state.
  - An own `__proto__` key becomes a prototype swap the moment any consumer runs `Object.assign(target, row)`.
- A flood of frames is a separate matter, covered by F4's batching.

**Fix:**

- `api.live` validates each frame's `data` against the feature's row schema (the list endpoint's item schema) before `applyPatch`.
- It strips unsafe keys through `json.safeKey`.
- On a mismatch it applies nothing and reports `api.live.shape` once per topic.
- B-H4's resync refetches after a refused frame.

**Accept when:** a frame with a wrong type or a `__proto__` key is refused and reported, and the row is unchanged; a valid frame applies; and a fuzz target over frames proves no own unsafe key ever reaches a row.

## 8. Execution order and acceptance

**Wave 0** (the frontend boundary, before anything else hardens more server code):

- E1 (runtime/kit split and the deletions), E2 (the contract re-synced, on the owner's order), E6.3, F3's deletions of `event.aborted` and `net.timeoutSignal`, F2.3's phrase table.
- Gate: `probe/bundle.sh` prints zero markers on all three bundles, and the law test refuses a kit import from `src/`.

**Wave 1** (correctness and security, 1–2 days of work):

- A1, A2, A3 with B-C3's mobile confidential driver, A4, A5, A6 (with an expiry index), A7, B-C4 boundaries, B-H2 invalidation, B-H3 renew-and-replay, D1 encoding, D3 deny and ceiling, D4 scope epoch, E4.2 `:name` refusal, E5.1 release without deep freeze, E6.1 device keys (with B-C3), F2.1 pattern-rule refusal, F2.3 user text only through `translate`, G1 the definition law (including the compiler's crash on a raw effect), G3 the issue cap, G4b the client cookie jar, H2 the exposed-headers contract, I1 device facts into the spec runtime, I2 fetch options, cookie sessions and CSRF, J1 validated live patches.
- Gate: every probe in `probe/{duel,audit}.ts` prints the lab column, and the surface tests add a throwing-feature case.

**Wave 2** (portability and evidence):

- B-C1 Hermes capability fallbacks and a Hermes lane, B-H11 native back and deep links, B-H12 budgets and composition, B-M8 Playwright lanes, B-M9 zero `noConditionalExpect`, B-M10 bench baselines, E5.7 `inlineRequires` measured on a release build, the whole-closure column of E1 in `tests/size.json`, F1.1 the URL conformance capability, F1.2 lazy text codecs, F4's per-locale message loading, I3 no schema built at boot for lazy features.
- Gate: the Hermes subset is green, Playwright is green on all three surfaces against the fake API, and the bench baseline is committed.

**Wave 3** (scale capabilities):

- `worker`, then `store`, `transfer`, `telemetry` and `rich`, then `sync`, `flag`, `media` and `table`; spec DSL §4.1 in the listed order; the Part C resource vocabulary (C2) and API families (C3), with the extensions from C4; E5.2 ahead-of-time validators; E5.5 frontend performance primitives; F2.2 value-shape redaction (with `telemetry`); F4's per-job outbox (with `store`); F5's `control` member; I4 `state.query` and `state.list`, measured in lines of glue.
- Each member lands with a consumer feature in the surfaces (fuel), its contract, failure and fuzz proofs, a bench with a hypothesis, and a memory soak.

**Wave 3b** (protocols and runtime layers): D2 step-up, D5 overlay, D6 contract, D8 analyzers, D9 undo, D10 commands, D11 topology, D12 boot, D13 rich messages, D14 inbox, F5's inactivity, leaving, scroll restoration and deploy skew.

**Wave 4** (structure):

- A8 world/style split, B-M7 duplicated verbs, B-M2 keyed feed, B-M5 cursor envelope, B-M6 key handles, B-M12 lazy issues, D15–D19.
- E3 ownership (one backoff, one money formatter, one template tokenizer, the ownership slips), E4.1 one `Readable` and one listening verb, E4.3 typed navigation, E4.4 renames, E5.3 a byte-bounded api cache, E5.4 windowed feeds, E5.6 an indexed bus, E6.2 the credential law, E7 native metadata, F3's Fenwick layout and sealed-box mirror, F4's event-driven flush and batched notifications, G4 one owner for option guards, G5 shared flights reference-counted, G6 locale-aware numeric input.

Definition of done for every item:

- the probe or test that fails before the fix passes after
- `bun run gate` is exit 0 for the engine and each surface
- `tests/api.json` and `size.json` are recorded with the change classified
- `MIGRATION.md` gets a row when a contract changes
- `probe/bundle.sh` still prints zero markers on the three bundles
