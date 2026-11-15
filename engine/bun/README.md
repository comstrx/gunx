# TypeScript engine

36 capability members and the `engine` facade provide portable mechanisms for web, mobile and desktop applications. Import namespaces from `engine/<member>`. Browser and React Native resolution of the facade includes portable members; hosted development utilities use the explicit `engine/tool` and `engine/test` doors.

Frameworks, native adapters and product policy belong to consumers. Only `api`, `spec` and `tool` interpret their supplied API, specification and build contracts. Members do not import those terminal owners or each other's implementation files. Public definitions live in each member's `src/arch.ts`; `src/index.ts` only exports.

## Choose the owner

| Need | Members |
| --- | --- |
| Capability binding and native mechanisms | adapter, device, fs |
| Typed faults, events and bounded work | error, event, func |
| Serialization, parsing, validation and values | json, parse, validate, value |
| Text, numbers, dates and geography | string, number, date, geo |
| Collections, search and virtual layouts | list, search, virtual |
| Persistence, outbox and history | cache, queue, history |
| State, forms and identity | state, form, auth |
| Randomness and cryptography | rand, crypto |
| HTTP, streams and realtime transport | net, socket |
| Localization, catalogues and appearance | translate, world |
| Logging and search metadata | log, seo |
| Supplied API and surface contracts | api, spec |
| Hosted development and data generation | tool, test, fake |

`world` intentionally owns related world catalogues, languages, currencies, flags, emoji, colors, icons and appearance mechanisms. Its breadth is part of the design.

## Bind capabilities at application boot

Use a member's port or `cache.use(kind, driver)` to install the platform implementation. Keep its returned disposer and release it when that owner ends. Port bindings are a shared stack; `port.with` is scoped restoration, not asynchronous task isolation. Do not change process-wide bindings per concurrent request.

A React consumer supplies the rendering bridge:

~~~ts
import * as state from "engine/state";
import { useRef, useSyncExternalStore } from "react";

const renderer: state.Renderer = { ref: useRef, read: useSyncExternalStore };
const bound = state.bind(source, serverSnapshot, renderer);
~~~

The engine imports no React runtime. `bound.select` is usable without a renderer; hook operations require one. Keep framework adapters in their consuming part.

## Bound work and storage

~~~ts
import * as func from "engine/func";
import * as cache from "engine/cache";

const jobs = func.lane(4, { pending: 128 });
await jobs.run(() => load(controller.signal), controller.signal);
await jobs.idle();

const box = cache.open({ kind: "local", prefix: "preferences" });
await box.set("locale", "ar", { ttl: 3600 });
await box.flush();
~~~

A lane defaults to 4096 pending admissions; saturation rejects with `lane.full` before invoking work. Active work owns cooperative cancellation. `list.eachAsync` and `list.mapAsync` default to four concurrent calls and drain active calls before reporting failure.

A Box's TTL is **seconds**. Ephemeral map TTLs, timers, API deadlines and queue delays are **milliseconds**. Explicit units are part of each contract. `touch` preserves an entry's expiry unless a refresh TTL is supplied or configured. Atomic updates need the selected storage's shared lock.

`box.keys()` lists physical keys in its selected namespace, including entries awaiting expiry cleanup. `all()` filters through live envelope reads. An unprefixed Box owns the entire selected store; its `clear()` clears that store. Supply a prefix for application-owned data.

Writes acknowledge persistence independently of observer completion. Await `box.flush()` or `storage.flush()` to drain notifications and report retained observer failure. Do not call and await that same flush from its own observer. `cache.peek` reads only a plain, unencrypted envelope; `state.inspect` accepts only the matching saved-state version. Neither performs a migration or proves an external value's domain schema.

Queue operations require shared storage locking by default. `guard: "local"` explicitly selects a single-instance queue; it cannot coordinate tabs or processes. Lease fencing prevents obsolete completions; delivery remains at least once. Destroy an outbox when its owner ends.

## Requests and realtime

`net.request` and API calls accept an overall `budget` in milliseconds, in addition to the per-attempt `timeout`. API budgets include token acquisition. Cancellation stops admission of late work and prevents stale identity changes from replacing current cache state.

Reuse API clients at the application or feature composition boundary. Supply `call.locale` when concurrent calls need independent locales. Context belongs in cache keys. Custom-header calls bypass shared cache.

Request tracing defaults on. `trace: false` suppresses generated request-id headers in both API and HTTP layers; explicitly supplied headers remain. This allows a simple cross-origin GET when its other method and header choices satisfy the browser's CORS rules.

Use `api.connect` for the supplied API wire. Use `socket.open({ protocol, ... })` for another protocol. The protocol owns serialization, control messages, identity and close interpretation; the socket owns connection lifecycle, bounded queues and transport limits. API presence helpers live in `api`.

Default reconnect permits eight attempts. Normal and policy closes are terminal unless the caller chooses otherwise. API authentication close 4001 is terminal. Pending requests are bounded even when the native socket's send buffer is empty.

`net.facts` ignores forwarded identity and scheme by default. A host that has independently established its trusted proxy chain can supply a positive hop count. `forwardedFor` only parses a header; it cannot establish trust. URL guards constrain URL origins and redirect policy; server DNS resolution, connection pinning and egress controls belong to the host.

## Text, amounts and localization

`string` owns Unicode 17 grapheme boundaries, including a pinned fallback when Intl.Segmenter is unavailable. Prefix operations stop after their requested budget. Negative `take` counts select trailing graphemes; complete trailing selection still materializes boundaries. `byteLength` counts UTF-8 bytes without an encoded buffer, including lone-surrogate replacement.

`list.best(iterable, comparator, limit)` selects stable ranked results without sorting the entire input for a small result window. It retains O(limit) selection state; full selection uses native stable sorting.

Numeric display rejects malformed or non-finite amounts instead of fabricating zero. Byte counts use binary units KiB/MiB/GiB. Money arithmetic and storage exponents belong to `value.money`; localized display digits follow Intl/CLDR and need not match storage exponents.

Plural categories delegate to bounded cached Intl.PluralRules. Number words currently support Arabic and English; unsupported locales refuse. Non-English ordinals return plain digits, and non-English word pluralization needs an explicit plural form. Transliteration preserves its existing Egyptian mapping; it is not a language-neutral phonetic standard.

`translate.dictionary` owns message lookup, fallback, interpolation and plural forms. Surface locale selection, URLs, fonts and branding belong to the role spec. `world` display names delegate to translation for additional locales while retaining its catalogue aliases.

World catalogues load explicitly. Required feature catalogues belong in `Manifest.world` and must be selected by the surface. Omitted or empty catalogues refuse with `world.refused`; they never masquerade as a successfully loaded empty catalogue. Selecting a catalogue currently promises its complete contents, not an implicit subset.

## Security and lifecycle boundaries

Cryptographic operations retain the acquiring provider across awaits and snapshot mutable inputs. Key labels do not retain plaintext secrets. Nonextractable native keys are not a guarantee against complete runtime compromise.

An auth session uses the Box supplied by its consumer. The Box type does not certify confidential storage. Select token custody at the platform boundary: a browser server-session design and a native OS credential-store adapter have different requirements. Encrypting browser storage with a colocated key does not supply that guarantee.

CSV serialization is lossless by default. For spreadsheet-oriented text exports select `guard: true`; it quotes guarded fields and prefixes formula-like/control-leading cells. Spreadsheet re-saving and subsequent interpretation need application-specific validation.

Strict validation code generation can be refused by CSP. The ordinary compile path falls back to its original schema; strict mode reports the failure. A compiled surface ships through `spec.revive` without requiring the schema compiler at runtime.

State resources, form verification, session renewal and queue completions publish only while they own the active operation. Release subscriptions, timers and outboxes with their owner. Flush delivery-oriented loggers before destroying them when delivery is required.

## Verify changes

From this workspace:

~~~sh
bun run gate
bun run bench
~~~

The gate checks the frozen dependency graph, types, lint, unit tests, executable-source coverage, property/model fuzzing and dependency audit. Aggregate coverage floors remain 95% lines and 90% functions; per-file floors remain 75% and 50%. A subprocess memory guard covers the cyclic pretty-JSON regression.

Source laws verify dependency direction, library ownership, portable host boundaries and file structure. Each member owns unit, fuzz and benchmark entry files. The export-name inventory checks presence, not behavioral correctness; behavioral tests and adversarial scenarios remain necessary.

`bun run record` deliberately updates public runtime names and browser closure snapshots. Review changes before adopting records. Closure sizes, emitted application bytes, loaded browser resources, operation timings and retained memory measure different things.

Native claims require native execution. Next production builds, Expo Hermes exports and browser execution of desktop artifacts are useful evidence with distinct limits.

See [MIGRATION.md](MIGRATION.md) for intentional compatibility changes from the incoming-review baseline.
