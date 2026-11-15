from .base import Base
from collections.abc import Mapping
from typing import Any, ClassVar, override

lazy import pyseto
lazy from pyseto import KeyInterface
lazy from pyseto.exceptions import PysetoError

from engine.date import date
from engine.error import Code, Fault
from engine.json import json
from .arch import LONGEST, MOMENTS, PASETO_PARTS, RFC3339
from .codec import Codec

class Paseto(Codec):

    __slots__ = ("_assertion", "_footer", "_key", "_keys", "_protection")

    name: ClassVar[str] = "paseto"
    capabilities: ClassVar[frozenset[str]] = frozenset({ "issue", "verify", "rotate" })

    def __init__ (
        self, key: str | bytes, protection: str = "local", *, keys: Mapping[str, str | bytes] | None = None,
        active: str | None = None, assertion: bytes = b"",
    ) -> None:

        if protection not in ("local", "public"): raise Base.setting("protection")

        if type(assertion) is not bytes or len(assertion) > LONGEST: raise Base.setting("assertion")

        self._assertion  = assertion
        self._protection = protection
        self._key        = self._prepare_(key)
        self._keys       = {}
        self._footer     = b""

        if keys is None and active is not None: raise Fault(Code.INTERNAL, reason="token.key")

        if keys is not None:

            if active is None: raise Fault(Code.INTERNAL, reason="token.key")

            Base.ring(keys, active)

            self._keys = { name: self._prepare_(value) for name, value in keys.items() }
            self._key  = self._keys[active]
            self._footer = json.encode({ "kid": active })

    @override
    def can ( self, capability: str ) -> bool:

        if capability == "issue": return self._key.is_secret
        if capability == "encrypted": return self._protection == "local"
        if capability == "signed": return self._protection == "public"

        return super().can(capability)

    @override
    def encode ( self, body: dict[str, Any] ) -> str:

        self.ensure("issue")

        wire = dict(body)

        for name in MOMENTS:

            if name not in wire: continue

            value = Base.instant(wire[name])

            if value is None: raise Base.setting(name)

            wire[name] = date.iso(date.from_millis(value * 1000))

        raw = json.encode(wire)

        if len(raw) > LONGEST: raise Base.setting("size")

        try:

            encoded = pyseto.encode(self._key, raw, footer=self._footer, implicit_assertion=self._assertion)

            return encoded.decode("ascii")
        except (PysetoError, ValueError, TypeError) as error:

            raise Fault(Code.INTERNAL, reason="token.encode") from error

    @override
    def decode ( self, text: str ) -> dict[str, Any]:

        Base.bounded(text)

        parts = text.split(".")

        if len(parts) not in (3, 4) or parts[:2] != ["v4", self._protection] or not parts[2]: raise Base.refused()

        Base.unpack(parts[2])

        footer = Base.unpack(parts[3]) if len(parts) == PASETO_PARTS and parts[3] else b""

        if len(parts) == PASETO_PARTS and not footer: raise Base.refused()

        key = self._key

        if self._keys:

            kid = Base.payload(footer).get("kid")

            if type(kid) is not str or kid not in self._keys: raise Base.refused()

            key = self._keys[kid]

        try: raw = pyseto.decode(key, text, implicit_assertion=self._assertion).payload
        except (PysetoError, ValueError, TypeError) as error: raise Base.refused() from error

        if type(raw) is not bytes: raise Base.refused()

        return self._moments_(Base.payload(raw))

    @staticmethod
    def _moments_ ( body: dict[str, Any] ) -> dict[str, Any]:

        for name in MOMENTS:

            if name not in body: continue

            value = body[name]

            if type(value) is not str or RFC3339.fullmatch(value) is None: raise Base.refused()

            try: body[name] = date.parse(value).timestamp()
            except Fault as error: raise Base.refused() from error

        return body

    @override
    def rotate ( self, keys: Mapping[str, str | bytes], active: str ) -> Paseto:

        Base.ring(keys, active)

        return Paseto(keys[active], self._protection, keys=keys, active=active, assertion=self._assertion)

    @override
    def describe ( self ) -> dict[str, object]:

        capabilities = { item for item in self.capabilities if self.can(item) }
        capabilities.add("encrypted" if self._protection == "local" else "signed")

        return {
            "family": self.family, "name": self.name, "version": 4, "protection": self._protection,
            "capabilities": sorted(capabilities), "keys": list(self._keys),
        }

    def _prepare_ ( self, value: str | bytes ) -> KeyInterface:

        key = Base.secret(value, 32, exact=True) if self._protection == "local" else Base.secret(value, 1)

        try: return pyseto.Key.new(4, self._protection, key)
        except (PysetoError, ValueError, TypeError) as error:

            raise Fault(Code.INTERNAL, reason="token.secret") from error
