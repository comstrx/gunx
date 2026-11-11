from collections.abc import Mapping
from typing import Any, ClassVar

from engine.adapter import Adapter
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.json import json
from engine.number import Money
from .arch import Charge, Refund, Webhook

class Provider(Adapter):

    family       : ClassVar[str] = "gateway"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "charge", "refund", "webhook" })
    currencies   : frozenset[str] = frozenset()

    async def charge (
        self, amount: Money, reference: str, method: str, customer: Mapping[str, Any], returns: str,
    ) -> Charge:

        raise Fault(Code.INTERNAL, reason="gateway.abstract")

    async def fetch ( self, charge: str ) -> Charge:

        raise Fault(Code.INTERNAL, reason="gateway.abstract")

    async def refund ( self, charge: str, amount: Money ) -> Refund:

        raise Fault(Code.INTERNAL, reason="gateway.abstract")

    def webhook ( self, body: bytes, headers: Mapping[str, str] ) -> Webhook:

        raise Fault(Code.INTERNAL, reason="gateway.abstract")

    def verify ( self, body: bytes, signature: str, secret: str ) -> bool:

        raw: object = body

        if not isinstance(raw, bytes | bytearray) or type(signature) is not str or not signature: return False

        return crypto.verify(bytes(raw), signature, secret)

    def _hook_ ( self, provider: str, payload: object ) -> Webhook:

        if not isinstance(payload, dict): raise Fault(Code.BAD_REQUEST, reason="gateway.webhook")

        held  = { key: value for key, value in payload.items() if type(key) is str }
        parts = [held.get(name) for name in ("event", "charge", "status", "reference")]

        if any(part is not None and type(part) is not str for part in parts):

            raise Fault(Code.BAD_REQUEST, reason="gateway.webhook")

        try: return Webhook(provider, parts[0] or "", parts[1], parts[2], parts[3], held)
        except Fault as fault: raise Fault(Code.BAD_REQUEST, reason="gateway.webhook") from fault

    def _hooked_ ( self, body: bytes, headers: Mapping[str, str], secret: str ) -> Webhook:

        given = headers.get("x-signature") or headers.get("X-Signature") or ""

        if not self.verify(body, given, secret): raise Fault(Code.UNAUTHORIZED, reason="gateway.signature")

        try: payload = json.decode(body)
        except Fault as fault: raise Fault(Code.BAD_REQUEST, reason="gateway.webhook") from fault

        return self._hook_(self.name, payload)
