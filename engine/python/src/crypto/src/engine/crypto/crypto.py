from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from engine.error import Code, Fault
from engine.parse import parse
from engine.string import string
from engine.rand import rand
from .arch import (
    COUNTER, FRAME_BYTES, HASHED, HKDF_BYTES, KEY_BYTES, KEY_ENCODED, KEY_TEXT, LIMIT, MAX_BYTES,
    OFFSET_MASK, Pair, SAFE,
    SIGNATURE_TEXT, TOTP_BYTES, TOTP_CEILING, TOTP_DIGITS, TOTP_FLOOR, TOTP_HASH, TOTP_LEAST, TOTP_MOST, TOTP_PACE,
    TOTP_STEP, TOTP_TEXT, TOTP_WINDOW, TRUNCATE, Key,
)
from .cipher import Cipher
from .hasher import Hasher
from .kdf import Kdf
from .wire import Wire
import base64, blake3, hashlib, hmac, math, time, zlib

class Crypto:

    __slots__ = ("_cipher", "_kdf", "_limit")

    def __init__ ( self ) -> None:

        self._cipher = Cipher()
        self._kdf    = Kdf()
        self._limit  = LIMIT

    def options (
        self, *, cipher: str | None = None, limit: int | None = None, time_cost: int | None = None,
        memory_cost: int | None = None, parallelism: int | None = None,
    ) -> Crypto:

        made         = object.__new__(Crypto)
        made._cipher = self._cipher.scope(cipher, limit)
        made._limit  = self._limit if limit is None else limit
        made._kdf    = self._kdf if time_cost is memory_cost is parallelism is None else Kdf(
            self._kdf.time if time_cost is None else time_cost,
            self._kdf.memory if memory_cost is None else memory_cost,
            self._kdf.lanes if parallelism is None else parallelism,
        )

        return made

    def setup ( self, keys: list[Key], current: str | None = None ) -> None:

        self._cipher.setup(keys, current)

    def ready ( self ) -> bool:

        return self._cipher.ready()

    def key ( self, id_: str | None = None ) -> Key:

        return Key(rand.hex(4) if id_ is None else id_, rand.bytes(KEY_BYTES))

    def parse_key ( self, text: str ) -> Key:

        if type(text) is not str or not 1 <= len(text) <= KEY_TEXT: raise Fault(Code.INTERNAL, reason="crypto.key")

        id_, _, secret = text.rpartition(":")
        bare           = secret.rstrip("=")
        padded         = len(secret) - len(bare)
        raw            = Wire.unpack(bare.translate(SAFE)) if len(bare) == KEY_ENCODED and padded in (0, 1) else None

        if raw is None: raise Fault(Code.INTERNAL, reason="crypto.key")

        return Key(id_ or "k1", raw)

    def export_key ( self, key: Key ) -> str:

        return f"{key.id}:{Wire.pack(key.secret)}"

    def current ( self ) -> Key:

        return self._cipher.current()

    def names ( self ) -> tuple[str, ...]:

        return self._cipher.names()

    def seal ( self, plain: bytes | str, aad: bytes = b"" ) -> str:

        return self._cipher.seal(plain, aad)

    def open ( self, text: str, aad: bytes = b"" ) -> bytes:

        return self._cipher.open(text, aad)

    def open_text ( self, text: str, aad: bytes = b"" ) -> str:

        try: return self.open(text, aad).decode()
        except UnicodeDecodeError as error: raise Fault(Code.BAD_REQUEST, reason="crypto.encoding") from error

    def stale ( self, text: str ) -> bool:

        return self._cipher.stale(text)

    def rotate ( self, text: str, aad: bytes = b"" ) -> str:

        return self._cipher.rotate(text, aad)

    def seal_bytes ( self, plain: bytes | str, aad: bytes = b"" ) -> bytes:

        return self._cipher.seal_bytes(plain, aad)

    def open_bytes ( self, blob: bytes, aad: bytes = b"" ) -> bytes:

        return self._cipher.open_bytes(blob, aad)

    def hkdf (
        self, secret: bytes | str, info: bytes | str, length: int = KEY_BYTES, salt: bytes | None = None,
    ) -> bytes:

        raw = Wire.raw(secret, self._limit)

        if type(length) is not int or not 1 <= length <= HKDF_BYTES: raise Fault(Code.INTERNAL, reason="crypto.length")
        if not raw: raise Fault(Code.INTERNAL, reason="crypto.secret")

        return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=Wire.raw(info, self._limit)).derive(raw)

    def derive ( self, info: str, id_: str | None = None ) -> Key:

        key = self.current()

        return Key(id_ or f"{key.id}.{info}", self.hkdf(key.secret, info))

    def keypair ( self ) -> Pair:

        private = Ed25519PrivateKey.generate()
        public  = private.public_key().public_bytes_raw()

        return Pair(public, private.private_bytes_raw())

    def attest ( self, data: bytes | str, private: bytes ) -> str:

        raw = Wire.raw(data, self._limit)

        if type(private) is not bytes or len(private) != KEY_BYTES: raise Fault(Code.INTERNAL, reason="crypto.private")

        try: return Wire.pack(Ed25519PrivateKey.from_private_bytes(private).sign(raw))
        except ValueError as error: raise Fault(Code.INTERNAL, reason="crypto.private") from error

    def attested ( self, data: bytes | str, signature: str, public: bytes ) -> bool:

        if type(signature) is not str or len(signature) != SIGNATURE_TEXT: return False
        if type(public) is not bytes or len(public) != KEY_BYTES: return False

        raw     = Wire.raw(data, self._limit)
        decoded = Wire.unpack(signature)

        if decoded is None: return False

        try: Ed25519PublicKey.from_public_bytes(public).verify(decoded, raw)
        except (InvalidSignature, ValueError): return False

        return True

    def crc32 ( self, data: bytes | str ) -> int:

        return zlib.crc32(Wire.raw(data, self._limit))

    def totp_secret ( self ) -> str:

        return base64.b32encode(rand.bytes(TOTP_BYTES)).decode()

    def totp (
        self, secret: str, at: float | None = None, digits: int = TOTP_DIGITS, step: int = TOTP_STEP,
    ) -> str:

        key     = self._totp_key_(secret)
        counter = self._counter_(at, digits, step)

        if not 0 <= counter <= COUNTER: raise Fault(Code.INTERNAL, reason="crypto.totp")

        return self._code_(key, counter, digits)

    def totp_match (
        self, secret: str, code: str, at: float | None = None, window: int = 1, digits: int = TOTP_DIGITS,
        step: int = TOTP_STEP,
    ) -> int | None:

        if type(window) is not int or not 0 <= window <= TOTP_WINDOW: raise Fault(Code.INTERNAL, reason="crypto.totp")

        key    = self._totp_key_(secret)
        base   = self._counter_(at, digits, step)
        wanted = self._digits_("".join(code.split())) if type(code) is str and len(code) <= TOTP_TEXT else ""
        found  = None

        for counter in range(max(base - window, 0), min(base + window, COUNTER) + 1):

            if rand.constant_equal(self._code_(key, counter, digits), wanted): found = counter

        return found

    def totp_verify (
        self, secret: str, code: str, at: float | None = None, window: int = 1, digits: int = TOTP_DIGITS,
        step: int = TOTP_STEP,
    ) -> bool:

        return self.totp_match(secret, code, at, window, digits, step) is not None

    def totp_uri (
        self, secret: str, account: str, issuer: str, digits: int = TOTP_DIGITS, step: int = TOTP_STEP,
    ) -> str:

        named = base64.b32encode(self._totp_key_(secret)).decode().rstrip("=")

        self._counter_(0, digits, step)

        if not account or not issuer or ":" in issuer: raise Fault(Code.INTERNAL, reason="crypto.totp")

        label = parse.quote(Wire.raw(f"{issuer}:{account}", self._limit).decode())
        query = f"secret={named}&issuer={parse.quote(issuer)}&digits={digits}&period={step}&algorithm=SHA1"

        return f"otpauth://totp/{label}?{query}"

    def hash ( self, data: bytes | str, algorithm: str = "sha256" ) -> str:

        raw = Wire.raw(data, self._limit)

        if algorithm == "argon2id": return self._kdf.hash(raw)
        if algorithm == "blake3": return blake3.blake3(raw).hexdigest()
        if algorithm == "sha256": return hashlib.sha256(raw).hexdigest()

        try: hashed = hashlib.new(algorithm, raw)
        except (ValueError, TypeError) as error: raise Fault(Code.INTERNAL, reason="crypto.algorithm") from error

        if not hashed.digest_size: raise Fault(Code.INTERNAL, reason="crypto.algorithm")

        return hashed.hexdigest()

    def check ( self, data: bytes | str, hashed: str, algorithm: str | None = None ) -> bool:

        if type(hashed) is not str or len(hashed) > HASHED: return False

        chosen = ("argon2id" if hashed.startswith("$argon2") else "sha256") if algorithm is None else algorithm
        if chosen == "argon2id": return self._kdf.check(Wire.raw(data, self._limit), hashed)

        return rand.constant_equal(self.hash(data, chosen), hashed)

    def rehash ( self, hashed: str ) -> bool:

        return self._kdf.stale(hashed)

    def digest ( self, data: bytes | str ) -> str:

        return self.hash(data, "blake3")

    def hasher ( self, algorithm: str = "blake3" ) -> Hasher:

        return Hasher(algorithm, self._limit)

    def signer ( self, secret: bytes | str | None = None, algorithm: str = "sha256" ) -> Hasher:

        key = self.current().secret if secret is None else Wire.raw(secret, self._limit)

        return Hasher.keyed(key, algorithm, self._limit)

    def mac ( self, data: bytes | str, secret: bytes | str | None = None, algorithm: str = "sha256" ) -> bytes:

        raw = Wire.raw(data, self._limit)
        key = self.current().secret if secret is None else Wire.raw(secret, self._limit)

        if not key: raise Fault(Code.INTERNAL, reason="crypto.secret")

        try: return hmac.digest(key, raw, algorithm)
        except (ValueError, TypeError) as error: raise Fault(Code.INTERNAL, reason="crypto.algorithm") from error

    def sign ( self, data: bytes | str, secret: bytes | str | None = None, algorithm: str = "sha256" ) -> str:

        return self.mac(data, secret, algorithm).hex()

    def verify (
        self, data: bytes | str, signature: bytes | str, secret: bytes | str | None = None, algorithm: str = "sha256",
    ) -> bool:

        if type(signature) is str and len(signature) <= HASHED:
            return rand.constant_equal(self.sign(data, secret, algorithm), signature)
        if type(signature) is bytes and len(signature) <= HASHED:
            return rand.constant_equal(self.mac(data, secret, algorithm), signature)

        return False

    def fingerprint ( self, *parts: str ) -> str:

        hashed = blake3.blake3()

        for part in parts:

            raw = Wire.raw(part, self._limit)

            hashed.update(len(raw).to_bytes(FRAME_BYTES))
            hashed.update(raw)

        return hashed.hexdigest(length=16)

    def describe ( self ) -> dict[str, object]:

        return self._cipher.describe()

    def _totp_key_ ( self, secret: str ) -> bytes:

        if type(secret) is not str or len(secret) > TOTP_TEXT: raise Fault(Code.BAD_REQUEST, reason="crypto.secret")

        padded = "".join(secret.split()).rstrip("=")

        try: raw = base64.b32decode(padded + "=" * (-len(padded) % 8), casefold=True)
        except ValueError as error: raise Fault(Code.BAD_REQUEST, reason="crypto.secret") from error

        if not TOTP_FLOOR <= len(raw) <= TOTP_CEILING: raise Fault(Code.BAD_REQUEST, reason="crypto.secret")

        return raw

    def _digits_ ( self, code: str ) -> str:

        return code if code.isascii() or not code.isdecimal() else string.digits(code)

    def _counter_ ( self, at: float | None, digits: int, step: int ) -> int:

        moment = time.time() if at is None else at
        paced  = type(step) is int and 1 <= step <= TOTP_PACE
        sized  = type(digits) is int and TOTP_LEAST <= digits <= TOTP_MOST

        bounded = type(moment) in (int, float) and -MAX_BYTES * COUNTER <= moment <= MAX_BYTES * COUNTER

        if not paced or not sized or not bounded or not math.isfinite(moment):
            raise Fault(Code.INTERNAL, reason="crypto.totp")

        return int(moment // step)

    def _code_ ( self, key: bytes, counter: int, digits: int ) -> str:

        mac    = hmac.digest(key, counter.to_bytes(8), TOTP_HASH)
        offset = mac[-1] & OFFSET_MASK
        code   = (int.from_bytes(mac[offset:offset + 4]) & TRUNCATE) % 10 ** digits

        return str(code).zfill(digits)
