# Python review — lab round close

2026-11-15 · for the owner and the agent working on this tree. Fourth close: supersedes the third.

The lab copy is `/var/www/projects/gunx-lab/gunx-bun/{engine/python,product/apex/api}`; the merge record and numbers are in `/var/www/projects/gunx-lab/LOG.md` (lap 0, 8–9, 10, 11, 12, 14, 16). Nothing in this tree was changed except this file and `bun-review.md`.

## 1. What the lab holds

- **engine/python**: the three-way merge of the lab engine and this tree (469 files the same, 45 lab-only kept, 61 real-only and 32 real-new taken, 12 merged by hand), plus the live channel members (§2.8–2.10). Gates at close: ruff clean, mypy strict 497 files, pytest 1,798 passed / 3 failed / 7 skipped — the three need what this box does not give: the `rand` fork, `translate` accept-language, and the identity reset (the lab role lacks `CREATEROLE`); the MySQL DNS example passes now.
- **product/apex/api**: nine services — eight domains (`iam`, `hello`, `notify`, `tenant`, `catalog`, `dispatch`, `order`, `notes`) and the `gateway` — over one shared `contract` package (the second close said "nine services" for eight and the contract). `tenant`, `catalog`, `dispatch`, `order` and `notes` now keep their rows in Postgres beside `iam` and `notify` (one schema and one migration ledger each, seeds only outside production, production refuses the lab URLs); 13 orders survived an order-service restart. The gateway has 65 doors and one socket (`/api/live`). The contract carries the 20 currencies, 20 locales and 20 zones the product offers, and the live vocabulary. Gates at close: ruff clean, mypy 424 files, pytest 28/28, pip-audit clean (third-party only; 45 workspace packages are editable).
- Live, observed: `smoke.py` and `smoke_zone.py` pass through the gateway (OTP for super, admin, courier, client; lists, search, late filter, metrics per currency and zone, assign, checkout, presence → locate → accept → pickup, isolation 403/404); the live probe gets each role exactly its facts (§3.6). The parts' journeys (bun-review §4) drive every screen of every role through the gateway: 0 problems at every width and in every role (bun-review §1).

## 2. Engine findings

1. **CORS allow-list misses the headers the TS wire sends** (`traceparent`, `tracestate`, `x-client`, `x-currency`, `x-tenant`, `x-csrf-token`): browser calls failed preflight. Lab: `HEADERS` carries them.
2. **The OTP flow needs a ready keyring**: `auth.otp` raised `crypto.setup` on a fresh service. Lab `iam` calls `crypto.setup` at boot.
3. **Strict list queries refused what every list sends** (`page`, `limit`, `late` arrive as strings). Lab: `Listing.prepare` normalizes first.
4. **Outbox relays compete across processes that share a schema**: a dev stack and the test suite take each other's events (`broker.unroutable`, `attempts=6`).
5. **Tests drop the dev database's schemas** (`tests/conftest.py` drops `iam` and `notify` where a local stack lives). Lab: the suite owns `iam_test` and `notify_test`; the api suite passes with the lab stack running.
6. **This tree's `iam` cannot boot.** `bootstrap/app.py` calls `auth.setup(…, fixed_code=settings.fixed_code)` without `testing=`, the default is `"000000"` (a local `.env.production` sets it again), while the engine refuses a fixed code outside testing (`auth.py`, `if fixed_code is not None and not testing`). Read, not run here; the lab's first baseline on this tree's api showed it failing. Second trap: `Settings.load` skips an empty value, so a non-empty default can never be cleared from the environment. Lab: default empty, `testing=env.stage() != "production"`, local env and tests set the code explicitly.
7. From the merge (both trees): `rand` fork and `translate` accept-language fail; this tree also fails the database identity reset (assumes a superuser), the package law and a racers stray error; a delayed or throttled job still sleeps inside the worker slot for non-memory brokers.
8. **A browser cannot authenticate a socket.** `Channel.upgrade` passes `request.actor()`, which reads only `Authorization`; browsers cannot set headers on a WebSocket. Lab: `Sockets.admit(check, within=5.0)` — the first frame must be `auth`, `check` returns an `Admission(actor, tags, expires)`; silence, another first event or a refused check closes 4001, the token's `exp` closes 4002 (the TS client reconnects on 4002 and stops on 4001). `Channel` hands the upgrade's fingerprint to the socket; `auth.recognize(token, fingerprint)` runs `alive`'s revocation and session checks on a carried token.
9. **Fan-out cannot be scoped.** `Hub.emit` and `Broadcast.publish` reach every member of a room, so one room per topic leaks across tenants. Lab: sockets carry tags; `emit`/`publish` take an audience (≤ 8 tag pairs, `*` matches all) that travels through Redis; history replays only what a joining socket may hear.
10. **No WebSocket client**, while aiohttp may only enter through `net` (door law) and the api bans it. Lab: `net.socket(url, headers, egress) → Wire` (`send`, `receive`, `code`, `close`) and `engine.test` `Client.socket(path)`.
11. `http/arch.py` `HEADERS` is one 191-character line (E501 in the lab after the CORS fix). Wrapped.
12. **The relay drops the actor's name.** `Relay.sign` carries id, roles, scopes and tenant; facts the token holds (the display name) stop at the gateway, so every service sees a nameless actor and orders stored an empty `customer_name`. Lab: a signed `X-Actor-Name` (percent-encoded, at most 120 characters, control characters refused, part of the signed payload so a changed name is refused; names with ZWNJ kept); `read` returns it in `facts`. Seen: a new order records "Client".
13. **No search verb a list can use without loading the table.** Lab: `Repository.matching(q, fields, page, limit, order, refine, **where)` — `LOWER(col) LIKE ? ESCAPE '!'` (portable: Postgres, SQLite, memory parity), count and page in SQL, `refine` for conditions like "late" (refused by the memory repository, which has no SQL); tested with `%`, `_` and `!` searched literally.
14. **A test leaks a connection into the next test.** `test_reset_restores_both_database_identities` opened its control connection outside its `try`; when the role cannot be created the connection stayed open and its `ResourceWarning` failed whichever test ran next (`test_video`). Lab: closed on that path; the test still fails honestly where `CREATEROLE` is missing.

## 3. API

1. **Done**: Postgres for five services; the live channel; `GET /api/tenant` (the signed member's business: currency, locale, zone); money and time per tenant (per-currency revenues, the board's day opens in the tenant's zone, `in:` rules for currency/locale/zone, 422 seen); a business switch (`POST /sessions/switch` ends the session and starts one in another membership; sessions carry `businesses` with id, slug and name; tested: stranger business 403, old access 401, old refresh revoked); memberships in a stable order (time, then id); test isolation; `iam` boots in production.
2. **Team administration** (lap 16, `iam` owns memberships): `GET /team` (search, role filter, sort, pages), `POST /team` (invite by email; a customer of the business can be promoted), `POST /team/<id>/role`, `DELETE /team/<id>`; a business keeps one admin; nobody removes themselves; a demoted admin's and a removed member's sessions in that business end at once; live `team.changed` to the business; four gateway doors; reasons in both languages; settings documented; production refuses the lab values. The test drives invite, conflict, search, filter, sort, isolation, validation, both guards and a revoked session; the parts drove it through the UI 24 times.
3. **Notes** (lap 14): the parts' journeys found the admin's Notes screen answering 404 and its live topic refused — the hello-era spec had no service. It got a domain: `api/src/notes` (port 8108, schema `notes`, tenant-scoped list, search, create and remove; `notes.read`/`notes.write` in the store scopes; live topic `notes` to the tenant; three gateway doors; seeds for both businesses). The test proves two things: notes stay in their business, and `%` and `_` are searched literally.
4. **Live channel design**: the contract owns `LIVE` (topic → scopes that may join) and the Redis topic; the gateway checks the Origin at upgrade, reads the bearer from the first frame bound to the request fingerprint, gates joins by scope and tags each socket with `user` and `tenant` (`*` for the platform). `order` publishes after every transition and checkout (`orders.changed` → tenant, `mine.changed` → customer, `jobs.changed` → courier, `deleted` to the courier it left); `dispatch` publishes courier rows to the tenant and, per active ride it learns through `load` (order + customer), the courier's spot to that customer only. A failed publish is logged and never fails the request.
5. **Caught before it shipped**: the first cut also sent `track.moved` with a tenant audience; every customer of a business would have received every courier's position. `track.moved` is `mine.read` only with a user audience; operators read positions from `couriers.moved`.
6. **Observed live** (lab stack, real Redis): admin joined `orders.changed`/`couriers.moved` and was refused `jobs.changed`/`track.moved`; the client got only its own `mine.changed` and `track.moved`; the courier its `jobs.changed`; super every tenant's `orders.changed`. The api test drives the same through the gateway with a separate publisher: foreign Origin 403, foreign fingerprint 4001, rider refused `orders.changed`.
7. **Lists search and page in SQL** (lap 16; open at the third close): tenant, catalog (stores, products), dispatch and order search through `Repository.matching`; the order list's "late" is SQL too (`status IN open AND created_at < now − 45 min`) and returned the same 26 ids as the rule computed on the full list.
8. **Open**: memberships (iam) and businesses (tenant) do not sync. Live facts are best effort (no outbox): a crash between commit and publish loses the fact; clients poll and resync on reconnect. Closed this lap: the nameless actor (§2.12), team administration (§3.2), and sign-in landing in the first membership (the parts remember the last business on the device and send it).
9. **Gate trap**: the api's mypy `files`/`mypy_path` and ruff `src` list services by hand, so a new service is silently left out (the lab gate covered 221 files with nine services present; 424 now, `notes` added by hand). Derive the lists from the workspace members or test that they match.
10. **The desktop app's origin**: the Electrobun page calls the api from `views://page`; the gateway refuses it (CORS and the socket's Origin check) unless `GATEWAY_ORIGINS` lists it. Seen when the built binary first ran, and again when it signed in through native input (lap 15); production config must carry it.

## 4. Not verified

- Load, soak and TLS for the doors and the socket; Redis outage (the relay loop retries every second; not exercised).
- iOS: a WebSocket's user agent against fetch's for the fingerprint.
- That every service's seeding refuses in release (read for the new five).

## 5. Token: open

Read from the code on 2026-11-15, not run. Nothing in `engine/python` or `product/apex/api` mentions `jwks`, `oidc`, `openid` or `id_token`, and `auth` has no OAuth.

1. **JWT signs with HMAC only.** `token/arch.py` `DIGESTS` holds `HS256`, `HS384` and `HS512`, and nothing asymmetric, so the engine cannot verify a token that another system signs:
   - OIDC id_tokens from Google, Apple, Microsoft, Keycloak or Auth0 (RS256 or ES256);
   - Firebase ID tokens;
   - App Store server notifications (an ES256 JWS).

   Every SSO login stops here. Our own tokens that need a public verifier already have `paseto` `public`.

   Fix:
   - verify `EdDSA`, `ES256` and `RS256`, and issue `EdDSA` and `ES256`;
   - route them through `crypto`, which already owns `cryptography` (door law), so no new library;
   - the key fixes its algorithm, and the header's `alg` only has to match it, so HS/RS confusion is impossible.
2. **No JWK keys.** Foreign issuers publish their keys as a JWKS (RFC 7517) and rotate them by `kid`, while `Jwt` takes raw secrets only.

   Fix:
   - `token` reads a JWK set into its keyring (`kid` → key and algorithm).
   - Fetching and caching the issuer's document belongs to `auth`, because `token` (rung 3) cannot lean on `net` (rung 4).
   - The cache lives as long as the document's max-age.
   - An unknown `kid` triggers one refetch, with a floor between refetches, so a forged `kid` cannot drive fetches.
   - Fetches go out through `net`'s egress guard.

## 6. Search: closed this lap

Both items were fixed and run on 2026-11-16.

1. **The index name.** `count`, `prepare` and `_path_` put it into YQL and URLs unchecked, so `count("books where true or true")` sent the injected YQL out. `_named_` now refuses anything outside `[A-Za-z_][A-Za-z0-9_]*` with `search.index`. `test_vespa_refuses_an_index_name_that_would_rewrite_its_query_or_path` covers it.
2. **The document id.** `_path_` put the caller's id into `/document/v1/{namespace}/{index}/docid/{id}` raw, so `/`, `?`, `#` or `%` moved the path or opened a query. An empty id turned `DELETE …/docid/` into the collection route that clears the index, and `.` or `..` became dot segments that yarl resolves. The id is now `quote(id, safe="")`, and `""`, `.` and `..` are refused with `search.id` before any request is sent.

   `test_vespa_keeps_every_document_id_inside_its_own_path` covers it. It sends ids with `/`, `?`, `#`, `%`, `../`, a space and Arabic through `index`, `get` and `delete` against `VespaFake`, then checks the refused ids send nothing. Run against the old `_path_`, it fails.

## 7. Func: open

Measured on 2026-11-16 and left unchanged, because the fix changes how tokens are counted.

1. **Waiters on a limiter wake in a herd.** `Limiter.acquire` loops `while not allow(): sleep(wait())`, and every waiter sleeps the same deficit. It is not a busy spin, but each refill wakes all of them. The cost grows quadratically:

   | Waiters | Checks | Checks per waiter |
   | - | - | - |
   | 20 | 210 | 10.5 |
   | 100 | 5,050 | 50.5 |

   This is the case ruff's `ASYNC110` points at.

   Tried and reverted: a FIFO lock for contended waiters. It brought the checks down to 3 per waiter. But each timer sleep then ran one after another, so throughput dropped: 1,000 waiters at 5,000/s with burst 1 took 1.24 s, against 0.30 s with the old code (0.20 s ideal).

   Fix:
   - `acquire` books its slot by debiting the tokens at once (a negative balance is debt) and sleeps that waiter's own deficit only once. Waiters then sleep concurrently and are served in order.
   - A cancelled waiter refunds what it booked.
   - Decide what `describe()` shows while the balance is in debt.
   - Test: linear checks per waiter, plus the rate held at 1,000 waiters × 5,000/s × burst 1.
