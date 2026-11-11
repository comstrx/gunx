from typing import ClassVar

from engine.adapter import Adapter, Receipt
from engine.error import Code, Fault
from .arch import Text

class Texter(Adapter):

    family       : ClassVar[str] = "sms"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "sms" })

    async def send ( self, text: Text ) -> Receipt:

        raise Fault(Code.INTERNAL, reason="sms.abstract")
