from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
from engine.string import string
from engine.token import Claims
from .arch import grant, GRANTS, named, TAKEN, WILD

@dataclass(frozen=True, slots=True)
class Actor:

    id     : str
    roles  : tuple[str, ...] = ()
    scopes : tuple[str, ...] = ()
    tenant : str | None = None
    facts  : dict[str, Any] = field(default_factory=dict)

    def __post_init__ ( self ) -> None:

        facts: object = self.facts

        if not named(self.id): raise self._wrong_("id")
        if self.tenant is not None and not named(self.tenant): raise self._wrong_("tenant")
        if not isinstance(facts, dict) or any(not named(key) or key in TAKEN for key in facts):

            raise self._wrong_("facts")

        object.__setattr__(self, "id", str(self.id))
        object.__setattr__(self, "tenant", None if self.tenant is None else str(self.tenant))
        object.__setattr__(self, "roles", self._granted_(self.roles, "roles"))
        object.__setattr__(self, "scopes", self._granted_(self.scopes, "scopes"))

    def has_role ( self, *roles: str ) -> bool:

        return any(role in self.roles for role in roles)

    def can ( self, scope: str ) -> bool:

        if type(scope) is not str: return False
        if scope in self.scopes: return True

        return any(string.glob(scope, held) for held in self.scopes if WILD.intersection(held))

    def dump ( self ) -> dict[str, Any]:

        return { "id": self.id, "roles": list(self.roles), "scopes": list(self.scopes), "tenant": self.tenant }

    @classmethod
    def from_claims ( cls, claims: Claims ) -> Actor:

        held: object = claims

        if not isinstance(held, Claims): raise cls._refused_()

        facts = { key: value for key, value in claims.facts.items() if key not in ("roles", "scopes", "tenant") }

        try: return cls(claims.subject, claims.get("roles", ()), claims.get("scopes", ()), claims.get("tenant"), facts)
        except Fault as fault: raise cls._refused_() from fault

    def _granted_ ( self, given: object, what: str ) -> tuple[str, ...]:

        if not isinstance(given, list | tuple) or len(given) > GRANTS: raise self._wrong_(what)
        if not all(grant(item) for item in given): raise self._wrong_(what)

        return tuple(dict.fromkeys(str(item) for item in given))

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="auth.actor", errors={ "actor": [what] })

    @staticmethod
    def _refused_ () -> Fault:

        return Fault(Code.UNAUTHORIZED, reason="auth.claims")
