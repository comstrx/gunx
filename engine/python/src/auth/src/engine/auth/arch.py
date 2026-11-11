from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TYPE_CHECKING, TypeGuard

from engine.crypto import crypto

if TYPE_CHECKING:

    from .actor import Actor

type Ability = Callable[["Actor", Any], Awaitable[bool] | bool]

OTP_TTL      = 300.0
OTP_LONGEST  = 86_400.0
REVOKED_TTL  = 30 * 86_400.0
LONGEST      = 366 * 86_400.0
OTP_ATTEMPTS = 5
OTP_COOLDOWN = 60.0
IDENT        = 256
GRANTS       = 128
CODE         = 32
SUBJECT      = 512
HEADER       = 8_192
MINIMUM      = 32
LARGEST      = 4_096
DIGEST       = 16
WILD         = frozenset("*?[")
TAKEN        = frozenset({ "roles", "scopes", "tenant", "sub", "iss", "iat", "exp", "jti", "kind", "fp" })

HEADERS = {
    "actor"     : "X-Actor-Id",
    "roles"     : "X-Actor-Roles",
    "scopes"    : "X-Actor-Scopes",
    "tenant"    : "X-Tenant",
    "signature" : "X-Relay-Signature",
    "request"   : "X-Request-Id",
}
LOWER = { name: value.lower() for name, value in HEADERS.items() }

def named ( value: object, most: int = IDENT ) -> TypeGuard[str]:

    return isinstance(value, str) and 0 < len(value) <= most and value.isprintable()

def grant ( value: object ) -> TypeGuard[str]:

    return named(value) and "," not in value and " " not in value

def timed ( value: object, most: float ) -> bool:

    return isinstance(value, int | float) and type(value) is not bool and 0 < value <= most

def digest ( kind: str, value: str ) -> str:

    return f"{kind}:{crypto.digest(value.encode('utf-8', 'surrogatepass'))}"

@dataclass(frozen=True, slots=True)
class Otp:

    code    : str
    hashed  : str
    expires : float
