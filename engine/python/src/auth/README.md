# Auth

Actors, permissions, OTPs, revocation and refresh-session families. Token formats and cryptographic validation belong to token.

## Token issuers

setup(cache=..., access=..., refresh=...) accepts independent token Issuers. Both must be supplied together, with purposes access and refresh. Formats can differ. Existing setup without issuers keeps the synchronous JWT integration.

Use await auth.sessions.issue(actor, fingerprint) and await auth.sessions.refresh(refresh_text, fingerprint). Session families keep an absolute lifetime, rotate the current refresh id atomically and revoke the family on replay or competing refresh. Verify tokens with the configured issuers; verification does not itself authorize an operation.

App.tokens(access) and auth.setup(access=access, ...) must share the same Issuer. Protected routes use auth.guard(...). Identity is established before actor-based throttling; guards check revocation, family state, scopes and roles before publishing the principal. Request-local verification reuse avoids an extra opaque storage read. No successful claim cache is shared between requests.

auth.actor(request) returns the principal after a successful guard. Auth.issue() is the legacy synchronous JWT path; scoped configurations explicitly require the asynchronous sessions path. auth.sessions.claims(text, fingerprint) validates access claims but does not apply session/revocation policy.

The auth cache owns family records and atomic rotation. An opaque issuer may use the same shared cache or a separately injected Store. Cross-store issuance is not transactional; cancellation or later failure can leave unreturned token records until their TTL. Auth never changes token's storage provider or guessing rules.

## Verification

tests/test_auth.py covers existing behavior and all three access/refresh formats, including Memory/Redis-backed HTTP journeys, actor throttling, replay, concurrent refresh and one opaque lookup per request. Existing fuzz/fuzz_auth.py and benches/bench_auth.py retain their scope.
