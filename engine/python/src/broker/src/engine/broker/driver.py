from collections.abc import Sequence
from typing import ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import Message

class Driver(Adapter):

    family       : ClassVar[str] = "broker"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "publish", "consume", "confirm" })

    async def declare ( self, queue: str, topics: Sequence[str] ) -> None:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def publish ( self, message: Message ) -> None:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def pull ( self, queue: str, limit: int, wait: float ) -> list[Message]:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def ack ( self, *messages: Message ) -> None:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def nack ( self, message: Message, requeue: bool = True ) -> None:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def purge ( self, queue: str ) -> int:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def delete ( self, queue: str ) -> None:

        raise Fault(Code.INTERNAL, reason="broker.abstract")

    async def depth ( self, queue: str ) -> int:

        raise Fault(Code.INTERNAL, reason="broker.abstract")
