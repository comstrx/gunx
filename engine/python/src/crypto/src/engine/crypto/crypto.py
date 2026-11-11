from typing import Any

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from engine.error import Code, Fault
from engine.parse import parse
from engine.string import string
from engine.rand import rand
from .arch import (
    COUNTER, FRAME_BYTES, HKDF_BYTES, KEY_BYTES, Key, MAGIC, NONCE_BYTES, OFFSET_MASK, Pair, SAFE, Sealed, TAG_BYTES,
    TOTP_BYTES, TOTP_CEILING, TOTP_DIGITS, TOTP_FLOOR, TOTP_HASH, TOTP_LEAST, TOTP_MOST, TOTP_PACE, TOTP_STEP,
    TOTP_TEXT, TOTP_WINDOW, TRUNCATE, Wire,
)
import base64, blake3, hashlib, hmac, math, time, zlib

class Crypto:

    def __init__ ( self ) -> None:

        self._keys: dict[str, Key]       = {}
        self._ciphers: dict[str, AESGCM] = {}
        self._current: str | None        = None

    def setup ( self, keys: list[Key], current: str | None = None ) -> None:

        held   = { key.id: key for key in keys }
        chosen = current or (keys[0].id if keys else None)

        if not keys or len(held) != len(keys): raise Fault(Code.INTERNAL, reason="crypto.keys")
        if chosen not in held: raise Fault(Code.INTERNAL, reason="crypto.current")

        self._keys    = held
        self._ciphers = { key.id: AESGCM(key.secret) for key in keys }
        self._current = chosen

    def ready ( self ) -> bool:

        return self._current is not None

    def key ( self, id_: str | None = None ) -> Key:

        return Key(id_ or rand.hex(4), rand.bytes(KEY_BYTES))

    def parse_key ( self, text: str ) -> Key:

        id_, _, secret = text.rpartition(":")
        bare           = secret.rstrip("=")
        padded         = len(secret) - len(bare)
        raw            = Wire.unpack(bare.translate(SAFE)) if padded in (0, -len(bare) % 4) else None

        if raw is None: raise Fault(Code.INTERNAL, reason="crypto.key")

        return Key(id_ or "k1", raw)

    def export_key ( self, key: Key ) -> str:

        return f"{key.id}:{Wire.pack(key.secret)}"

    def current ( self ) -> Key:

        if self._current is None: raise Fault(Code.INTERNAL, reason="crypto.setup")

        return self._keys[self._current]

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._keys))

    def seal ( self, plain: bytes | str, aad: bytes = b"" ) -> str:

        name  = self.current().id
        nonce = rand.bytes(NONCE_BYTES)
        data  = plain if type(plain) is bytes else self._raw_(plain)

        return Sealed(name, nonce, self._ciphers[name].encrypt(nonce, data, aad)).encode()

    def open ( self, text: str, aad: bytes = b"" ) -> bytes:

        sealed = Sealed.decode(text)

        return self._decrypt_(sealed.key, sealed.nonce, sealed.body, aad)

    def open_text ( self, text: str, aad: bytes = b"" ) -> str:

        try: return self.open(text, aad).decode()
        except UnicodeDecodeError as error: raise Fault(Code.BAD_REQUEST, reason="crypto.encoding") from error

    def stale ( self, text: str ) -> bool:

        return Sealed.decode(text).key != self._current

    def rotate ( self, text: str, aad: bytes = b"" ) -> str:

        return self.seal(self.open(text, aad), aad)

    def seal_bytes ( self, plain: bytes, aad: bytes = b"" ) -> bytes:

        name  = self.current().id
        nonce = rand.bytes(NONCE_BYTES)
        label = name.encode()

        return MAGIC + bytes([len(label)]) + label + nonce + self._ciphers[name].encrypt(nonce, plain, aad)

    def open_bytes ( self, blob: bytes, aad: bytes = b"" ) -> bytes:

        if not blob.startswith(MAGIC) or len(blob) <= len(MAGIC): raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        width = blob[len(MAGIC)]
        start = len(MAGIC) + 1
        name  = blob[start:start + width].decode("utf-8", "replace")
        rest  = blob[start + width:]

        if len(rest) < NONCE_BYTES + TAG_BYTES: raise Fault(Code.BAD_REQUEST, reason="crypto.sealed")

        return self._decrypt_(name, rest[:NONCE_BYTES], rest[NONCE_BYTES:], aad)

    def hkdf (
        self, secret: bytes | str, info: bytes | str, length: int = KEY_BYTES, salt: bytes | None = None,
    ) -> bytes:

        raw = self._raw_(secret)

        if type(length) is not int or not 1 <= length <= HKDF_BYTES: raise Fault(Code.INTERNAL, reason="crypto.length")
        if not raw: raise Fault(Code.INTERNAL, reason="crypto.secret")

        return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=self._raw_(info)).derive(raw)

    def derive ( self, info: str, id_: str | None = None ) -> Key:

        key = self.current()

        return Key(id_ or f"{key.id}.{info}", self.hkdf(key.secret, info))

    def keypair ( self ) -> Pair:

        private = Ed25519PrivateKey.generate()
        public  = private.public_key().public_bytes_raw()

        return Pair(public, private.private_bytes_raw())

    def attest ( self, data: bytes | str, private: bytes ) -> str:

        raw = self._raw_(data)

        try: return Wire.pack(Ed25519PrivateKey.from_private_bytes(private).sign(raw))
        except ValueError as error: raise Fault(Code.INTERNAL, reason="crypto.private") from error

    def attested ( self, data: bytes | str, signature: str, public: bytes ) -> bool:

        raw     = self._raw_(data)
        decoded = Wire.unpack(signature)

        if decoded is None: return False

        try: Ed25519PublicKey.from_public_bytes(public).verify(decoded, raw)
        except (InvalidSignature, ValueError): return False

        return True

    def crc32 ( self, data: bytes | str ) -> int:

        return zlib.crc32(self._raw_(data))

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
        wanted = self._digits_("".join(code.split())) if len(code) <= TOTP_TEXT else ""
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

        label = parse.quote(self._raw_(f"{issuer}:{account}").decode())
        query = f"secret={named}&issuer={parse.quote(issuer)}&digits={digits}&period={step}&algorithm=SHA1"

        return f"otpauth://totp/{label}?{query}"

    def hash ( self, data: bytes | str, algorithm: str = "sha256" ) -> str:

        raw = data if type(data) is bytes else self._raw_(data)

        if algorithm == "blake3": return blake3.blake3(raw).hexdigest()
        if algorithm == "sha256": return hashlib.sha256(raw).hexdigest()

        made = self.hasher(algorithm)

        made.update(raw)

        return str(made.hexdigest())

    def digest ( self, data: bytes | str ) -> str:

        return self.hash(data, "blake3")

    def hasher ( self, algorithm: str = "blake3" ) -> Any:

        if algorithm == "blake3": return blake3.blake3()

        try: made = hashlib.new(algorithm)
        except (ValueError, TypeError) as error: raise Fault(Code.INTERNAL, reason="crypto.algorithm") from error

        if not made.digest_size: raise Fault(Code.INTERNAL, reason="crypto.algorithm")

        return made

    def mac ( self, data: bytes | str, secret: bytes | str | None = None, algorithm: str = "sha256" ) -> bytes:

        raw = data if type(data) is bytes else self._raw_(data)
        key = self.current().secret if secret is None else secret if type(secret) is bytes else self._raw_(secret)

        if not key: raise Fault(Code.INTERNAL, reason="crypto.secret")

        try: return hmac.digest(key, raw, algorithm)
        except ValueError as error: raise Fault(Code.INTERNAL, reason="crypto.algorithm") from error

    def sign ( self, data: bytes | str, secret: bytes | str | None = None ) -> str:

        return self.mac(data, secret).hex()

    def verify ( self, data: bytes | str, signature: str, secret: bytes | str | None = None ) -> bool:

        return rand.constant_equal(self.sign(data, secret), signature)

    def fingerprint ( self, *parts: str ) -> str:

        raws = [self._raw_(part) for part in parts]

        return blake3.blake3(b"".join(len(raw).to_bytes(FRAME_BYTES) + raw for raw in raws)).hexdigest()[:32]

    def describe ( self ) -> dict[str, object]:

        return { "keys": self.names(), "current": self._current }

    def _raw_ ( self, data: bytes | str ) -> bytes:

        if not isinstance(data, str): return data

        try: return data.encode()
        except UnicodeEncodeError as error: raise Fault(Code.BAD_REQUEST, reason="crypto.encoding") from error

    def _decrypt_ ( self, name: str, nonce: bytes, body: bytes, aad: bytes ) -> bytes:

        cipher = self._ciphers.get(name)

        if cipher is None: raise Fault(Code.BAD_REQUEST, reason="crypto.unknown_key")

        try: return cipher.decrypt(nonce, body, aad)
        except InvalidTag as error: raise Fault(Code.BAD_REQUEST, reason="crypto.tampered") from error

    def _totp_key_ ( self, secret: str ) -> bytes:

        if len(secret) > TOTP_TEXT: raise Fault(Code.BAD_REQUEST, reason="crypto.secret")

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

        if not paced or not sized or not math.isfinite(moment): raise Fault(Code.INTERNAL, reason="crypto.totp")

        return int(moment // step)

    def _code_ ( self, key: bytes, counter: int, digits: int ) -> str:

        mac    = hmac.digest(key, counter.to_bytes(8), TOTP_HASH)
        offset = mac[-1] & OFFSET_MASK
        code   = (int.from_bytes(mac[offset:offset + 4]) & TRUNCATE) % 10 ** digits

        return str(code).zfill(digits)
