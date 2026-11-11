from typing import ClassVar

from engine.adapter import Adapter, Receipt
from engine.error import Code, Fault
from .arch import Notice

class Pusher(Adapter):

    family       : ClassVar[str] = "notify"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "push" })

    async def push ( self, notice: Notice ) -> Receipt:

        raise Fault(Code.INTERNAL, reason="notify.abstract")
