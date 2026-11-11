# apex

`product/apex` is GunX's own product: a multi-tenant, multi-role, multi-product-type SaaS, the laboratory the fragment tools (`apix webx mobilex deskx`) are extracted from whole, `specs/` included, and the first product built on every engine. This file holds its business and its preferences only.

## Identity

- Owner and client: GunX. Brand, palette, fonts and art direction: open, recorded here when the owner sets them.
- Roles: `super admin vendor delivery client`. Surfaces: `web` (panels for `super admin vendor`, an indexable site for `client`), `mobile` (`client delivery`), `desktop` (`super admin vendor`). Every role is a spec of its fragment; one feature serves every role.
- Language of `api`: Python first; Rust the day the owner moves it, and `apix` moves with it.

## Business

- Multi-tenant: a tenant is an organization with optional branches; the platform itself is a tenant with no vendor. Tenancy is a second wall in the engine (RLS), never a filter in a query.
- Unified catalog: organization → branch → category → catalog → variant, with typed offering capabilities per product type; retail, wholesale or both; platform-owned stock separate from vendor stock.
- One financial owner: wallets, payables, ledger, refunds, commissions, settlement and payouts in one service, integer minor units, explicit currency.
- Delivery: driver admission, eligibility, dispatch, tracking, proof, cash reconciliation.
- Engagement, support, chat, notifications and analytics as separate domains; AI internal behind feature owners, proposing, never deciding.

The service list, layers and journeys are written here when the owner briefs the first round; until then this outline is the only scope.

## Preferences

- Providers (payment, mail, sms, maps, bills) stay engine mocks until the first full release; one fixed test code for every OTP, in production too, until the owner lifts it.
- Light and dark as two art directions; Arabic and English; RTL and LTR from the first line.
- First specs: one role per fragment saying hello world, proving the sync, the release and the extraction before any business screen.
- Today (2026-11-09): every fragment says hello world end to end. `api` is a uv workspace of the members `src/{contract, gateway, iam, hello, notify}` in the one layout and the one layer order of the api fragment, with root `tests/` (the journey among them) and `benches/`. Layers: `gateway` 0, `iam` 1, `hello` 2, `notify` 3. The gateway's eleven doors proxy the sessions, `/api/hello`, `/api/me`, `/api/devices` and `/api/notifications` with the relayed identity, refuse a revoked access token at the edge (`auth.revoked`) and gather every reachable service's OpenAPI. `iam` runs on PostgreSQL (schema `iam` in one database, its own `Database`): `tenants users memberships sessions` plus its outbox, inbox and ledger, declared in `database/migrations` and applied by the engine's migrator at boot; `memberships` is isolated by `tenant_id` and readable by its own user through a second row policy; a session names a workspace (`tenant` slug, else the first membership) and its roles and scopes follow that membership; sessions persist (refresh rotates and revokes, ending revokes the row and the access token) and every start writes `iam.session.started` to the outbox inside the same transaction; seeds: tenants `apex` and `zain`, users super/admin/vendor/client with memberships. `hello` stays in memory and answers in Arabic or English and in three tones. `notify` (schema `notify`) owns `devices` and `notices` behind self row policies, listens to `iam.*` through the broker with an inbox, writes a welcome notice per session start, pushes it through a durable `notify.push` job and the engine's push adapter (the log pusher until the owner picks a provider), and serves `/devices`, `/notifications` and `/notifications/<notice>/read` to the relayed actor. The journey walks sign-in → hello → device → the welcome notice through the edge → read → refresh → end → refusal. `web` (the `admin` role, static export), `mobile` (the `client` role, Android export) and `desktop` (the `admin` role on Electrobun) each place one `hello` feature in one centered stack through one component over the engine's elements (the phone's mirror them), with loading, failure and retry designed. `infra/infra.toml` names the product and its repository (`comstrx/apex`).

## Open

The owner has not yet set: the brand, the service list and their layers, the first client journey, the domains and hosts. Each is recorded here the lap it is given; nothing here is guessed.
