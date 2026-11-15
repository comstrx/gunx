# Bun engine migration notes

These changes describe the incoming-review audit baseline to the current implementation. They are not a package version or a claim that native deployment is complete.

| Previous use | Current contract |
| --- | --- |
| React supplied implicitly by state | A consumer passes a renderer to `state.bind(source, server?, renderer)`. Plain selection remains renderer-free. |
| Full hosted facade imported in browsers | Browser/react-native conditions select portable exports. Import hosted `tool`/`test` explicitly. |
| `socket.open` implied the API wire | Use `api.connect`, or supply `socket.open({ protocol })`. |
| `socket.encode/decode/presence` | Use `api.encodeFrame/decodeFrame/presence` and API-owned presence types. |
| Socket `auth` option | API `connect` owns auth. A custom socket uses a neutral `prepare` prelude. |
| Hosted `test.live` assumed wire encoding | Pass its codec explicitly. |
| Unlimited default reconnect | Eight default attempts; choose another explicit policy when required. |
| Queue mutation on storage without shared locking | Supply a locking provider, or explicitly select `guard: "local"` for single-instance ownership. |
| Observer failure could reject a committed write | Await `flush` separately to observe notification completion/failure. |
| Custom Storage had no flush | Implement `Storage.flush`; a raw Driver's flush is optional. |
| `cache.use` had no restoration result | Retain and invoke its idempotent disposer when the binding owner ends. |
| `touch` or exclusive mutation could erase expiry | Existing expiry is retained unless the operation explicitly refreshes it. |
| Full limiter evicted active quota | New identities are refused until capacity expires; invalid costs refuse. |
| `facts` inferred identity from supplied forwarded headers | Default is direct remote only; positive hop count is an explicit caller trust decision. |
| Malformed successful JSON could retry | Protocol failure is reported without another request. |
| Only per-attempt timeout | Optional total `budget` includes retries, waits and API token acquisition. |
| Shared client relied only on mutable default locale | A call can capture its own `locale`. |
| Every client generated request-id headers | `trace: false` opts out; supplied headers are preserved. |
| Invalid amount displayed as zero | Number, currency, percent and compact formatters reject invalid/non-finite amounts. |
| Base-1024 units named KB/MB | Units are KiB/MiB/GiB. |
| Noncanonical Base64 could decode | Bad padding, mixed alphabets and noncanonical tail bits return the established empty-byte refusal sentinel. |
| Unsupported words/plurals fabricated English | Number words refuse unsupported locales; explicit non-English plurals are required; non-English ordinal display is plain numeric. |
| Omitted catalogue looked successfully empty | Loads refuse; required catalogues must be selected by the surface. |

Box TTL remains seconds. In-memory TTL and scheduling durations remain milliseconds. No silent duration-unit conversion is introduced.

The frontend parts now own renderer bindings, shared client composition, lazy feature entrypoints, role-selected locales/fonts/easing and optional bidi isolation. Web/desktop appearance reads validated persisted preferences before paint; normal hydration remains responsible for state and migration. Desktop CSP explicitly permits only the matching API WebSocket origin.

Ordinary pretty JSON uses a replacer to avoid Bun's cyclic serialization allocation regression. It preserves getter/toJSON behavior and the strict tool writer's refusal contract, with a measured ordinary-pretty throughput cost. Compact serialization retains its native fast path. Compare actual workload evidence before choosing formatting for a hot path.

Crypto key-label hardening has a measurable cost in repeated password-based encryption operations. Wire formats, PBKDF2 work factor and encryption parameters are unchanged. Performance measurements must include both cold derivation and warmed operations.
