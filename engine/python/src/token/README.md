# Token

Independent JWT, opaque and PASETO issuers with one asynchronous interface. Format selects the representation; purpose selects the expected use. Construct issuers once, then reuse them across requests.

## Use

~~~python
from engine.token import token

access = token.options(
    format="jwt", purpose="access", secret=signing_key,
    issuer="accounts", audience="api", ttl=900,
)
refresh = token.options(
    format="opaque", purpose="refresh", store=shared_cache,
    issuer="accounts", ttl=2592000,
)
encrypted = token.options(
    format="paseto", purpose="access", protection="local",
    secret=encryption_key, issuer="accounts", audience="api", ttl=900,
)

text = await access.issue("user-id", role="reader")
claims = await access.verify(text)
assert claims.subject == "user-id"
assert claims.purpose == "access"
assert claims.get("role") == "reader"
~~~

Keys come from deployment configuration and remain stable across workers/restarts; generate random key material, not passwords padded to length. Separate keys across trust boundaries. Each options() call returns an independent Issuer; it never changes another issuer or the legacy singleton.

- JWT: HS256 by default; HS384/HS512 require at least 48/64 key bytes. HS256 requires at least 32. Algorithms are configured, never selected by untrusted headers. This adapter implements signed HMAC JWT, not JWE or asymmetric JWT.
- PASETO: version 4 only. protection="local" uses an exact 32-byte key and authenticated encryption; protection="public" uses Ed25519 private/public PEM keys. Public-key issuers verify but cannot issue. PASETO's local/public cryptographic purpose is exposed as protection, separately from the application's access/refresh/reset purpose.
- Opaque: 32 random bytes encoded as 43 unpadded base64url characters. The caller injects a Store; token never imports cache, auth, database or HTTP.
- await issue(subject, ttl=None, fingerprint=None, **facts) and await verify(text, fingerprint=None) have the same shape for all formats. JWT/PASETO do bounded local work; opaque awaits storage. No thread pool or detached task is created.
- Claims exposes subject, purpose (alias of kind), id, issued, expires and get(name, default). Generated ids contain 128 random bits; existing ids of other lengths remain readable.
- Optional fingerprint is a binding check, not proof of possession. Its policy belongs to the caller.
- purpose is fixed on the issuer and checked on verification. Neither untrusted content nor a keyword in facts can change it. Existing wire claim kind is retained for compatibility.
- Reserved claims cannot override subject, issuer, timestamps, id, purpose or fingerprint. Configured audience cannot be overridden. Extra facts must be JSON serializable.
- A purpose label does not implement OAuth, OIDC, DPoP, login, one-time reset or authorization policy.

## Adapters and capabilities

~~~python
from engine.token import Paseto, token

issuer = token.use(
    Paseto(private_pem, protection="public", assertion=b"protocol-context"),
    purpose="access", issuer="accounts", audience="api",
)
assert issuer.can("signed")
assert issuer.can("verify")
~~~

Codec is the adapter contract; Jwt, Paseto and Reference own their format. Issuer owns common claims, bounds and opaque record handling. arch.py owns definitions. Randomness, cryptographic primitives, encoding and dates remain delegated to their existing packages.

can() and describe() expose capabilities without secrets. peek() exists only for JWT and returns **unverified** data; never use it for identity or permissions. Unsupported operations fail explicitly. There is no format guessing, fallback key or weaker-algorithm retry.

## Validation and keys

- Incoming token text is bounded to 8192 ASCII characters before decoding. Decoded JSON must be an object within the same byte bound. Base64url is canonical and unpadded.
- Signature/authentication is checked before claims are trusted. Unknown key ids, modified body/footer, wrong format, issuer, audience, purpose or fingerprint fail closed.
- iat/exp are required; nbf is checked when present. Non-finite/bool timestamps are refused. Expiry and future dates use the configured leeway (default 5 seconds).
- JWT uses NumericDate. PASETO encodes registered times as RFC3339 and converts them to the same Claims interface after verification.
- Default TTL must be positive; a per-issue ttl can deliberately produce an expired JWT/PASETO for migration/testing. Opaque refuses issuance whose effective stored lifetime has already ended.
- rotate(keys, active) returns a **new** Issuer. Keep the returned instance; previous instances keep their configuration. Publish new consumers together, keep old keys for the intended overlap, then remove them. At most 32 keys are accepted.
- Rotation maps are copied and validated before publication. JWT reuses a prepared HMAC template through crypto; each operation copies the template and never mutates shared signing state.

~~~python
next_access = access.rotate({"old": old_key, "current": new_key}, active="current")
retired = next_access.rotate({"current": new_key}, active="current")
~~~

## Opaque storage

Store provides asynchronous add(key, value, ttl) and get(key, default=None). add must atomically insert only if absent and honor TTL across all cooperating workers. An engine Cache backed by shared Redis satisfies this usage; Memory is local to its process. Stored values are detached, tightly sized JSON bytes, never the plain token. Copying only at this retention boundary avoids keeping an encoder's spare allocation for every live record.

Storage keys combine a hash of format/issuer/purpose/audience with SHA-256 of the random token. Missing, corrupt or expired records are refused. Record expiry is checked independently of backend TTL. Collision retries are bounded to three inserts and never overwrite an existing record.

Backend Faults retain their meaning. Network OSError becomes token.store/UNAVAILABLE; writes mark the outcome unknown. Cancellation propagates. A cancelled or timed-out insert may have committed remotely: no token is returned, and TTL reclaims the unreachable record. The caller owns timeouts, backend lifecycle, replication guarantees and cleanup.

issuer.key(text) exposes the scoped opaque record key for authorized removal by the caller. Stateless issuers reject key(). Single-use consumption, revocation, refresh rotation and replay detection belong to auth/application workflows, not verify(). Verification alone does not consume an opaque token.

## Auth and HTTP composition

~~~python
from engine.auth import Auth, Actor
from engine.http import App

auth = Auth()
auth.setup(cache=shared_cache, access=access, refresh=refresh)
app = App("service").tokens(access)

pair = await auth.sessions.issue(Actor("user-id", scopes=("read",)), fingerprint)
renewed = await auth.sessions.refresh(pair.refresh, fingerprint)
~~~

Protect routes with auth.guard(). App.tokens(access) verifies identity before actor-based throttling; the guard still checks revocation, session state and permissions. Both use the **same** access Issuer. Request.authenticate(issuer) reuses successful verification only within that request, for the same issuer, bearer and fingerprint. Request.claims() reads the verified result; it does not perform hidden asynchronous storage I/O.

Auth owns session-family records, atomic refresh rotation and replay response. It supports mixed access/refresh formats. Auth.issue() remains a legacy synchronous JWT method; configured issuers use await auth.sessions.issue(). Session issuance across separate stores is not a distributed transaction; unreturned opaque records can remain until TTL after failure.

## Compatibility

Token.setup/issue/verify/pair/refresh/rotate remain synchronous JWT APIs. setup publishes one configuration snapshot; an in-flight pair uses one snapshot. token.opaque() remains the low-level random token/hash/prefix helper and does not store claims.

Existing JWTs and kind claims remain verifiable. New configuration is stricter, oversize bearer text is refused, and new ids grow from 16 to 32 hex characters. Existing application storage must allow that id length. Legacy token.refresh() only verifies/reissues tokens; use auth.sessions for replay-safe refresh.

## Verification and sources

tests/test_token.py covers format/purpose separation, official v4 vectors, PyJWT/PySETO interoperability, rotation, malformed input, bounds, storage corruption, cancellation and concurrent issuers. tests/test_auth.py covers the real HTTP flow with Memory/Redis, actor throttling, shared lookup and refresh races. fuzz/fuzz_token.py records actual exercised examples; benches/bench_token.py separates each format and labels opaque issuance plus cleanup explicitly.

PASETO delegates protocol cryptography to [PySETO](https://pyseto.readthedocs.io/en/latest/paseto_usage.html).
JWT validation follows the relevant [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) constraints.
The 17 [official v4 vectors](https://github.com/paseto-standard/test-vectors) retain their ISC license beside the fixture.

PySETO 1.10.0 is MIT licensed; its additional runtime dependencies are iso8601 (MIT) and pycryptodomex (BSD/public-domain), alongside existing cryptography/argon2 dependencies. Version pins live in workspace constraints, not inside adapter code. PASETO backend imports are lazy; JWT-only execution does not load PySETO.

The facade's narrow lint exceptions permit the requested format keyword and the typed options factory's explicit configuration parameters. They do not relax checks elsewhere.
