from typing import Any

from engine.adapter import Manager, Receipt
from engine.error import Code, Fault
from engine.parse import parse
from engine.validate import rules
from .arch import ADDRESS, CHANNELS, MAX_TEXT, Text
from .texter import Texter

class Sms:

    def __init__ ( self ) -> None:

        self._manager: Manager[Texter] = Manager("sms")
        self._sender: str | None = None
        self._sent = 0

    def setup ( self, texter: Texter | None = None, sender: str | None = None ) -> None:

        held: object = texter

        if held is not None and not isinstance(held, Texter): raise self._unset_("texter")
        if sender is not None and not (type(sender) is str and 0 < len(sender) <= ADDRESS and sender.isprintable()):

            raise self._unset_("sender")

        self._sender = sender

        if texter is not None: self._manager.use(texter, default=True)

    def use ( self, texter: Texter, default: bool = False ) -> Texter:

        return self._manager.use(texter, default)

    def ready ( self ) -> bool:

        return self._manager.ready()

    def compose ( self, to: str, body: str, channel: str = "sms" ) -> Text:

        spec = { "to": "required|phone", "body": f"required|max:{MAX_TEXT}" }

        rules.check({ "to": to, "body": body }, spec, "sms.text")

        if type(channel) is not str or channel not in CHANNELS: raise Fault(Code.VALIDATION, reason="sms.channel")

        return Text(parse.phone(to), body, channel, self._sender)

    async def send ( self, text: Text, texter: str | None = None ) -> Receipt:

        if not isinstance(text, Text):

            raise Fault(Code.VALIDATION, reason="sms.text", errors={ "text": ["is invalid"] })

        chosen = self._manager.get(texter)

        chosen.ensure(text.channel)

        receipt = await chosen.send(text)

        self._sent += 1

        return receipt

    async def text ( self, to: str, body: str, channel: str = "sms" ) -> Receipt:

        return await self.send(self.compose(to, body, channel))

    def stats ( self ) -> dict[str, int]:

        return { "sent": self._sent }

    def describe ( self ) -> dict[str, Any]:

        return { "sender": self._sender, **self._manager.describe(), **self.stats() }

    async def close ( self ) -> None:

        await self._manager.close()

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="sms.settings", errors={ "setting": [what] })
