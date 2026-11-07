# apex

`product/apex` is GunX's own product: a multi-tenant, multi-role, multi-product-type SaaS, the laboratory the fragment tools (`apix webx mobilex deskx`) are extracted from whole, `specs/` included, and the first product built on every engine. This file holds its business and its preferences only; every law lives in the general files.

## Identity

- Owner and client: Brand, palette, fonts and art direction: open, recorded here when the owner sets them.
- Roles: `super admin vendor delivery client`. Surfaces: `web` (panels for `super admin vendor`, an indexable site for `client`), `mobile` (`client delivery`), `desktop` (`super admin vendor`). Every role is a spec of its fragment; one feature serves every role.
- Language of `api`: Python on `engine/python` first; Rust on `engine/rust` the day the owner moves it, and `apix` moves with it.

## Business

- Multi-tenant: a tenant is an organization with optional branches; the platform itself is a tenant with no vendor. Tenancy is a second wall in the engine (RLS), never a filter in a query.
- Unified catalog: organization → branch → category → catalog → variant, with typed offering capabilities per product type; retail, wholesale or both; platform-owned stock separate from vendor stock.
- One financial owner: wallets, payables, ledger, refunds, commissions, settlement and payouts in one service, integer minor units, explicit currency.
- Delivery: driver admission, eligibility, dispatch, tracking, proof, cash reconciliation.
- Engagement, support, chat, notifications and analytics as separate domains; AI internal behind feature owners, proposing, never deciding.

The service list, layers and journeys are written here when the owner briefs the first round; until then the DOMA law of `stack/fragment/api` and this outline are the only scope.

## Preferences

- Providers (payment, mail, sms, maps, bills) stay engine mocks until the first full release; one fixed test code for every OTP, in production too, until the owner lifts it.
- Light and dark as two art directions; Arabic and English; RTL and LTR from the first line.
- First specs: one role per fragment saying hello world, proving the sync, the release and the extraction before any business screen.
- Today (2026-11-05): the four fragments are hello skeletons (`api` a uv package `api`, `web mobile desktop` Bun packages named after the fragment, each with one verb, one test and a `gate`), `infra/infra.toml` names the repository and the moment `manual`; the ten tools extract with their gates green from this tree.

## Open

The owner has not yet set: the brand, the service list and their layers, the first client journey, the domains and hosts. Each is recorded here the lap it is given; nothing here is guessed.
