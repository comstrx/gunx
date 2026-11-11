from collections.abc import Mapping
from typing import Any, override

from engine.error import Code, Fault
from engine.net import Remote
from engine.number import Money
from .arch import Charge, named, Refund, SECRET, Webhook
from .provider import Provider

class Http(Provider):

    name = "http"

    def __init__ ( self, remote: Remote, secret: str, currencies: frozenset[str] = frozenset() ) -> None:

        held: object = remote
        codes: object = currencies

        self.need(secret=secret)

        if not isinstance(held, Remote): raise self._unset_("remote")
        if type(secret) is not str or len(secret) < SECRET: raise self._unset_("secret")
        if not isinstance(codes, frozenset | set) or not all(type(code) is str for code in codes):

            raise self._unset_("currencies")

        self._remote    = remote
        self._secret    = secret
        self.currencies = frozenset(currencies)

    @override
    async def charge (
        self, amount: Money, reference: str, method: str, customer: Mapping[str, Any], returns: str,
    ) -> Charge:

        payload = { "amount": amount.dump(), "reference": reference, "method": method, "customer": dict(customer) }
        body    = await self.upstream(self._remote.post("/charges", data={ **payload, "return_url": returns }))

        return self._charge_(body, amount, reference, method)

    @override
    async def fetch ( self, charge: str ) -> Charge:

        if not named(charge): raise Fault(Code.VALIDATION, reason="gateway.charge")

        body = await self.upstream(self._remote.get(f"/charges/{self._remote.net().segment(charge)}"))

        if not isinstance(body, dict) or not isinstance(body.get("amount"), dict): raise self._malformed_()

        try: amount = Money(int(body["amount"]["minor"]), str(body["amount"]["currency"]))
        except (KeyError, TypeError, ValueError, Fault) as error: raise self._malformed_() from error

        return self._charge_(body, amount, str(body.get("reference", "")), str(body.get("method", "card")))

    @override
    async def refund ( self, charge: str, amount: Money ) -> Refund:

        if not named(charge): raise Fault(Code.VALIDATION, reason="gateway.charge")

        path = f"/charges/{self._remote.net().segment(charge)}/refunds"
        body = await self.upstream(self._remote.post(path, data={ "amount": amount.dump() }))

        if not isinstance(body, dict): raise self._malformed_()

        try: return Refund(str(body.get("id", "")), charge, amount, str(body.get("status", "refunded")), dict(body))
        except Fault as fault: raise self._malformed_() from fault

    @override
    def webhook ( self, body: bytes, headers: Mapping[str, str] ) -> Webhook:

        return self._hooked_(body, headers, self._secret)

    def _charge_ ( self, body: Any, amount: Money, reference: str, method: str ) -> Charge:

        if not isinstance(body, dict) or "id" not in body: raise self._malformed_()

        status   = str(body.get("status", "pending"))
        redirect = body.get("redirect")
        target   = redirect if redirect is None else str(redirect)

        try: return Charge(str(body["id"]), self.name, amount, status, reference, method, target, dict(body))
        except Fault as fault: raise self._malformed_() from fault

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="gateway.settings", errors={ "setting": [what] })
