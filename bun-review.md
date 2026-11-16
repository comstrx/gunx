# Bun review — lab round close

2026-11-15 · for the owner and the agent working on this tree. Fourth close: supersedes the third.

The lab is `/var/www/projects/gunx-lab` (not a git repo). Evidence: `LOG.md` (lap by lap, with numbers), `LEDGER.md` (one verdict per item of `bun-audit.md`, `bun_r2_audit.md`, `bun_r2_finding.csv`), `gunx-bun/engine/bun` and `gunx-bun/product/apex/{web,desktop,mobile,api}`, the journeys in `probe/journeys`. Nothing in this tree was changed except this file and `python-review.md`.

## 1. Verdict

- The lab engine is frontend-only: zero backend or tooling markers in the three shipped bundles (`probe/bundle.sh`: web 0, desktop 0, Hermes 0, iOS 0; this tree's Hermes: 13). Server work left the runtime for `<member>/kit` doors a runtime file cannot reach (a tested law).
- Smaller, faster and leaner: entry closures 971,245 B against 1,127,659 B (−13.9%) with six more members; over the 18 cases both engines share, a geometric mean of 2.08× faster and none slower (1.02× to 28×); retained memory −75% for a bare dictionary and 14% fewer live objects for a number formatter, level elsewhere (§2).
- API surface: 48 doors and 1,250 exports against 36 and 1,193. Every one of this tree's 149 exports the lab lacks at the same path is accounted for: 116 under their right owner (`world` → `style`, tooling behind `kit` doors), 11 renamed, 21 server or tooling verbs removed by verdict, and one the lab had lost without a verdict (`translate.currencyName`), restored.
- Correctness: this tree's own suite run on the lab engine (in a scratch copy) passes 564 of 740; all 176 differences are classified against a ledger verdict with none left over, after the run exposed eight lab regressions that are now fixed (§4.13). The other way round, the lab's tests find two defects here (§3.10, §3.11).
- Security: dependencies 0 known vulnerabilities on both; no `eval`, `Function`, `innerHTML` or wildcard `postMessage` on either; backend markers 0 against 13; and the lab adds protections this tree lacks, each with a test (§4.13).
- The three parts carry a real multi-tenant product inside this tree's budgets: web super/admin/customer/courier, desktop the same four, mobile admin/customer/courier; ar/en rtl/ltr; light and dark as two art directions; 20 languages written in full and loaded on demand; 20 currencies and 20 zones per business; live updates over one socket; a business switch; one brand, one font pair, one icon set; styles identical in the three parts.
- Verified as a suite, not by hand: `probe/journeys` signs in through the real form and walks every screen of every role for every business × theme × direction — 351 checks over 68 combinations at desktop widths (lap 14), 497 visits at 390, 960, 1280 and 1440 px and on the React Native Web harness (lap 15), and at close 607 visits over the final lap (318 on the final code across desktop, web at 390 px and the RN-web harness, with 40 Team invite-and-dismiss rounds through the real form) — 0 problems after the fixes they forced.
- Native: the Electrobun Linux binary (2.0.6 through Hutch) signs in and works through native X input (WebKitGTK), and it found three defects Chromium had not (§3.10, §4.12); Android — a release APK built and inspected, not run on a device; iOS — the Hermes bytecode exported on Linux (customer 2,809,760 B, markers 0) and the Xcode project generated; not built (CocoaPods and `xcodebuild` need macOS).

## 2. Numbers

| Measure | Lab | This tree | Note |
| --- | --- | --- | --- |
| Engine entry closures | 971,245 B (43 members, 1,250 exports) | 1,127,659 B (37 members) | `bun run record` |
| API surface | 48 doors, 1,250 exports | 36 doors, 1,193 exports | every missing name accounted for (`scratchpad/surface/classify.py`) |
| This tree's suite on the lab engine | 564 of 740 pass; 176 differences, all classified | 754 of 756 on itself | `scratchpad/surface/xclass.py` |
| Dependencies, known vulnerabilities | 46 packages, 0 | 46 packages, 0 | `bun audit` |
| Speed, 18 shared cases | geomean 2.08× faster, none slower (1.02× to 28×) | | one engine per process, 3 processes per side alternating, median (`scratchpad/duel/iso.ts`) |
| Retained memory | dictionary 232 vs 926 B bare (−75%), 848 vs 1,476 B after lookups (−43%); number formatter 1,657 vs 1,738 B, 14% fewer objects; LRU, bus, formats level | | same work, heap after GC |
| Web initial JS, budget 800,000 | super 749,480 · admin 759,275 · customer 742,729 · courier 740,555 | admin 588,540 (hello only) | heaviest route |
| Desktop initial JS, budget 480,000 | super 471,449 · admin 479,992 · customer 465,315 · courier 463,366 | hello only | entry + static chunks |
| Hermes bytecode, budget 3,500,000 | admin 2,826,100 · customer 2,817,108 · courier 2,815,524 (iOS customer 2,809,760) | client 3,327,399 (hello only) | `expo export` android, source maps out of the bytecode |
| Backend markers in bundles | web 0, desktop 0, Hermes 0, iOS 0 | 13 on Android | `probe/bundle.sh` |
| Pre-paint appearance script | 7,105 B | 7,598 B | painted with `app.js` blocked |
| Mobile start-up (E5.7) | 347 of 620 modules before first render (was 501); first render 796 ms (was 871) | | release export, 15 alternating cold runs, 4× CPU |
| Engine gates | tsc 0 · biome 0 errors (182 baseline warnings) · 844 tests (lines 98.54%, functions 97.78%) · fuzz 236 · audit clean | | one run at close |
| Part gates | `check`, `lint`, `test`, `audit` exit 0 · tests 47 / 48 + 5 / 45 · audits clean | | web / desktop / mobile |

Product bundles and hello-only bundles are not comparable; the comparable figures are the engine closures, the duel, the markers and the appearance script.

## 3. Defects in this tree (the lab fix is proven)

1. **The runtime bundles the whole spec tree.** `product/apex/*/src/specs/deployment.ts` imports `current, roles` as values. Lab: the compiler writes the played role into `.cache/spec/current.json`; `deployment.ts` imports specs as types only. Web admin −27 KB; desktop admin 502,734 → 473,527 B.
2. **Desktop build takes its role from argv, the compiler from `ROLE`.** Lab: one source (`ROLE`); `--all` compiles per role and restores the cache.
3. **Next 16.4 writes `AGENTS.md` into `product/apex/web`** on `next dev` when it detects an agent. Fix: `agentRules: false`.
4. **Font preloads are emitted twice** (React 19 hoists the rendered `<link>` and keeps it). Fix: `preload()` from `react-dom`.
5. **`value.number("1.234,5")` and `("12,5")` answer `undefined`** (G6), and the options object can pass as the fallback. Lab: `value.number(text, { locale, fallback })` reads the locale's separators from `Intl.NumberFormat(locale).format`, Arabic-Indic numerals included; the parts' number and money fields use it.
6. **`userInterfaceStyle: "automatic"` without `expo-system-ui`** (`mobile/app.config.ts`): Android ignores it, so the native root does not follow the dark scheme. Lab: `expo-system-ui@58.0.7` (the SDK's range; lock sha512 equals the registry's); the rebuilt APK carries `expo_system_ui_user_interface_style=automatic`.
7. **The live contract is off** (`realtime: false`) while the engine's `api.live` already speaks first-frame auth, rooms and patches; the gateway serves no socket (python-review §2.8–2.9).
8. **The api client cache is never emptied** (no `forget` anywhere): harmless while `stores/client.ts` sends no token, a cross-user leak on a shared device once it does. Lab: the cache empties when the member or the business changes.
9. **A local native run breaks the mobile gates**: `expo prebuild`/`expo run:android` writes `android/`, and `mobile/biome.json` and `tests/architecture.test.ts` walk it (lint went from 195 to 351 files and failed). Lab: both skip `android/` and `ios/`.
10. **Arabic relative time writes Latin digits whatever the runtime says** (`engine/bun/src/date/src/format.ts`, `counted`): every other path formats through `Intl`, so on a runtime whose ICU maps `ar` to Arabic-Indic digits (WebKitGTK's system ICU; Bun 1.4.4 and Chromium 1243 map it to Latin) one screen shows "منذ 5 دقائق" beside "٢٢". Lab: `digitsOf(tag)` shared by the Arabic path and the CLDR tables; `ar-EG` → "منذ ٣ دقائق", `ar-u-nu-latn` → "منذ 3 دقائق".
11. **A late call from a replaced crypto provider takes the key cache back** (`engine/bun/src/crypto/src/digest.ts`, `kept`): a `mac` begun before `crypto.engine.use(...)` swapped the provider reaches the cache after the new provider stored its key, sees another owner, clears the cache and owns it again, so the new provider imports its key a second time. It showed as a once-per-run failure of `a rejected old provider key never evicts the new provider cache entry` (passes alone). Lab: a call whose provider is no longer `engine.get()` keeps its key to itself; a test that holds the old provider's `sign` behind a gate fails 3/3 on the old code and passes after.
12. **The contract names members that do not exist** (E2, `tutor/stack/engine/bun/index.md:39`): the door law still names `store/zustand.ts` and `store/bind.ts` and the Cache law says "`store` persists through a box", while the code has `state` and `state/zustand.ts`, and React left the engine. An agent following the contract writes against doors that are not there. Not edited here (the tutor is the owner's); the lab's member table is `tests/size.json` (43 members).

## 4. What the lab adds, in port order

Each line names its owner; the lap in `LOG.md` carries the evidence and the tests.

1. **Purity** (lap 2): runtime deletions (hashing, JWT signing, cookie signing, limiter, net fences, `rand.otp`, `auth.authorize`, the error phrase table), one `kit` door per member, the `runtime` and `kit` laws.
2. **Correctness and security** (lap 3–4, 11): confidential credentials, lazy date and translate tables, `date.zone`, nested query encoding, deny precedence, CSP `connect-src` with the ws origin; `cache.peek` and `state.inspect` (synchronous reads before first paint); `number.FormatOptions.display` (`symbol | narrow | code`); `translate.t` without allocation on the hot path.
3. **Structure** (lap 5–6): `world` (data) and `style` (color, theme, tokens, looks, motion, icons); spec DSL resources, lifecycle, `live.placed`; api contracts lazy per resource.
4. **Speed and memory** (lap 13): native base64, `json.clone` plain fast path, `json.diff` gather, `deepMerge` key loop, `list.sortBy` single-key path, bus newest-topic keep, `func.memo` primitive keys, number formatter slots per currency, `date.format` quick maps, `translate` `Speaker` with prototype methods and a lazy lost-key set, plural cache, search BM25 norm cache. Tried and reverted (no win): Map-order LRU, native `Map.groupBy`, bound unsubscribe, an async-require switch.
5. **One style for three surfaces** (lap 7, 15): `style.looks/sheet/resolve`, identical `styles/{tokens,globals,elements}.ts`, Tailwind and PostCSS removed, AA contrast tested for ten brands; `globals.ts` is `floor` (resets, before the looks) and `overrides` (media, context, platform quirks, after the looks).
6. **Fonts and icons** (lap 7, 10): Geist 1.900 + Vazirmatn 33.003 (OFL, tabular Arabic digits), `world.typeface`; Phosphor 2.1.1 with 103 RTL mirrors; `tool.iconFont` cuts the official font to the glyphs a surface names (9,864 B for 34 icons) so mobile drops `react-native-svg` (−125 KB).
7. **Pre-paint and native shell** (lap 10–11, 14): a blocking `appearance.js` paints the saved language, direction and scheme before the app (7,105 B); native `flexDirection: row` default, `height: screen` = `flex: 1; min-height: 0`; mobile bottom bar ≤ 5 with "more"; Android back and deep links (`native/links.ts`); `inlineRequires` on (E5.7); the Hermes budget measures what ships (`hermesc -O` alone keeps debug info in the bytecode, 3,471,491 B for the admin JS; release builds move it into the source map, 2,764,748 B), so the second close's "11,866 B left" was a measuring error.
8. **Twenty languages** (lap 11, 15): 18 sheets beside ar/en (339 keys, CLDR plural forms), validated by the compiler; a role ships only the copy its features read; web/desktop load a sheet as its own chunk, mobile as an app asset, and `setLocale` waits for it, so English never flashes; counts inside copy speak the locale's numerals and pick the plural by value (`use-format.counted`).
9. **Money and time per business** (lap 11–12): operator tables and boards name currencies by code; KWD 1,234.567, JPY 98,000 and per-currency revenue seen in the browser; typed amounts read in the typist's locale and become minor units by the currency's exponent, refusing extra decimals.
10. **Live** (lap 12): `contracts.realtime = "/api/live"`; one socket per signed member, closed on sign-out or member change; boards refresh on `orders.changed` (debounced), tables patch rows in place, track merges a validated courier fact. Seen: frame 17 ms after checkout, desktop board updated without reload; mobile list from empty to the new order in 174 ms.
11. **Business switch** (lap 12): a member of several businesses picks one (web/desktop header select, the menu drawer on narrow screens, mobile header chooser); iam starts a session there and ends the old one; content remounts, the client cache and the socket follow the business.
12. **Journeys** (lap 14–15, B-M8): `probe/journeys/journeys.ts` signs in through the real form and walks every screen of a role for every business × theme × direction, at any `VIEWPORT`, asserting lang/dir, the canvas per theme, no horizontal overflow, no failed boundary, real content, no page or console error; actions: a note written and removed, a checkout refused without an address then placed, a shift started. What the native window and the narrow screens found, all fixed in the lab: the header pickers squeezed below their text (compressible controls with a percentage width), native checkboxes white on dark in WebKitGTK, two numeral systems on one Arabic screen (§3.10), the floor's responsive rules dead behind the looks (the rail never hid on a phone, seen; the toast's viewport cap lost to the look's 420 px, read in the cascade), header actions overflowing by 4 px, cards sized to their text (Block directions `grid` for a catalogue and `tiles` for a strip of figures), sign-in fields without a purpose (`Field kind="email" | "code"`: type, `inputmode`, `autocomplete`, `dir="ltr"`; native keyboard and autofill — WCAG 1.3.5).
13. **Measured against this tree, axis by axis** (lap 16): this tree's suite on the lab engine exposed eight lab regressions, fixed with its tests adopted — `adapter.family` scoped preferences (`use`, out-of-order restores), `cache.use` restoring out of order, `number.abbreviate` refusing non-finite amounts, `world` names in the eighteen languages its catalog lacks (through `translate`), an omitted `world` catalog refused instead of ready-and-empty, `translate.currencyName`, the CSV guard (leading newline and whitespace, full-width ＝＋－＠, guarded cells quoted), and `cache.open` refusing an option it does not know (a `secret` meant to seal had been dropped and the value stored in plain text). Protections the lab has and this tree lacks, each with a test: credentials only in confidential storage, opaque crypto cache keys, device keys instead of secret strings, browser cookie rules, refuse-never-drop queries, OAuth `code` and `state` masked in logs, unknown box options refused, the provider race fixed, the CSV guard on by default. Two flaky tests made deterministic (a socket heartbeat raced a 25 ms window; a Python test leaked a connection into the next one).
14. **The product's open doors** (lap 16): a Team screen for every admin (invite by email, role, dismiss; a business keeps one admin; a removed member's sessions end) built from the spec alone, with its copy in twenty languages; `email` fields with their purpose; a not-found page for an address no screen owns; a `not-found` shell on the web so a static host's `404.html` boots the app on any record URL; sign-in returns to the page that asked through `spec.safeReturn`; the device remembers the last business (a slug) and sign-in opens there; the compiler cuts resource copy per role; orders record the customer's name through the relay (python-review §2.12); list search and paging in SQL (python-review §2.13). Seen in Chromium: Team rounds through the real form and confirm dialog, a deep link to `/orders/{id}` from a cold start back to the order, and the courier's marker and distance moving live (9.2 → 8.7 → 6.2 km).

## 5. Rejected, and why

| Item | Reason |
| --- | --- |
| R1-LIMIT-001 limiter | server rate limiting; left the runtime |
| R1-NET-001, forwarded-header trust | reads an incoming request: server work |
| R1-NET-002 egress/DNS rebinding | backend defence; the fence left the runtime |
| R1-GATE-001 | artefact of the audit's ZIP; `bun.lock` exists and gates install frozen |
| R1-PERF-001, B-M10 bench baselines | benches print and judge nothing (tutor); a perf gate on a shared box is noise — the duel is a probe, not a gate |
| `MIGRATION.md` | consumers move in the same lap; the review carries the moves |
| C1 SSR request context, C1 Pusher protocol, D7 PHP decoders, D20 social providers | backend work or vendor quirks (retracted) |
| A6 expiry side index | `keys()` is correct (expired and undecodable entries dropped); the 27× cost is on listing, and no surface lists keys |
| Deferred, no consumer in scope: B-H8 structured `store`, `sync`, persisted api cache, OAuth/3DS/KYC handoff, D2 step-up, D6 runtime contract, D18 range facets | they return with the first real consumer |

## 6. Not verified

- iOS: exported and prebuilt, not built (CocoaPods and `xcodebuild` need macOS). Android on a device (none attached; no KVM for an emulator): the APK was built and inspected, not installed. Electrobun on macOS (WKWebView) and Windows (WebView2). Release signing (the APK carries the debug key).
- Mobile Team actions: the RN screen is visited by the journeys, but its invite form uses a native chooser the probe does not drive; web and desktop drive it.
- Native brand fonts: the engine ships woff2 only; native falls back to the system face (the icon font is embedded, verified inside the APK).
- Native geolocation (`expo-location`), secure storage on device, `boxShadow` on Android.
- land-book.com: 403 to Chromium and WebFetch, no Chrome for the DevTools MCP, the Wayback Machine unreachable from this box; studied through its listings and third-party descriptions only (lap 16). The other five galleries were studied directly (lap 7).

## 7. Next round

1. Desktop admin has 8 B left under its 480,000 budget after Team (Hermes has about 670 KB): your decision — load the English sheet lazily like the other eighteen (about −6 KB; it reverses lap 11's "ar and en ship with the bundle") or raise the budget.
2. Keep the web session across a reload: credentials live in memory by verdict (A3), so a reload signs out; a refresh token in an `httpOnly` cookie set by the gateway keeps it without exposing it to scripts.
3. Pin the numbering system per business (`-u-nu-`) so a member sees one set of digits on every device; today each runtime's ICU decides for plain `ar`.
4. Native brand fonts as TTF instances, embedded like the icon font (the APK proves the path).
5. Row actions: keep the primary action, move the rest into an overflow menu (the board's rows wrap their time cells at 1280 px).
6. iOS and release signing on a machine that has macOS and the owner's keys.
