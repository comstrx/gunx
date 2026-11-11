from engine.crypto import Password, crypto, password
from engine.test import Bench

bench = Bench()
quick = Password(1, 8, 1)

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
hashed  = password.hash("correct horse battery")
light   = quick.hash("correct horse battery")

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

def password_verify () -> None: password.verify(hashed, "correct horse battery")

def password_hash () -> None: password.hash("correct horse battery")

def password_stale () -> None: password.stale(hashed)

def password_light () -> None: quick.verify(light, "correct horse battery")

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
bench.measure("password.stale", password_stale)
bench.measure("password.light", password_light, rounds=2000)
bench.measure("password.verify", password_verify, rounds=20)
bench.measure("password.hash", password_hash, rounds=20)
