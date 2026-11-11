from typing import override

from engine.adapter import Receipt
from engine.log import log
from engine.rand import rand
from .arch import Notice
from .pusher import Pusher

class Log(Pusher):

    name = "log"

    def __init__ ( self ) -> None:

        self.outbox: list[Notice] = []

    @override
    async def push ( self, notice: Notice ) -> Receipt:

        self.outbox.append(notice)

        log.info("notify.logged", devices=len(notice.tokens), title=notice.title)

        return Receipt(rand.hex(6), "sent", { "delivered": len(notice.tokens) })

    def clear ( self ) -> int:

        count, self.outbox = len(self.outbox), []

        return count
