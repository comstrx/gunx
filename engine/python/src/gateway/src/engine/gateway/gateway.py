from collections.abc import Mapping
from typing import Any

from engine.adapter import Manager
from engine.error import Code, Fault
from engine.log import log
from engine.number import Money
from engine.validate import rules
from .arch import Charge, HOOK, named, REFERENCE, Refund, RETURNS, Webhook
from .provider import Provider

class Gateway:

    def __init__ ( self ) -> None:

        self._manager: Manager[Provider] = Manager("gateway")
        self._charged = 0

    def use ( self, provider: Provider, default: bool = False ) -> Provider:

        return self._manager.use(provider, default)

    def provider ( self, name: str | None = None ) -> Provider:

        return self._manager.get(name)

    def ready ( self ) -> bool:

        return self._manager.ready()

    def names ( self ) -> tuple[str, ...]:

        return self._manager.names()

    async def charge (
        self, amount: Money, reference: str, method: str = "card", customer: Mapping[str, Any] | None = None,
        returns: str = "", provider: str | None = None,
    ) -> Charge:

        chosen = self._manager.get(provider)
        money: object = amount
        who: object = customer

        if not isinstance(money, Money) or money.minor <= 0: raise self._refuse_("amount")
        if not named(reference, REFERENCE): raise self._refuse_("charge")
        if who is not None and not isinstance(who, Mapping): raise self._refuse_("customer")
        if type(returns) is not str or len(returns) > RETURNS or not returns.isprintable():

            raise self._refuse_("returns")

        if chosen.currencies and amount.currency not in chosen.currencies:

            raise Fault(Code.VALIDATION, reason="gateway.currency", errors={ "currency": [amount.currency] })

        spec = { "reference": "required|max:64", "method": "required|in:card,wallet,cash,bank" }

        rules.check({ "reference": reference, "method": method }, spec, "gateway.charge")

        chosen.ensure("charge")

        made = await chosen.charge(amount, reference, method, dict(customer or {}), returns)

        self._charged += 1

        log.info("gateway.charged", provider=chosen.name, charge=made.id, status=made.status, amount=amount.text())

        return made

    async def fetch ( self, charge: str, provider: str | None = None ) -> Charge:

        if not named(charge): raise Fault(Code.VALIDATION, reason="gateway.charge")

        return await self._manager.get(provider).fetch(charge)

    async def refund ( self, charge: str, amount: Money, provider: str | None = None ) -> Refund:

        chosen = self._manager.get(provider)

        chosen.ensure("refund")

        money: object = amount

        if not named(charge): raise Fault(Code.VALIDATION, reason="gateway.charge")
        if not isinstance(money, Money) or money.minor <= 0: raise Fault(Code.VALIDATION, reason="gateway.amount")

        return await chosen.refund(charge, amount)

    def webhook ( self, body: bytes, headers: Mapping[str, str], provider: str | None = None ) -> Webhook:

        chosen = self._manager.get(provider)

        chosen.ensure("webhook")

        raw: object = body
        given: object = headers

        if not isinstance(raw, bytes | bytearray) or len(raw) > HOOK:

            raise Fault(Code.BAD_REQUEST, reason="gateway.webhook")
        if not isinstance(given, Mapping): raise Fault(Code.BAD_REQUEST, reason="gateway.webhook")

        return chosen.webhook(bytes(raw), headers)

    def stats ( self ) -> dict[str, int]:

        return { "charged": self._charged }

    def describe ( self ) -> dict[str, Any]:

        return { **self._manager.describe(), **self.stats() }

    async def close ( self ) -> None:

        await self._manager.close()

    @staticmethod
    def _refuse_ ( what: str ) -> Fault:

        return Fault(Code.VALIDATION, reason=f"gateway.{what}")
