from collections.abc import Mapping
from typing import Any

from engine.crypto import crypto
from engine.date import date
from engine.error import Code, Fault
from engine.string import string
from engine.json import json
from engine.rand import rand
from .arch import (
    ACCESS, Claims, DIGESTS, HEADERS, LEEWAY, LONGEST, Opaque, PREFIX, Pair, REFRESH, REQUIRED, RESERVED, URLSAFE,
)
import binascii, math

class Token:

    def __init__ ( self ) -> None:

        self._secret: str | None = None
        self._digest    = "sha256"
        self._issuer    = "engine"
        self._algorithm = "HS256"
        self._access    = ACCESS
        self._refresh   = REFRESH
        self._key       = b""
        self._head      = b""

    def setup (
        self, secret: str, issuer: str = "engine", algorithm: str = "HS256", access: int = ACCESS,
        refresh: int = REFRESH,
    ) -> None:

        found = DIGESTS.get(algorithm)

        if found is None: raise Fault(Code.INTERNAL, "The token algorithm is not supported", "token.algorithm")

        digest, least = found
        key           = secret.encode()

        if len(key) < least: raise Fault(Code.INTERNAL, "The token secret is too short", "token.secret")

        self._secret    = secret
        self._digest    = digest
        self._issuer    = issuer
        self._algorithm = algorithm
        self._access    = access
        self._refresh   = refresh
        self._key       = key
        self._head      = self._pack_(json.encode({ "alg": algorithm, "typ": "JWT" }))

    def ready ( self ) -> bool:

        return self._secret is not None

    def issue ( self, subject: str, kind: str = "access", ttl: int | None = None, **facts: Any ) -> str:

        return self._sign_(subject, kind, ttl, self._free_(facts))

    def verify ( self, token: str, kind: str = "access", fingerprint: str | None = None ) -> Claims:

        payload = self._checked_(token)

        if payload["kind"] != kind: raise Fault(Code.UNAUTHORIZED, reason="token.kind")

        bound = payload.get("fp")

        if bound is not None and not self._bound_(bound, fingerprint):

            raise Fault(Code.UNAUTHORIZED, reason="token.fingerprint")

        facts = { key: value for key, value in payload.items() if key not in RESERVED }

        return Claims(str(payload["sub"]), kind, str(payload["jti"]), int(payload["iat"]), int(payload["exp"]), facts)

    def pair ( self, subject: str, fingerprint: str | None = None, **facts: Any ) -> Pair:

        bound = { "fp": crypto.fingerprint(fingerprint) } if fingerprint else {}

        return Pair(
            self._sign_(subject, "access", None, { **self._free_(facts), **bound }),
            self._sign_(subject, "refresh", None, bound),
            self._access,
        )

    def refresh ( self, token: str, fingerprint: str | None = None, **facts: Any ) -> Pair:

        claims = self.verify(token, "refresh", fingerprint)

        return self.pair(claims.subject, fingerprint, **facts)

    def peek ( self, token: str ) -> Mapping[str, Any]:

        return self._claims_(self._split_(token)[2])

    def opaque ( self, size: int = 32 ) -> Opaque:

        plain = rand.token(size)

        return Opaque(plain, self.hash_opaque(plain), plain[:PREFIX])

    def hash_opaque ( self, plain: str ) -> str:

        return crypto.hash(plain, "sha256")

    def matches ( self, plain: str, hashed: str ) -> bool:

        return rand.constant_equal(self.hash_opaque(plain), hashed)

    def bearer ( self, header: str | None ) -> str | None:

        if not header: return None

        scheme, _, value = header.strip().partition(" ")

        return value.strip() if scheme.lower() == "bearer" and value.strip() else None

    def describe ( self ) -> dict[str, object]:

        return {
            "issuer": self._issuer, "algorithm": self._algorithm, "access": self._access, "refresh": self._refresh,
        }

    def _sign_ ( self, subject: str, kind: str, ttl: int | None, facts: Mapping[str, Any] ) -> str:

        self._secret_()

        now     = int(date.stamp())
        expires = now + (ttl if ttl is not None else self._access if kind == "access" else self._refresh)
        payload = { "sub": subject, "iss": self._issuer, "iat": now, "exp": expires, "jti": rand.hex(8), "kind": kind }

        payload.update(facts)

        signed = self._head + b"." + self._pack_(json.encode(payload))

        return (signed + b"." + self._pack_(crypto.mac(signed, self._key, self._digest))).decode()

    def _checked_ ( self, token: str ) -> dict[str, Any]:

        self._secret_()

        signed, head, body, mark = self._split_(token)

        if not rand.constant_equal(self._pack_(crypto.mac(signed, self._key, self._digest)), mark):

            raise self._refused_()

        if head != self._head and not self._headed_(head): raise self._refused_()

        payload = self._claims_(body)

        for name in REQUIRED:

            if name not in payload: raise self._refused_()

        now     = date.stamp()
        issued  = self._instant_(payload["iat"])
        expires = self._instant_(payload["exp"])
        starts  = self._instant_(payload["nbf"]) if "nbf" in payload else 0

        if issued is None or expires is None or starts is None: raise self._refused_()
        if issued > now + LEEWAY or starts > now + LEEWAY: raise self._refused_()
        if expires <= now - LEEWAY: raise Fault(Code.UNAUTHORIZED, reason="token.expired")
        if payload["iss"] != self._issuer or payload.get("aud"): raise self._refused_()
        if type(payload["sub"]) is not str or type(payload["jti"]) is not str: raise self._refused_()

        return payload

    def _split_ ( self, token: str ) -> tuple[bytes, bytes, bytes, bytes]:

        if len(token) > LONGEST: raise self._refused_()

        try: raw = token.encode("ascii")
        except UnicodeEncodeError as error: raise self._refused_() from error

        signed, _, mark = raw.rpartition(b".")
        head, dot, body = signed.partition(b".")

        if not dot or b"." in body: raise self._refused_()

        return signed, head, body, mark

    def _headed_ ( self, head: bytes ) -> bool:

        try: found = json.decode(self._unpack_(head))
        except (Fault, ValueError): return False

        if type(found) is not dict or found.get("alg") != self._algorithm: return False

        return HEADERS.issuperset(found) and all(type(value) is str for value in found.values())

    def _claims_ ( self, body: bytes ) -> dict[str, Any]:

        try: found = json.decode(self._unpack_(body))
        except (Fault, ValueError) as error: raise self._refused_() from error

        if type(found) is not dict: raise self._refused_()

        return found

    def _bound_ ( self, bound: object, fingerprint: str | None ) -> bool:

        if fingerprint is None or type(bound) is not str: return False

        return rand.constant_equal(bound, crypto.fingerprint(fingerprint))

    def _free_ ( self, facts: dict[str, Any] ) -> dict[str, Any]:

        taken = RESERVED.intersection(facts)

        if taken: raise Fault(Code.INTERNAL, reason="token.claim", errors={ "claims": sorted(taken) })

        return facts

    def _secret_ ( self ) -> str:

        if self._secret is None: raise Fault(Code.INTERNAL, reason="token.setup")

        return self._secret

    @staticmethod
    def _instant_ ( value: Any ) -> float | None:

        kind = type(value)

        if kind is int: return float(value) if abs(value) < 2 ** 62 else None
        if kind is float and math.isfinite(value): return float(value)

        return None

    @staticmethod
    def _pack_ ( raw: bytes ) -> bytes:

        return string.base64(raw, url=True).encode("ascii")

    @staticmethod
    def _unpack_ ( part: bytes ) -> bytes:

        return binascii.a2b_base64(part.translate(URLSAFE) + b"=" * (-len(part) % 4), strict_mode=True)

    @staticmethod
    def _refused_ () -> Fault:

        return Fault(Code.UNAUTHORIZED, reason="token.invalid")
