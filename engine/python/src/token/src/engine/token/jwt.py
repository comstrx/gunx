from .base import Base
from collections.abc import Mapping
from typing import Any, ClassVar, override

from engine.crypto import crypto
from engine.error import Code, Fault
from engine.json import json
from engine.rand import rand
from .arch import DIGESTS, HEADERS, LONGEST
from .codec import Codec

class Jwt(Codec):

    __slots__ = ("_algorithm", "_head", "_keys", "_signer")

    name: ClassVar[str] = "jwt"
    capabilities: ClassVar[frozenset[str]] = frozenset({ "issue", "verify", "peek", "rotate", "signed" })

    def __init__ (
        self, key: str | bytes, algorithm: str = "HS256", *, keys: Mapping[str, str | bytes] | None = None,
        active: str | None = None,
    ) -> None:

        found = DIGESTS.get(algorithm) if type(algorithm) is str else None

        if found is None: raise Fault(Code.INTERNAL, reason="token.algorithm")

        digest, least   = found
        self._algorithm = algorithm
        signer          = crypto.signer(Base.secret(key, least), digest)
        self._keys      = {}
        head            = { "alg": algorithm, "typ": "JWT" }

        if keys is None and active is not None: raise Fault(Code.INTERNAL, reason="token.key")

        if keys is not None:

            if active is None: raise Fault(Code.INTERNAL, reason="token.key")

            Base.ring(keys, active)

            self._keys = { name: crypto.signer(Base.secret(value, least), digest) for name, value in keys.items() }
            signer = self._keys[active]
            head["kid"] = active

        self._head = Base.pack(json.encode(head))
        self._signer = signer

    @override
    def encode ( self, body: dict[str, Any] ) -> str:

        raw = json.encode(body)

        if len(raw) > LONGEST: raise Base.setting("size")

        signed = self._head + "." + Base.pack(raw)

        return signed + "." + Base.pack(self._signer.copy().update(signed).digest())

    @override
    def decode ( self, text: str ) -> dict[str, Any]:

        signed, head, body, mark = self._split_(text)
        signer = self._signer

        if head != self._head:

            header = Base.payload(Base.unpack(head))

            if header.get("alg") != self._algorithm or not HEADERS.issuperset(header): raise Base.refused()
            if not all(type(value) is str for value in header.values()): raise Base.refused()

            if self._keys:

                kid = header.get("kid")

                if type(kid) is not str or kid not in self._keys: raise Base.refused()

                signer = self._keys[kid]

        expected = Base.pack(signer.copy().update(signed).digest())

        if not rand.constant_equal(expected, mark): raise Base.refused()

        return Base.payload(Base.unpack(body))

    @override
    def peek ( self, text: str ) -> dict[str, Any]:

        return self.peek_unconfigured(text)

    @staticmethod
    def peek_unconfigured ( text: str ) -> dict[str, Any]:

        return Base.payload(Base.unpack(Jwt._split_(text)[2]))

    @override
    def rotate ( self, keys: Mapping[str, str | bytes], active: str ) -> Jwt:

        Base.ring(keys, active)

        return Jwt(keys[active], self._algorithm, keys=keys, active=active)

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), "algorithm": self._algorithm, "keys": list(self._keys) }

    @staticmethod
    def _split_ ( text: str ) -> tuple[str, str, str, str]:

        Base.bounded(text)

        signed, _, mark = text.rpartition(".")
        head, dot, body = signed.partition(".")

        if not dot or not head or not body or not mark or "." in body: raise Base.refused()

        return signed, head, body, mark
