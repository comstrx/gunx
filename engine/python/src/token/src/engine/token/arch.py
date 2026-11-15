from dataclasses import dataclass
from typing import Any, Protocol

import re

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
class Opaque:

    plain  : str
    hashed : str
    prefix : str

class Store(Protocol):

    async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool: ...
    async def get ( self, key: str, default: Any = None ) -> Any: ...
