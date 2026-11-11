from typing import override

from engine.adapter import Receipt
from engine.log import log
from engine.rand import rand
from .arch import Text
from .texter import Texter

class Log(Texter):

    name         = "log"
    capabilities = frozenset({ "sms", "whatsapp" })

    def __init__ ( self ) -> None:

        self.outbox: list[Text] = []

    @override
    async def send ( self, text: Text ) -> Receipt:

        self.outbox.append(text)

        log.info("sms.logged", to=text.to, channel=text.channel, chars=len(text.body))

        return Receipt(rand.hex(6), "sent")

    def clear ( self ) -> int:

        count, self.outbox = len(self.outbox), []

        return count
