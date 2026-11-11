from collections.abc import Mapping
from typing import Any, override

from engine.crypto import crypto
from engine.error import Code, Fault
from engine.number import Money
from engine.rand import rand
from .arch import Charge, Refund, SECRET, Webhook
from .provider import Provider

class Mock(Provider):

    name = "mock"

    def __init__ ( self, secret: str, fail_over: int | None = None ) -> None:

        if type(secret) is not str or len(secret) < SECRET:

            raise Fault(Code.INTERNAL, reason="gateway.settings", errors={ "setting": ["secret"] })

        if fail_over is not None and (type(fail_over) is not int or fail_over < 0):

            raise Fault(Code.INTERNAL, reason="gateway.settings", errors={ "setting": ["fail_over"] })

        self._secret  = secret
        self._fail    = fail_over
        self.charges: dict[str, Charge] = {}
        self.refunds: list[Refund] = []

    @override
    async def charge (
        self, amount: Money, reference: str, method: str, customer: Mapping[str, Any], returns: str,
    ) -> Charge:

        failed = self._fail is not None and amount.minor > self._fail
        status = "failed" if failed else ("captured" if method in ("card", "wallet") else "pending")
        raw    = { "customer": dict(customer) }
        made   = Charge(f"ch_{rand.hex(8)}", self.name, amount, status, reference, method, returns or None, raw)

        self.charges[made.id] = made

        return made

    @override
    async def fetch ( self, charge: str ) -> Charge:

        found = self.charges.get(charge)

        if found is None: raise Fault(Code.NOT_FOUND, reason="gateway.charge")

        return found

    @override
    async def refund ( self, charge: str, amount: Money ) -> Refund:

        found = await self.fetch(charge)

        if not found.paid(): raise Fault(Code.CONFLICT, reason="gateway.unpaid")

        if amount.currency != found.amount.currency or amount.minor > found.amount.minor:

            raise Fault(Code.VALIDATION, reason="gateway.refund")

        made = Refund(f"re_{rand.hex(8)}", charge, amount, "refunded")

        self.refunds.append(made)
        self.charges[charge] = Charge(
            found.id, found.provider, found.amount, "refunded", found.reference, found.method, found.redirect,
            found.raw,
        )

        return made

    @override
    def webhook ( self, body: bytes, headers: Mapping[str, str] ) -> Webhook:

        return self._hooked_(body, headers, self._secret)

    def sign ( self, body: bytes ) -> str:

        return crypto.sign(body, self._secret)
