# bsor3a

`product/bsor3a` is the Bsor3a platform for XcuTor: one platform connecting clients, merchants and suppliers, the platform's own stock and a delivery fleet, in Arabic and English, RTL and LTR. An earlier build of it outside this repository is production evidence, never a source of code; the scope is its BRD (18 modules, 71 acceptance criteria), owned by the owner. This file holds its business and its preferences only.

## Identity

- Client: XcuTor. Roles: `admin vendor delivery client`; staff are scoped admin accounts; wholesale uses the vendor surface. Surfaces: `web` (`admin` and `vendor` panels, `client` site), `mobile` (`client`, `delivery`). No desktop, no separate AI or supplier app.
- Brand: primary `#0A00D5`, gradient `#0901AC → #0A00D5`, secondary `#00D181`, Almarai and Alexandria; dark mode follows Telegram's softness with the brand blue; the design file is the reference to the millimeter, then beaten.
- Language of `api`: open; the DOMA layout below holds in either engine.

## Services

Twenty services, DOMA, one owner per responsibility; calls go to a smaller layer, committed events to a larger one.

| Layer | Service      | Owns                                                                                                         |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| 0     | iam          | accounts, roles and grants, employments and invitations, verification, sessions, admissions, dependent links |
| 1     | geo          | geographic hierarchy, addresses, zones, coverage, delivery fee and ETA rules                                 |
| 2     | enrichment   | translations, attachments, media and QR, policy documents, FAQs by owner                                     |
| 3     | audience     | typed target bindings, segments, eligibility                                                                 |
| 4     | ai           | internal models, knowledge revisions, task profiles, runs, budgets                                           |
| 5     | catalog      | organizations, branches, categories, catalogs, variants, prices, availability, hours, discovery              |
| 6     | promotion    | offers, coupons, campaigns, claims, loyalty levels                                                           |
| 7     | inventory    | stock, immutable movements, holds, receipts, transfers, counts, POS links, time reservations                 |
| 8     | payment      | wallets, payables and requests, intents, ledger, refunds, commissions, settlement, payouts: all money        |
| 9     | bills        | utility services, inquiries, execution, reconciliation, receipts                                             |
| 10    | order        | carts, quotes, orders, state history, prescriptions, proposals, amendments, cancellations, returns           |
| 11    | fleet        | driver eligibility, shifts, jobs, pickup and drop-off proof, cash handover                                   |
| 12    | procurement  | purchase requests, RFQs, quotes, approvals, awards                                                           |
| 13    | engagement   | follows, favorites, verified reviews, comments, moderation, counters                                         |
| 14    | support      | tickets, complaints, SLA, escalation, case history                                                           |
| 15    | chat         | conversations, members, messages, presence, human, AI and hybrid modes, handoff                              |
| 16    | content      | posts, pages, SEO, menus, revisions, publication                                                             |
| 17    | analytics    | fact projections, metrics, reports with as-of time, demand opportunities, approved insights                  |
| 18    | notification | intents, inbox, devices, preferences, quiet hours, templates, delivery                                       |
| 19    | gateway      | the one external door, allowlists, trusted context, edge limits, the gathered OpenAPI                        |

Protect the boundaries: catalog authors prices; inventory allocates; order agrees and executes; payment moves money; procurement negotiates; analytics calculates; ai proposes; notification delivers. A new offering, worker or model never creates a twenty-first service.

## Invariants

- One seller and fulfillment scope per order; server-calculated totals; unknown payment stays pending; substitutions and weight changes need consent.
- Every refund links to its original transaction and applies once; one financial effect under concurrent requests; a timeout never proves success.
- Two buyers cannot take the last unit or an overlapping exclusive slot; estimated, rejected or unreceived quantities never become stock.
- Pay on behalf: A adds B as a dependent when B permits; B requests A to pay a specific payable; A chooses each payment; material changes need fresh consent; no guardian tree.
- Utility bills: inquiry → consent → funded execution → provider-confirmed receipt or explicit pending; no blind second submission.
- Property and recycling are unified catalog commerce with their own evidence; payment never claims legal title transfer.
- AI is internal: frontends keep their domain contracts; a human takeover defeats an old AI result; every proposed action is validated at its owner.

## Journeys

Admission and discovery · shared checkout and fulfillment · pay for another person · utility bills · wholesale, sourcing and platform stock · POS, returns and recovery · reports and proactive notification. Each works through its surface, api owners, engine, workers and recovery path, on its normal and its dangerous path.

## Preferences

- Providers are mocks until the first full release; the OTP is `111111` everywhere, in the closed production too, from one function, never gated on the environment; a maps key failure never blocks a flow.
- Realtime for chat, notifications, order status, payments, transactions and wallets through the engine's socket; the panels and the apps bind to it.
- Register and login are stepped flows; biometric unlock is a user-enabled setting over short-lived tokens; the user controls the lock window.
- The admin panel: no registration, no social login; catalogs section ordered `organizations branches categories catalogs`; forms carry the whole payload; a branch is optional; an admin creating an organization may name its vendor or leave it to the platform; in-panel wholesale buying; a support chat box fixed in the vendor panel and the same conversation on the chat page.
- The apps: Arabic on first launch; the phone is the final truth; the home hero carries city artwork by the user's governorate.

## Open

Market and money policy (currencies, commissions, cash on delivery, payout timing), admission documents, reservation units, prescription sequencing, specialized offering terms, procurement credit, AI consent and retention, notification quiet hours: each is a business decision recorded here when the owner gives it, never guessed.
