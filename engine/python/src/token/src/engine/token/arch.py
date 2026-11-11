from dataclasses import dataclass, field
from typing import Any


ACCESS  = 900
REFRESH = 30 * 86400
LEEWAY  = 5
PREFIX  = 8
RESERVED = frozenset({ "sub", "iss", "iat", "exp", "jti", "kind", "fp" })
REQUIRED = ("sub", "iss", "iat", "exp", "jti", "kind")
HEADERS  = frozenset({ "alg", "typ", "kid", "cty" })
DIGESTS  = { "HS256": ("sha256", 32), "HS384": ("sha384", 48), "HS512": ("sha512", 64) }
LONGEST  = 8192
URLSAFE  = bytes.maketrans(b"-_", b"+/")

@dataclass(frozen=True, slots=True)
class Claims:

    subject : str
    kind    : str
    id      : str
    issued  : int
    expires : int
    facts   : dict[str, Any] = field(default_factory=dict)

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
