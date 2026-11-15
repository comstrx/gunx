# Python review — lab round close

2026-11-15 · for the owner and the agent working on this tree. Second close: supersedes the first.

The lab copy is `/var/www/projects/gunx-lab/gunx-bun/{engine/python,product/apex/api}`; the merge record and numbers are in `/var/www/projects/gunx-lab/LOG.md` (lap 0, 8–9, 10, 11, 12). Nothing in this tree was changed except this file and `bun-review.md`.

## 1. What the lab holds

- **engine/python**: the three-way merge of the lab engine and this tree (469 files the same, 45 lab-only kept, 61 real-only and 32 real-new taken, 12 merged by hand), plus this round's live channel members (§2.8–2.10). Gates: ruff clean, mypy strict 497 files, pytest 1,795 passed / 4 failed / 7 skipped (the same four as at the first close: `rand` fork, `translate` accept-language, identity reset without a superuser, the MySQL DNS example).
- **product/apex/api**: nine services, one per domain. `tenant`, `catalog`, `dispatch` and `order` now keep their rows in Postgres (one schema and one migration ledger each, seeds only outside production, production refuses the lab URLs); 13 orders survived an order-service restart. The gateway has 58 doors and one socket (`/api/live`). The contract carries the 20 currencies, 20 locales and 20 zones the product offers, and the live vocabulary. Gates: ruff clean, mypy 379 files, pytest 26/26, pip-audit clean.
- Live, observed: `smoke.py` and `smoke_zone.py` pass through the gateway (OTP for super, admin, courier, client; lists, search, late filter, metrics per currency and zone, assign, checkout, presence → locate → accept → pickup, isolation 403/404); the live probe gets each role exactly its facts (§3.5).

## 2. Engine findings

1. **CORS allow-list misses the headers the TS wire sends** (`traceparent`, `tracestate`, `x-client`, `x-currency`, `x-tenant`, `x-csrf-token`): browser calls failed preflight. Lab: `HEADERS` carries them.
2. **The OTP flow needs a ready keyring**: `auth.otp` raised `crypto.setup` on a fresh service. Lab `iam` calls `crypto.setup` at boot.
3. **Strict list queries refused what every list sends** (`page`, `limit`, `late` arrive as strings). Lab: `Listing.prepare` normalizes first.
4. **Outbox relays compete across processes that share a schema**: a dev stack and the test suite take each other's events (`broker.unroutable`, `attempts=6`).
5. **Tests drop the dev database's schemas** (`tests/conftest.py` drops `iam` and `notify` where a local stack lives). Lab: the suite owns `iam_test` and `notify_test`; 26/26 with the lab stack running.
6. **This tree's `iam` cannot boot.** `bootstrap/app.py` calls `auth.setup(…, fixed_code=settings.fixed_code)` without `testing=`, the default is `"000000"` (a local `.env.production` sets it again), while the engine refuses a fixed code outside testing (`auth.py`, `if fixed_code is not None and not testing`). Read, not run here; the lab's first baseline on this tree's api showed it failing. Second trap: `Settings.load` skips an empty value, so a non-empty default can never be cleared from the environment. Lab: default empty, `testing=env.stage() != "production"`, local env and tests set the code explicitly.
7. From the merge (both trees): `rand` fork and `translate` accept-language fail; this tree also fails the database identity reset (assumes a superuser), the package law and a racers stray error; a delayed or throttled job still sleeps inside the worker slot for non-memory brokers.
8. **A browser cannot authenticate a socket.** `Channel.upgrade` passes `request.actor()`, which reads only `Authorization`; browsers cannot set headers on a WebSocket. Lab: `Sockets.admit(check, within=5.0)` — the first frame must be `auth`, `check` returns an `Admission(actor, tags, expires)`; silence, another first event or a refused check closes 4001, the token's `exp` closes 4002 (the TS client reconnects on 4002 and stops on 4001). `Channel` hands the upgrade's fingerprint to the socket; `auth.recognize(token, fingerprint)` runs `alive`'s revocation and session checks on a carried token.
9. **Fan-out cannot be scoped.** `Hub.emit` and `Broadcast.publish` reach every member of a room, so one room per topic leaks across tenants. Lab: sockets carry tags; `emit`/`publish` take an audience (≤ 8 tag pairs, `*` matches all) that travels through Redis; history replays only what a joining socket may hear.
10. **No WebSocket client**, while aiohttp may only enter through `net` (door law) and the api bans it. Lab: `net.socket(url, headers, egress) → Wire` (`send`, `receive`, `code`, `close`) and `engine.test` `Client.socket(path)`.
11. `http/arch.py` `HEADERS` is one 191-character line (E501 in the lab after the CORS fix). Wrapped.

## 3. API

1. **Done this round**: Postgres for the four services; the live channel; `GET /api/tenant` (the signed member's business: currency, locale, zone) for the parts; money and time per tenant (per-currency revenues, the board's day opens in the tenant's zone, `in:` rules for currency/locale/zone, 422 seen); a business switch (`POST /sessions/switch` ends the session and starts one in another membership; sessions carry `businesses` with id, slug and name; tested: stranger business 403, old access 401, old refresh revoked); test isolation; `iam` boots in production.
2. **Live channel design**: the contract owns `LIVE` (topic → scopes that may join) and the Redis topic; the gateway checks the Origin at upgrade, reads the bearer from the first frame bound to the request fingerprint, gates joins by scope and tags each socket with `user` and `tenant` (`*` for the platform). `order` publishes after every transition and checkout (`orders.changed` → tenant, `mine.changed` → customer, `jobs.changed` → courier, `deleted` to the courier it left); `dispatch` publishes courier rows to the tenant and, per active ride it learns through `load` (order + customer), the courier's spot to that customer only. A failed publish is logged and never fails the request.
3. **Caught before it shipped**: the first cut also sent `track.moved` with a tenant audience; every customer of a business would have received every courier's position. `track.moved` is `mine.read` only with a user audience; operators read positions from `couriers.moved`.
4. **Open**: sign-in without `tenant` still lands in the first membership (the switch moves from there). Memberships (iam) and businesses (tenant) do not sync. The relayed actor has no display name (`customer_name` empty on checkout). No team administration. Live facts are best effort (no outbox): a crash between commit and publish loses the fact; clients poll and resync on reconnect.
5. **Observed live** (lab stack, real Redis): admin joined `orders.changed`/`couriers.moved` and was refused `jobs.changed`/`track.moved`; the client got only its own `mine.changed` and `track.moved`; the courier its `jobs.changed`; super every tenant's `orders.changed`. The api test drives the same through the gateway with a separate publisher: foreign Origin 403, foreign fingerprint 4001, rider refused `orders.changed`.
6. **Gate trap**: the api's mypy `files`/`mypy_path` and ruff `src` list services by hand, so a new service is silently left out of mypy (the lab gate covered 221 files with nine services present; 379 now). Derive the lists from the workspace members or test that they match.
7. **The desktop app's origin**: the Electrobun page calls the api from `views://page`; the gateway refuses it (CORS and the socket's Origin check) unless `GATEWAY_ORIGINS` lists it. Seen when the built binary first ran; production config must carry it.

## 4. Not verified

- Load, soak and TLS for the new doors and the socket; Redis outage (the relay loop retries every second; not exercised).
- iOS: a WebSocket's user agent against fetch's for the fingerprint.
- That every service's seeding refuses in release (read for the new four).
