from .base import Base
from collections.abc import Mapping
from typing import Any

from engine.crypto import crypto
from engine.error import Code, Fault
from engine.rand import rand
from .arch import ACCESS, LEEWAY, LIFETIME, LONGEST, MINIMUM, Opaque, PREFIX, REFRESH, Store
from .claims import Claims
from .pair import Pair
from .settings import Settings
from .codec import Codec
from .issuer import Issuer
from .jwt import Jwt
lazy from .paseto import Paseto
from .reference import Reference

class Token:

    def __init__ ( self ) -> None:

        self._state: tuple[Issuer, int] | None = None

    def options (
        self, *, format: str = "jwt", purpose: str = "access", secret: str | bytes | None = None,
        issuer: str = "engine", audience: str | None = None, ttl: int = ACCESS, leeway: int = LEEWAY,
        algorithm: str | None = None, protection: str | None = None, store: Store | None = None,
    ) -> Issuer:

        codec: Codec

        if format == "jwt":

            if protection is not None: raise Base.setting("protection")

            codec = Jwt(secret if secret is not None else b"", "HS256" if algorithm is None else algorithm)

        elif format == "paseto":

            if algorithm is not None: raise Base.setting("algorithm")

            codec = Paseto(secret if secret is not None else b"", "local" if protection is None else protection)

        elif format == "opaque":

            if secret is not None or algorithm is not None or protection is not None: raise Base.setting("format")

            codec = Reference()

        else: raise Base.setting("format")

        return self.use(codec, purpose=purpose, issuer=issuer, audience=audience, ttl=ttl, leeway=leeway, store=store)

    def use (
        self, codec: Codec, *, purpose: str = "access", issuer: str = "engine", audience: str | None = None,
        ttl: int = ACCESS, leeway: int = LEEWAY, store: Store | None = None,
    ) -> Issuer:

        return Issuer(codec, Settings(issuer, purpose, audience, ttl, leeway), store)

    def setup (
        self, secret: str, issuer: str = "engine", algorithm: str = "HS256", access: int = ACCESS,
        refresh: int = REFRESH, *, audience: str | None = None,
    ) -> None:

        if type(refresh) is not int or not 0 < refresh <= LIFETIME: raise Base.setting("refresh")

        scoped = self.options(secret=secret, issuer=issuer, algorithm=algorithm, ttl=access, audience=audience)
        self._state = (scoped, refresh)

    def rotate ( self, keys: Mapping[str, str | bytes], active: str ) -> None:

        issuer, refresh = self._configured_()
        self._state = (issuer.rotate(keys, active), refresh)

    def ready ( self ) -> bool:

        return self._state is not None

    def issue (
        self, subject: str, kind: str = "access", ttl: int | None = None, *, fingerprint: str | None = None,
        **facts: Any,
    ) -> str:

        issuer, refresh = self._configured_()
        lifetime = ttl if ttl is not None else issuer.ttl if kind == "access" else refresh

        return issuer._issue_(subject, kind, lifetime, fingerprint, facts)

    def verify ( self, token: str, kind: str = "access", fingerprint: str | None = None ) -> Claims:

        return self._configured_()[0]._verify_(token, kind, fingerprint)

    def pair ( self, subject: str, fingerprint: str | None = None, **facts: Any ) -> Pair:

        issuer, refresh = self._configured_()

        return issuer._pair_(subject, refresh, fingerprint, facts)

    def refresh ( self, token: str, fingerprint: str | None = None, **facts: Any ) -> Pair:

        issuer, refresh = self._configured_()
        claims = issuer._verify_(token, "refresh", fingerprint)

        return issuer._pair_(claims.subject, refresh, fingerprint, facts)

    def peek ( self, token: str ) -> Mapping[str, Any]:

        return Jwt.peek_unconfigured(token)

    def opaque ( self, size: int = 32 ) -> Opaque:

        if type(size) is not int or not MINIMUM <= size <= LONGEST: raise Base.setting("size")

        plain = rand.token(size, secure=True)

        return Opaque(plain, self.hash_opaque(plain), plain[:PREFIX])

    def hash_opaque ( self, plain: str ) -> str:

        return crypto.hash(plain, "sha256")

    def matches ( self, plain: str, hashed: str ) -> bool:

        return rand.constant_equal(self.hash_opaque(plain), hashed)

    def bearer ( self, header: str | None ) -> str | None:

        if type(header) is not str or not header or len(header) > LONGEST + 16: return None

        scheme, _, value = header.strip().partition(" ")

        return value.strip() if scheme.lower() == "bearer" and value.strip() else None

    def describe ( self ) -> dict[str, object]:

        if self._state is None:

            return { "issuer": "engine", "algorithm": "HS256", "access": ACCESS, "refresh": REFRESH }

        issuer, refresh = self._state
        found = issuer.describe()
        codec = found["adapter"]

        if not isinstance(codec, dict): raise Base.setting("adapter")

        return {
            "issuer": found["issuer"], "algorithm": codec["algorithm"],
            "access": issuer.ttl, "refresh": refresh,
        }

    def _configured_ ( self ) -> tuple[Issuer, int]:

        if self._state is None: raise Fault(Code.INTERNAL, reason="token.setup")

        return self._state
