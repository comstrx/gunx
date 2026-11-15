from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from engine.error import Code, Fault
from engine.json import json
from engine.string import string
import math, re

ACCESS   = 900
REFRESH  = 30 * 86400
LEEWAY   = 5
PREFIX   = 8
KEY_ID   = 256
LONGEST  = 8192
KEYS     = 32
MINIMUM  = 16
ENTROPY  = 32
IDENTITY = 16
OPAQUE_LENGTH = 43
PASETO_PARTS = 4
LIFETIME = 10 * 366 * 86400
RESERVED = frozenset({ "sub", "iss", "iat", "exp", "jti", "kind", "fp", "format", "purpose" })
REQUIRED = ("sub", "iss", "iat", "exp", "jti", "kind")
HEADERS  = frozenset({ "alg", "typ", "kid", "cty" })
DIGESTS  = { "HS256": ("sha256", 32), "HS384": ("sha384", 48), "HS512": ("sha512", 64) }
MOMENTS  = ("iat", "exp", "nbf")
RFC3339  = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", re.ASCII)

@dataclass(frozen=True, slots=True)
class Claims:

    subject : str
    kind    : str
    id      : str
    issued  : int
    expires : int
    facts   : dict[str, Any] = field(default_factory=dict)

    @property
    def purpose ( self ) -> str:

        return self.kind

    def get ( self, name: str, default: Any = None ) -> Any:

        return self.facts.get(name, default)

@dataclass(frozen=True, slots=True)
class Pair:

    access  : str
    refresh : str
    expires : int

    def dump ( self ) -> dict[str, Any]:

        return { "access": self.access, "refresh": self.refresh, "expires": self.expires, "type": "Bearer" }

@dataclass(frozen=True, slots=True)
class Opaque:

    plain  : str
    hashed : str
    prefix : str

class Store(Protocol):

    async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool: ...
    async def get ( self, key: str, default: Any = None ) -> Any: ...

@dataclass(frozen=True, slots=True)
class Settings:

    issuer   : str
    purpose  : str
    audience : str | None
    ttl      : int
    leeway   : int = LEEWAY

    def __post_init__ ( self ) -> None:

        for name, value in (("issuer", self.issuer), ("purpose", self.purpose)):

            if not label(value): raise setting(name)

        if self.audience is not None and not label(self.audience): raise setting("audience")
        if type(self.ttl) is not int or not 0 < self.ttl <= LIFETIME: raise setting("ttl")
        if type(self.leeway) is not int or not 0 <= self.leeway <= ACCESS: raise setting("leeway")

def setting ( name: str ) -> Fault:

    return Fault(Code.INTERNAL, reason="token.settings", errors={ "setting": [name] })

def refused () -> Fault:

    return Fault(Code.UNAUTHORIZED, reason="token.invalid")

def label ( value: object ) -> bool:

    return type(value) is str and 0 < len(value) <= KEY_ID and value.isprintable() and bool(value.strip())

def instant ( value: Any ) -> float | None:

    if type(value) is int: return float(value) if abs(value) < 2 ** 62 else None
    if type(value) is float and math.isfinite(value) and abs(value) < 2 ** 62: return value

    return None

def bounded ( value: str ) -> str:

    if type(value) is not str or not value or len(value) > LONGEST or not value.isascii(): raise refused()

    return value

def pack ( value: bytes ) -> str:

    return string.base64(value, url=True)

def unpack ( value: str ) -> bytes:

    try: return string.unbase64(value, url=True, canonical=True)
    except Fault as error: raise refused() from error

def payload ( value: bytes ) -> dict[str, Any]:

    if len(value) > LONGEST: raise refused()

    try: found = json.decode(value)
    except Fault as error: raise refused() from error

    if type(found) is not dict: raise refused()

    return found

def ring ( keys: Mapping[str, str | bytes], active: str ) -> None:

    held: object = keys

    if not isinstance(held, Mapping) or not 0 < len(held) <= KEYS: raise setting("keys")
    if not label(active) or active not in keys: raise setting("active")
    if not all(label(name) for name in keys): raise Fault(Code.INTERNAL, reason="token.key")

def secret ( value: str | bytes, least: int, *, exact: bool = False ) -> bytes:

    if type(value) not in (str, bytes): raise Fault(Code.INTERNAL, reason="token.secret")

    try: raw = value.encode() if isinstance(value, str) else value
    except UnicodeError as error: raise Fault(Code.INTERNAL, reason="token.secret") from error

    if len(raw) < least or len(raw) > LONGEST or (exact and len(raw) != least):

        raise Fault(Code.INTERNAL, reason="token.secret")

    return raw
