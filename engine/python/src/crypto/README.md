# Crypto

Authenticated encryption, digests, keyed authentication, signatures and derivation over exact UTF-8 text or bytes. No credential policy, implicit normalization, minimum input length or knowledge of files and products.

## Use

~~~python
from engine.crypto import Crypto, crypto

vault = Crypto()
vault.setup([vault.key("current")])

sealed = vault.seal("any text", aad=b"context")
plain = vault.open_text(sealed, aad=b"context")
binary = vault.seal_bytes(b"any bytes")
raw = vault.open_bytes(binary)

chacha = vault.options(cipher="chacha20-poly1305")
assert vault.open_text(chacha.seal("same interface")) == "same interface"

hashed = crypto.hash("data", "sha256")
assert crypto.check("data", hashed)

slow = crypto.hash("low-entropy secret", "argon2id")
assert crypto.check("low-entropy secret", slow)

signed = vault.sign("message", algorithm="sha512")
assert vault.verify("message", signed, algorithm="sha512")

signer = vault.signer(algorithm="sha256")
signer.update(b"first chunk").update(b"second chunk")
assert signer.check(vault.mac(b"first chunksecond chunk"))

template = vault.signer()
signed = template.copy().update(b"message").hexdigest()
assert vault.verify(b"message", signed)
~~~

## Ownership

- Crypto is the operation facade; options() returns an independent scope. Key setup never changes existing sibling scopes.
- Key, Pair, Sealed and Hasher are engine-owned public types. No external library object escapes.
- Cipher state publishes one immutable keyring snapshot. Readers retain it during native operations; no request lock or unbounded secret cache.
- arch.py owns types/constants. Cipher, wire, hashing and derivation implementations live in their own files.
- Base64 belongs to string; randomness to rand; URI encoding to parse; I/O and authenticated multi-frame files to fs.

## Encryption

- options(cipher=...) selects aes-gcm (AES-256-GCM, default), chacha20-poly1305, or aes-gcm-siv (AES-256-GCM-SIV).
- Keys are 32 random bytes; each encryption generates a fresh 12-byte nonce and retains the full 16-byte tag. Never pad a passphrase into an AES key.
- Missing backend support raises a typed fault, without silent substitution.
- seal/open use text envelopes; seal_bytes/open_bytes use binary frames. open returns bytes; open_text decodes UTF-8 strictly.
- Decryption reads the algorithm from the envelope. New metadata, payload and AAD are authenticated; no plaintext is returned before tag verification.
- New text: v2.<algorithm-id>.<key-id>.<base64url>. New binary: E2 || algorithm-id || key-name-length || key-name || nonce || ciphertext-with-tag. IDs: 0=AES-GCM, 1=ChaCha20-Poly1305, 2=AES-GCM-SIV.
- AAD must match exactly. It binds caller-defined context; the engine invents no application identifier.
- setup([new, old], current="new") retains old decryption keys and selects the write key. stale examines metadata only, without authenticating. rotate authenticates and re-encrypts using one stable scope.
- Key IDs are unique bounded ASCII labels. Use different IDs for different key material; remove old keys only after migrating their ciphertext.
- parse_key/export_key explicitly transfer secret material; never log their output. describe, Key/Pair repr and Pair.dump omit secrets.
- Random nonces do not remove per-key usage planning. AES-GCM/ChaCha require uniqueness under a key; key lifetime is the caller's policy. SIV misuse resistance is not permission to reuse nonces.

## Hashing and authentication

- hash(data, algorithm="sha256") returns hex. BLAKE3, SHA-2, SHA-3 and runtime fixed-output algorithms are available. Unsupported/XOF algorithms refuse.
- digest(data) is BLAKE3 hex; crc32 is a checksum, never authentication.
- hash(data, "argon2id") returns a salted PHC string. check(data, hashed) identifies Argon2 records; ordinary hex defaults to SHA-256. Pass the algorithm for other ordinary digests.
- Fast hashes identify content; they do not resist guessing low-entropy secrets. Argon2id intentionally spends memory and CPU.
- options(time_cost=3, memory_cost=65536, parallelism=2) configures Argon2. Memory is KiB per active call; defaults request 64 MiB. Verification rejects encoded costs above that scope's budgets before native hashing. Higher-cost legacy records need an explicitly sufficient scope.
- rehash(hashed) reports obsolete/invalid Argon2 parameters. Rehash only after successful checking, while cleartext is available.
- Empty inputs, NULs, short values and long data are accepted within byte limits. Equivalent-looking Unicode remains different unless the caller explicitly normalizes it.
- mac(data, secret=None, algorithm="sha256") returns HMAC bytes; sign returns lowercase hex; verify accepts either representation without accepting uppercase or alternate encodings. Omitted secret uses the current key. check compares an unkeyed hash; verify checks keyed authenticity.
- signer(secret=None, algorithm="sha256") returns an incremental HMAC Hasher. It captures its key once; later setup changes do not affect it. copy().update(data) reuses the prepared state for independent messages without a global secret cache.
- Hasher.keyed(secret, algorithm="sha256", limit=...) constructs the same state directly. Its limit bounds chunks; the facade also bounds explicit secret input by its configured limit. Configured keyring keys remain usable even with tiny chunk limits.
- keypair/attest/attested use Ed25519, raw 32-byte private/public keys and bounded signatures.
- hkdf(secret, info, length=32, salt=None) derives material from sufficient-entropy secrets using SHA-256. It is not slow passphrase derivation. derive(info, id_=...) creates a Key from the current key.
- fingerprint(*parts) length-prefixes UTF-8 parts and returns a 128-bit BLAKE3 fingerprint; it is unkeyed, not authentication.

## Bounds and execution

- options(limit=...) sets each one-shot input/AAD/plaintext byte budget, default 64 MiB. UTF-8 size is checked too. Oversized envelopes reject before Base64 decoding.
- hasher(algorithm).update(chunk).hexdigest() processes incrementally without retaining input. digest returns bytes; check accepts raw bytes or lowercase hex without consuming the state; copy branches the state. Limit applies per chunk, not to total stream size.
- Binary and text decryption avoid a ciphertext-body copy before native processing; public Sealed.decode still returns owned bytes. Text encoding expands size; use binary frames for binary storage.
- Each mutable Hasher/signer belongs to one stream. Read a completed shared template through independent copy() states; do not update the template while copying it.
- File framing, authenticated chunk order/finality and atomic publication remain in fs.encrypt. Do not concatenate independent encrypted chunks without authenticated sequence/finality.
- Operations are synchronous CPU work. Slow Argon2 and large buffers in async services use bounded thread execution, never unlimited offloads. Cancelling an await does not stop a native hash already running; capacity remains occupied until completion.
- Native Argon2 memory grows with concurrency. Tune admission and costs together; do not weaken cryptographic work to make a benchmark faster.

## TOTP

totp_secret, totp, totp_match, totp_verify and totp_uri provide bounded RFC 6238 SHA-1 counters/windows/enrollment URIs. totp_match returns the counter so callers can atomically prevent replay. This primitive stores no identities or attempt counters.

## Migration

- Password/password and password.py were removed by the owner's generic-data design. Use crypto.hash(value, "argon2id"), crypto.check(value, stored), crypto.rehash(stored).
- The old API normalized NFKC and enforced credential lengths. Existing normalized records need explicit string.normalize(value, "NFKC") when checking; new generic data is never normalized silently.
- v1/E1 AES-GCM data remains readable with its original AAD semantics. New writes authenticate v2/E2 metadata; rotate upgrades after authentication.
- hasher now returns the engine Hasher with update/digest/hexdigest/copy/check; provider-specific attributes are no longer public.
- options captures the current keyring: configure keys before creating scopes, or setup each independent scope.

## Verification

Tests cover standard vectors, provider interoperability, legacy formats, metadata/payload/AAD tampering, Unicode, native-cost rejection, limits, scope isolation and concurrent rotation. Fuzz uses independent references and all three ciphers. Benches report small operations and large payloads without universal rankings.

## Sources

- [Cryptography AEAD](https://cryptography.io/en/stable/hazmat/primitives/aead/)
- [Argon2 API](https://argon2-cffi.readthedocs.io/en/stable/api.html)
- [BLAKE3 bindings](https://github.com/oconnor663/blake3-py)
- [Python HMAC and constant-time comparison](https://docs.python.org/3.15/library/hmac.html)
- [Python native Base64](https://docs.python.org/3.15/library/binascii.html)
