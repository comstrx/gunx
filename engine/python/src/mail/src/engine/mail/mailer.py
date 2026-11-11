from typing import ClassVar

from engine.adapter import Adapter, Receipt
from engine.error import Code, Fault
from .arch import Message

class Mailer(Adapter):

    family       : ClassVar[str] = "mail"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "send" })

    async def send ( self, message: Message ) -> Receipt:

        raise Fault(Code.INTERNAL, reason="mail.abstract")
