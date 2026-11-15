from .base import Base
from collections.abc import Mapping
from typing import Any

from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.json import json
from engine.rand import rand
from .arch import IDENTITY, LIFETIME, LONGEST, REQUIRED, RESERVED, Store
from .claims import Claims
from .pair import Pair
from .settings import Settings
from .codec import Codec
from .reference import Reference

class Issuer:

    __slots__ = ("_codec", "_prefix", "_settings", "_store")

    def __init__ ( self, codec: Codec, settings: Settings, store: Store | None = None ) -> None:

        given: object = codec
        policy: object = settings

        if not isinstance(given, Codec) or not isinstance(policy, Settings): raise Base.setting("issuer")
        if codec.can("stored"):

            if store is None or not callable(getattr(store, "add", None)) or not callable(getattr(store, "get", None)):

                raise Base.setting("store")

        elif store is not None: raise Base.setting("store")

        self._codec    = codec
        self._settings = settings
        self._store    = store
        self._prefix   = ""

        if store is not None:

            scope = json.encode([codec.name, settings.issuer, settings.purpose, settings.audience])
            self._prefix = "token:" + crypto.hash(scope, "sha256") + ":"

    @property
    def purpose ( self ) -> str:

        return self._settings.purpose

    @property
    def format ( self ) -> str:

        return self._codec.name

    @property
    def ttl ( self ) -> int:

        return self._settings.ttl

    async def issue (
        self, subject: str, *, ttl: int | None = None, fingerprint: str | None = None, **facts: Any,
    ) -> str:

        body = self._body_(subject, self.purpose, self.ttl if ttl is None else ttl, fingerprint, facts)

        if self._store is None: return self._encode_(body)

        raw = json.encode(body)

        if len(raw) > LONGEST: raise Base.setting("size")

        raw = memoryview(raw).tobytes()
        lifetime = body["exp"] - date.stamp() + self._settings.leeway

        if lifetime <= 0: raise Base.setting("ttl")

        for _ in range(3):

            text = self._encode_(body)

            try: added = await self._store.add(self.key(text), raw, lifetime)
            except OSError as error: raise Fault(Code.UNAVAILABLE, reason="token.store", unknown=True) from error

            if added: return text

        raise Fault(Code.CONFLICT, reason="token.collision")

    async def verify ( self, text: str, *, fingerprint: str | None = None ) -> Claims:

        if self._store is None: return self._verify_(text, self.purpose, fingerprint)

        try: raw = await self._store.get(self.key(text))
        except OSError as error: raise Fault(Code.UNAVAILABLE, reason="token.store") from error

        if type(raw) is not bytes: raise Base.refused()

        return self._checked_(Base.payload(raw), self.purpose, fingerprint)

    def key ( self, text: str ) -> str:

        if not isinstance(self._codec, Reference): raise Fault(Code.INTERNAL, reason="token.capability")

        self._codec.check(text)

        return self._prefix + crypto.hash(text, "sha256")

    def peek ( self, text: str ) -> Mapping[str, Any]:

        return self._codec.peek(text)

    def can ( self, capability: str ) -> bool:

        return self._codec.can(capability)

    def rotate ( self, keys: Mapping[str, str | bytes], active: str ) -> Issuer:

        return Issuer(self._codec.rotate(keys, active), self._settings, self._store)

    def describe ( self ) -> dict[str, object]:

        return {
            "format": self.format, "purpose": self.purpose, "issuer": self._settings.issuer,
            "audience": self._settings.audience, "ttl": self.ttl, "leeway": self._settings.leeway,
            "adapter": self._codec.describe(),
        }

    def _issue_ (
        self, subject: str, purpose: str, ttl: int, fingerprint: str | None, facts: dict[str, Any],
    ) -> str:

        return self._encode_(self._body_(subject, purpose, ttl, fingerprint, facts))

    def _pair_ ( self, subject: str, refresh: int, fingerprint: str | None, facts: dict[str, Any] ) -> Pair:

        access = self._body_(subject, "access", self.ttl, fingerprint, facts)
        renew  = self._body_(subject, "refresh", refresh, None, {})

        if "fp" in access: renew["fp"] = access["fp"]

        return Pair(self._encode_(access), self._encode_(renew), self.ttl)

    def _verify_ ( self, text: str, purpose: str, fingerprint: str | None ) -> Claims:

        if not Base.label(purpose): raise Base.setting("purpose")

        return self._checked_(self._codec.decode(text), purpose, fingerprint)

    def _encode_ ( self, body: dict[str, Any] ) -> str:

        text = self._codec.encode(body)

        if len(text) > LONGEST: raise Base.setting("size")

        return text

    def _body_ (
        self, subject: str, purpose: str, ttl: int, fingerprint: str | None, facts: dict[str, Any],
    ) -> dict[str, Any]:

        if type(subject) is not str or len(subject) > LONGEST: raise Base.setting("subject")
        if not Base.label(purpose): raise Base.setting("purpose")
        if type(ttl) is not int or not -LIFETIME <= ttl <= LIFETIME: raise Base.setting("ttl")
        if fingerprint is not None and (type(fingerprint) is not str or len(fingerprint) > LONGEST):

            raise Base.setting("fingerprint")

        free = self._free_(facts)
        now  = int(date.stamp())
        body = {
            "sub": subject, "iss": self._settings.issuer, "iat": now, "exp": now + ttl,
            "jti": rand.hex(IDENTITY, secure=True), "kind": purpose, **free,
        }

        if fingerprint: body["fp"] = crypto.fingerprint(fingerprint)
        if self._settings.audience is not None: body["aud"] = self._settings.audience

        return body

    def _checked_ ( self, body: dict[str, Any], purpose: str, fingerprint: str | None ) -> Claims:

        if any(name not in body for name in REQUIRED): raise Base.refused()

        now     = date.stamp()
        issued  = Base.instant(body["iat"])
        expires = Base.instant(body["exp"])
        starts  = Base.instant(body["nbf"]) if "nbf" in body else 0
        leeway  = self._settings.leeway

        if issued is None or expires is None or starts is None: raise Base.refused()
        if issued > now + leeway or starts > now + leeway: raise Base.refused()
        if expires <= now - leeway: raise Fault(Code.UNAUTHORIZED, reason="token.expired")
        if body["iss"] != self._settings.issuer or not self._intended_(body.get("aud")): raise Base.refused()
        if type(body["sub"]) is not str or type(body["jti"]) is not str: raise Base.refused()
        if body["kind"] != purpose: raise Fault(Code.UNAUTHORIZED, reason="token.kind")

        bound = body.get("fp")

        if bound is not None and not self._bound_(bound, fingerprint):

            raise Fault(Code.UNAUTHORIZED, reason="token.fingerprint")

        facts = { name: value for name, value in body.items() if name not in RESERVED }

        return Claims(body["sub"], purpose, body["jti"], int(issued), int(expires), facts)

    @staticmethod
    def _bound_ ( bound: object, fingerprint: str | None ) -> bool:

        if type(bound) is not str or type(fingerprint) is not str or len(fingerprint) > LONGEST: return False

        return rand.constant_equal(bound, crypto.fingerprint(fingerprint))

    def _intended_ ( self, audience: Any ) -> bool:

        expected = self._settings.audience

        if expected is None: return audience is None or audience in ("", [])
        if type(audience) is str: return audience == expected

        return type(audience) is list and all(type(item) is str for item in audience) and expected in audience

    def _free_ ( self, facts: dict[str, Any] ) -> dict[str, Any]:

        taken = RESERVED.intersection(facts)

        if self._settings.audience is not None and "aud" in facts: taken |= { "aud" }

        if taken: raise Fault(Code.INTERNAL, reason="token.claim", errors={ "claims": sorted(taken) })

        return facts
