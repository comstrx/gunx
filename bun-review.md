# Bun review — lab round close

2026-11-15 · for the owner and the agent working on this tree. Second close: supersedes the first.

The lab is `/var/www/projects/gunx-lab` (not a git repo). Evidence: `LOG.md` (lap by lap, with numbers), `LEDGER.md` (one verdict per item of `bun-audit.md`, `bun_r2_audit.md`, `bun_r2_finding.csv`), `gunx-bun/engine/bun` and `gunx-bun/product/apex/{web,desktop,mobile,api}`. Nothing in this tree was changed except this file and `python-review.md`.

## 1. Verdict

- The lab engine is frontend-only: zero backend or tooling markers in the three shipped bundles (`probe/bundle.sh`: web 0, desktop 0, Hermes 0; this tree's Hermes: 13). Server work left the runtime for `<member>/kit` doors a runtime file cannot reach (a tested law).
- Smaller and as fast: entry closures 957,613 B against 1,127,659 B with six more members; speed and retained memory within ±5% of this tree on the 16 functions both share (§2).
- The three parts carry a real multi-tenant product inside this tree's budgets: web super/admin/customer/courier, desktop the same four, mobile admin/customer/courier; ar/en rtl/ltr; light and dark as two art directions; 20 languages written in full and loaded on demand; 20 currencies and 20 zones per business; live updates over one socket; one brand, one font pair, one icon set; styles identical in the three parts.
- Native: Android — a release APK built and inspected (Hermes bytecode, the embedded icon font, the 18 language sheets as assets), not run on a device; desktop — the Electrobun Linux binary built and painting the surface under Xvfb; iOS not built (§6).

## 2. Numbers

| Measure | Lab | This tree | Note |
| --- | --- | --- | --- |
| Engine entry closures | 957,613 B (43 members, 1,249 exports) | 1,127,659 B (37 members) | `bun run record` |
| Web initial JS, budget 800,000 | super 747,519 · admin 753,483 · customer 743,125 · courier 740,271 | admin 588,540 (hello only) | heaviest route |
| Desktop initial JS, budget 480,000 | super 468,750 · admin 473,851 · customer 464,815 · courier 462,238 | hello only | entry + static chunks |
| Hermes bytecode, budget 3,500,000 | admin 3,488,134 · customer 3,483,151 · courier 3,481,077 (the APK's embedded customer bundle: 2,773,584) | client 3,327,399 (hello only) | `expo export` android, copy sheets as assets |
| Backend markers in bundles | web 0, desktop 0, Hermes 0 | 13 on Android | `probe/bundle.sh` |
| Pre-paint appearance script | 7,105 B | 7,598 B | painted with `app.js` blocked |
| Speed, 16 shared functions | parity ±5% | | 9 interleaved rounds per side, both creation orders, sub-µs functions one side per process |
| Retained heap after the same work | ±4% | | `scratchpad/duel/mem.ts` |
| Engine gates | tsc 0 · biome 0 errors (182 baseline warnings) · 834 tests (lines 98.61%, functions 97.81%) · fuzz 236 · audit clean | | one run at close |
| Part gates | check 0 · biome 0 · tests 47 / 48 + 5 / 45 · audits clean | | web / desktop / mobile |

Product bundles and hello-only bundles are not comparable; the comparable figures are the engine closures, the markers, the appearance script and the duel.

## 3. Defects in this tree (the lab fix is proven)

1. **The runtime bundles the whole spec tree.** `product/apex/*/src/specs/deployment.ts` imports `current, roles` as values. Lab: the compiler writes the played role into `.cache/spec/current.json`; `deployment.ts` imports specs as types only. Web admin −27 KB; desktop admin 502,734 → 473,527 B.
2. **Desktop build takes its role from argv, the compiler from `ROLE`.** Lab: one source (`ROLE`); `--all` compiles per role and restores the cache.
3. **Next 16.4 writes `AGENTS.md` into `product/apex/web`** on `next dev` when it detects an agent. Fix: `agentRules: false`.
4. **Font preloads are emitted twice** (React 19 hoists the rendered `<link>` and keeps it). Fix: `preload()` from `react-dom`.
5. **`value.number("1.234,5")` and `("12,5")` answer `undefined`** (G6), and the options object can pass as the fallback. Lab: `value.number(text, { locale, fallback })` reads the locale's separators from `Intl.NumberFormat(locale).format`, Arabic-Indic numerals included; the parts' number and money fields use it.
6. **`userInterfaceStyle: "automatic"` without `expo-system-ui`** (`mobile/app.config.ts`): `expo prebuild` warns that Android ignores it, so the native root does not follow the dark scheme. Fix: add `expo-system-ui` (SDK-matched) — lab: `expo-system-ui@58.0.7` (the SDK's range; lock sha512 equals the registry's); the rebuilt APK carries `expo_system_ui_user_interface_style=automatic`.
7. **The live contract is off** (`realtime: false`) while the engine's `api.live` already speaks first-frame auth, rooms and patches; the gateway serves no socket (python-review §2.8–2.9).
8. **The api client cache is never emptied** (no `forget` anywhere): harmless while `stores/client.ts` sends no token, a cross-user leak on a shared device once it does. Lab: the cache empties when the member or the business changes.
9. **A local native run breaks the mobile gates**: `expo prebuild`/`expo run:android` writes `android/` (gitignored at the root), and `mobile/biome.json` and `tests/architecture.test.ts` walk it (lint went from 195 to 351 files and failed; the nameless law failed). Lab: both skip `android/` and `ios/`.

## 4. What the lab adds, in port order

Each line names its owner; the lap in `LOG.md` carries the evidence and the tests.

1. **Purity** (lap 2): runtime deletions (hashing, JWT signing, cookie signing, limiter, net fences, `rand.otp`, `auth.authorize`, the error phrase table), one `kit` door per member, the `runtime` and `kit` laws.
2. **Correctness and security** (lap 3–4, 11): confidential credentials, lazy date and translate tables, `date.zone`, nested query encoding, deny precedence, CSP `connect-src` with the ws origin; `cache.peek` and `state.inspect` (synchronous reads before first paint); `number.FormatOptions.display` (`symbol | narrow | code`); `translate.t` without allocation on the hot path.
3. **Structure** (lap 5–6): `world` (data) and `style` (color, theme, tokens, looks, motion, icons); spec DSL resources, lifecycle, `live.placed`; api contracts lazy per resource.
4. **One style for three surfaces** (lap 7): `style.looks/sheet/resolve`, identical `styles/{tokens,globals,elements}.ts`, Tailwind and PostCSS removed, AA contrast tested for ten brands.
5. **Fonts and icons** (lap 7, 10): Geist 1.900 + Vazirmatn 33.003 (OFL, tabular Arabic digits), `world.typeface`; Phosphor 2.1.1 with 103 RTL mirrors; `tool.iconFont` cuts the official font to the glyphs a surface names (9,864 B for 34 icons) so mobile drops `react-native-svg` (−125 KB).
6. **Pre-paint and native shell** (lap 10–11): a blocking `appearance.js` paints the saved language, direction and scheme before the app (7,105 B); native `flexDirection: row` default, `height: screen` = `flex: 1; min-height: 0`; mobile bottom bar ≤ 5 with "more"; Android back and deep links (`native/links.ts`).
7. **Twenty languages** (lap 11): 18 sheets beside ar/en (339 keys, CLDR plural forms), validated by the compiler (keys and placeholders; a broken sheet exits 1); a role ships only the copy its features read; web/desktop load a sheet as its own chunk, mobile as an app asset (`.lang` through `expo-asset`), and `setLocale` waits for it, so English never flashes.
8. **Money and time per business** (lap 11): operator tables and boards name currencies by code, so mixed currencies read evenly; KWD 1,234.567, JPY 98,000 and per-currency revenue seen in the browser; typed amounts read in the typist's locale and become minor units by the currency's exponent, refusing extra decimals (lap 12).
9. **Live** (lap 12): `contracts.realtime = "/api/live"`; one socket per signed member, closed on sign-out or member change; boards refresh on `orders.changed` (debounced), tables patch rows in place (`orders`, `couriers`, `jobs`, `mine`), track merges a validated courier fact. Seen: frame 17 ms after checkout, desktop board updated without reload; mobile list from empty to the new order in 174 ms.
10. **Business switch** (lap 12): a member of several businesses picks one (web/desktop header select, mobile header chooser); iam starts a session there and ends the old one; content remounts, the client cache and the socket follow the business.

## 5. Rejected, and why

| Item | Reason |
| --- | --- |
| R1-LIMIT-001 limiter | server rate limiting; left the runtime |
| R1-NET-001, forwarded-header trust | reads an incoming request: server work |
| R1-NET-002 egress/DNS rebinding | backend defence; the fence left the runtime |
| R1-GATE-001 | artefact of the audit's ZIP; `bun.lock` exists and gates install frozen |
| R1-PERF-001, B-M10 bench baselines | benches print and judge nothing (tutor); a perf gate on a shared box is noise |
| `MIGRATION.md` | consumers move in the same lap; the review carries the moves |
| C1 SSR request context, C1 Pusher protocol, D7 PHP decoders, D20 social providers | backend work or vendor quirks (retracted) |
| A6 expiry side index | `keys()` is correct (expired and undecodable entries dropped); the 27× cost is on listing, and no surface lists keys |
| E5.7 `inlineRequires` | start-up gain needs a device to measure |
| Deferred, no consumer in scope: B-H8 structured `store`, `sync`, persisted api cache, OAuth/3DS/KYC handoff, D2 step-up, D6 runtime contract, D18 range facets | they return with the first real consumer |

## 6. Not verified

- iOS (no Xcode on this box) and Android on a device (none attached): the APK was built and inspected, not installed. The Electrobun binary was built and launched under Xvfb (it paints the surface); input inside it was not driven. Release signing (APK signed with the debug key) is not set up.
- Native brand fonts: the engine ships woff2 only; native falls back to the system face (the icon font is embedded, verified inside the APK).
- Native geolocation (`expo-location`), secure storage on device, `boxShadow` on Android.
- The courier marker moving on the track screen in a browser (the facts reach the customer's socket in the e2e; the merge is shared, type-checked code).
- Automated journeys (B-M8): journeys were driven in Chromium and the React Native Web harness, not as a suite.
- A static host's fallback for record URLs (`/orders/{id}` is not prerendered).

## 7. Next round

1. Hermes admin has 11,866 B left under its budget: the next mobile feature needs lazy chunks or a budget decision.
2. Native brand fonts as TTF instances, embedded like the icon font (the APK proves the path).
3. Row actions: keep the primary action, move the rest into an overflow menu.
4. The journeys as a Playwright suite over the three parts, run against the lab stack.
5. iOS, release signing, and Electrobun 2.0.6 (npm `latest` since 2026-11-04; bump through Hutch, `native/.hutch/devkit` is a 2.0.5 projection).
