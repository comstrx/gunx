from typing import override

from engine.adapter import Receipt
from engine.log import log
from engine.rand import rand
from .arch import Message
from .mailer import Mailer

class Log(Mailer):

    name = "log"

    def __init__ ( self ) -> None:

        self.outbox: list[Message] = []

    @override
    async def send ( self, message: Message ) -> Receipt:

        self.outbox.append(message)

        log.info("mail.logged", to=list(message.to), subject=message.subject)

        return Receipt(rand.hex(6), "sent", { "count": len(self.outbox) })

    def clear ( self ) -> int:

        count, self.outbox = len(self.outbox), []

        return count
