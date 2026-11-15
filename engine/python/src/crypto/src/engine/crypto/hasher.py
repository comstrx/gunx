from typing import cast

from engine.error import Code, Fault
from engine.rand import rand
from .arch import Digest, HASHED, LIMIT, MAX_BYTES
from .wire import Wire
import blake3, hashlib, hmac

class Hasher:

    __slots__ = ("_core", "_limit")

    def __init__ ( self, algorithm: str = "blake3", limit: int = LIMIT ) -> None:

        if type(limit) is not int or not 1 <= limit <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="crypto.limit")

        self._limit = limit

        try: core = blake3.blake3() if algorithm == "blake3" else hashlib.new(algorithm)
        except (ValueError, TypeError) as error: raise Fault(Code.INTERNAL, reason="crypto.algorithm") from error

        if not core.digest_size: raise Fault(Code.INTERNAL, reason="crypto.algorithm")

        self._core = cast("Digest", core)

    @classmethod
    def keyed ( cls, secret: bytes | str, algorithm: str = "sha256", limit: int = LIMIT ) -> Hasher:

        if type(limit) is not int or not 1 <= limit <= MAX_BYTES: raise Fault(Code.INTERNAL, reason="crypto.limit")

        key = Wire.raw(secret, MAX_BYTES)

        if not key: raise Fault(Code.INTERNAL, reason="crypto.secret")

        try: core = hmac.new(key, digestmod=algorithm)
        except (ValueError, TypeError) as error: raise Fault(Code.INTERNAL, reason="crypto.algorithm") from error

        made        = object.__new__(cls)
        made._core  = core
        made._limit = limit

        return made

    def update ( self, data: bytes | str ) -> Hasher:

        self._core.update(Wire.raw(data, self._limit))

        return self

    def digest ( self ) -> bytes:

        return self._core.digest()

    def hexdigest ( self ) -> str:

        return self._core.hexdigest()

    def check ( self, expected: bytes | str ) -> bool:

        if type(expected) not in (bytes, str) or len(expected) > HASHED: return False

        actual = self._core.digest() if isinstance(expected, bytes) else self._core.hexdigest()

        return rand.constant_equal(actual, expected)

    def copy ( self ) -> Hasher:

        made        = object.__new__(Hasher)
        made._core  = self._core.copy()
        made._limit = self._limit

        return made
