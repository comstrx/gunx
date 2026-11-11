from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
from engine.number import Money

STATUSES = frozenset({ "pending", "authorized", "captured", "failed", "refunded", "cancelled" })
METHODS  = frozenset({ "card", "wallet", "cash", "bank" })
IDENT    = 128
REFERENCE = 64
SECRET   = 16
RETURNS  = 2_048
HOOK     = 1024 * 1024

def named ( value: object, most: int = IDENT ) -> bool:

    return type(value) is str and 0 < len(value) <= most and value.isprintable()

def wrong ( what: str ) -> Fault:

    return Fault(Code.INTERNAL, reason=f"gateway.{what}", errors={ what: ["is invalid"] })

@dataclass(frozen=True, slots=True)
class Charge:

    id        : str
    provider  : str
    amount    : Money
    status    : str
    reference : str
    method    : str = "card"
    redirect  : str | None = None
    raw       : dict[str, Any] = field(default_factory=dict)

    def __post_init__ ( self ) -> None:

        raw: object = self.raw

        if type(self.status) is not str or self.status not in STATUSES:

            raise Fault(Code.INTERNAL, reason="gateway.status", errors={ "status": [str(self.status)[:32]] })

        if not named(self.id) or not named(self.provider) or not isinstance(self.amount, Money): raise wrong("charge")
        if not named(self.reference, REFERENCE) or type(self.method) is not str or self.method not in METHODS:

            raise wrong("charge")
        if self.redirect is not None and not self._linked_(self.redirect): raise wrong("redirect")

        if not isinstance(raw, dict): raise wrong("charge")

    def paid ( self ) -> bool:

        return self.status == "captured"

    @staticmethod
    def _linked_ ( target: str ) -> bool:

        return named(target, 2_048) and target.startswith(("https://", "http://", "/")) and not target.startswith("//")

    def dump ( self ) -> dict[str, Any]:

        return {
            "id": self.id, "provider": self.provider, "amount": self.amount.dump(), "status": self.status,
            "reference": self.reference, "method": self.method, "redirect": self.redirect,
        }

@dataclass(frozen=True, slots=True)
class Refund:

    id     : str
    charge : str
    amount : Money
    status : str
    raw    : dict[str, Any] = field(default_factory=dict)

    def __post_init__ ( self ) -> None:

        raw: object = self.raw

        if not named(self.id) or not named(self.charge) or not isinstance(self.amount, Money): raise wrong("refund")
        if not named(self.status, 32) or not isinstance(raw, dict): raise wrong("refund")

    def dump ( self ) -> dict[str, Any]:

        return { "id": self.id, "charge": self.charge, "amount": self.amount.dump(), "status": self.status }

@dataclass(frozen=True, slots=True)
class Webhook:

    provider  : str
    event     : str
    charge    : str | None
    status    : str | None
    reference : str | None
    raw       : dict[str, Any] = field(default_factory=dict)

    def __post_init__ ( self ) -> None:

        raw: object = self.raw
        texts: tuple[object, ...] = (self.charge, self.status, self.reference)

        if not named(self.provider) or not named(self.event): raise wrong("webhook")
        if any(value is not None and not named(value, 256) for value in texts) or not isinstance(raw, dict):

            raise wrong("webhook")

    def dump ( self ) -> dict[str, Any]:

        return {
            "provider": self.provider, "event": self.event, "charge": self.charge, "status": self.status,
            "reference": self.reference,
        }
