from engine.crypto import crypto
from engine.test import Bench

bench = Bench()
quick = crypto.options(time_cost=1, memory_cost=8, parallelism=1)

crypto.setup([crypto.key("k1")])

small   = b"x" * 256
large   = b"x" * 65536
sealed  = crypto.seal(small, b"row:1")
frame   = crypto.seal_bytes(large, b"file")
signed  = crypto.sign(small, "shared-secret")
pair    = crypto.keypair()
attest_ = crypto.attest(small, pair.private)
secret  = crypto.totp_secret()
code    = crypto.totp(secret, at=1000)
key     = crypto.export_key(crypto.current())
hashed  = crypto.hash("correct horse battery", "argon2id")
light   = quick.hash("correct horse battery", "argon2id")

def seal () -> None: crypto.seal(small, b"row:1")

def open_ () -> None: crypto.open(sealed, b"row:1")

def stale () -> None: crypto.stale(sealed)

def seal_bytes () -> None: crypto.seal_bytes(large, b"file")

def open_bytes () -> None: crypto.open_bytes(frame, b"file")

def hash_ () -> None: crypto.hash(small)

def digest () -> None: crypto.digest(small)

def digest_large () -> None: crypto.digest(large)

def crc32 () -> None: crypto.crc32(small)

def mac () -> None: crypto.mac(small, "shared-secret")

def sign () -> None: crypto.sign(small)

def verify () -> None: crypto.verify(small, signed, "shared-secret")

def fingerprint () -> None: crypto.fingerprint("Mozilla/5.0 (X11; Linux x86_64)", "203.0.113.7")

def hkdf () -> None: crypto.hkdf("shared-secret", "tokens")

def derive () -> None: crypto.derive("files")

def attest () -> None: crypto.attest(small, pair.private)

def attested () -> None: crypto.attested(small, attest_, pair.public)

def totp () -> None: crypto.totp(secret, at=1000)

def totp_verify () -> None: crypto.totp_verify(secret, code, at=1000)

def parse_key () -> None: crypto.parse_key(key)

def slow_check () -> None: crypto.check("correct horse battery", hashed)

def slow_hash () -> None: crypto.hash("correct horse battery", "argon2id")

def rehash () -> None: crypto.rehash(hashed)

def light_check () -> None: quick.check("correct horse battery", light)

bench.measure("crypto.seal", seal)
bench.measure("crypto.open", open_)
bench.measure("crypto.stale", stale)
bench.measure("crypto.seal_bytes.64k", seal_bytes, rounds=5000)
bench.measure("crypto.open_bytes.64k", open_bytes, rounds=5000)
bench.measure("crypto.hash", hash_)
bench.measure("crypto.digest", digest)
bench.measure("crypto.digest.64k", digest_large, rounds=5000)
bench.measure("crypto.crc32", crc32)
bench.measure("crypto.mac", mac)
bench.measure("crypto.sign", sign)
bench.measure("crypto.verify", verify)
bench.measure("crypto.fingerprint", fingerprint)
bench.measure("crypto.hkdf", hkdf)
bench.measure("crypto.derive", derive)
bench.measure("crypto.attest", attest, rounds=5000)
bench.measure("crypto.attested", attested, rounds=5000)
bench.measure("crypto.totp", totp)
bench.measure("crypto.totp_verify", totp_verify)
bench.measure("crypto.parse_key", parse_key)
bench.measure("crypto.argon2.stale", rehash)
bench.measure("crypto.argon2.light", light_check, rounds=2000)
Bench(warm=2).measure("crypto.argon2.verify", slow_check, rounds=10)
Bench(warm=2).measure("crypto.argon2.hash", slow_hash, rounds=10)

payload = b"x" * (1 << 20)
chacha  = crypto.options(cipher="chacha20-poly1305")
siv     = crypto.options(cipher="aes-gcm-siv")
text    = crypto.seal(payload)
binary  = crypto.seal_bytes(payload)

bench.measure("crypto.aes.1m", lambda: crypto.seal_bytes(payload), rounds=200)
bench.measure("crypto.chacha.1m", lambda: chacha.seal_bytes(payload), rounds=200)
bench.measure("crypto.siv.1m", lambda: siv.seal_bytes(payload), rounds=200)
bench.measure("crypto.open_bytes.1m", lambda: crypto.open_bytes(binary), rounds=200)
bench.measure("crypto.open_text_envelope.1m", lambda: crypto.open(text), rounds=200)
bench.measure("crypto.hasher.1m", lambda: crypto.hasher().update(payload).hexdigest(), rounds=200)

base_mac = crypto.signer()
mac_bytes = crypto.mac(small)
hash_hex = crypto.hash(small)

bench.measure("crypto.sha512.small", lambda: crypto.hash(small, "sha512"))
bench.measure("crypto.check.small", lambda: crypto.check(small, hash_hex))
bench.measure("crypto.verify.bytes", lambda: crypto.verify(small, mac_bytes))
bench.measure("crypto.signer.create", lambda: crypto.signer().update(small).hexdigest())
bench.measure("crypto.signer.copy", lambda: base_mac.copy().update(small).hexdigest())
bench.measure("crypto.hasher.small", lambda: crypto.hasher("sha256").update(small).hexdigest())

def streamed_mac () -> bytes:

    signed = crypto.signer()

    for offset in range(0, len(payload), 65536): signed.update(payload[offset:offset + 65536])

    return signed.digest()

bench.measure("crypto.signer.1m", streamed_mac, rounds=200)
