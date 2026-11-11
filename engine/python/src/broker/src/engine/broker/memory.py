from collections.abc import Sequence
from typing import override

from engine.error import Code, Fault
from engine.string import string
from .arch import Message
from .driver import Driver
import asyncio

class Memory(Driver):

    name = "memory"

    def __init__ ( self ) -> None:

        self._queues: dict[str, asyncio.Queue[Message]] = {}
        self._topics: dict[str, list[str]] = {}
        self._inflight: dict[tuple[str, str], Message] = {}
        self._published = 0

    @override
    async def declare ( self, queue: str, topics: Sequence[str] ) -> None:

        self._queues.setdefault(queue, asyncio.Queue())
        self._topics[queue] = list(topics)

    @override
    async def publish ( self, message: Message ) -> None:

        matched = False

        for queue, topics in self._topics.items():

            if any(string.glob(message.topic, pattern.replace("#", "*")) for pattern in topics):

                copy = Message(message.id, message.topic, message.payload, message.headers, 1, None, queue)

                await self._queues[queue].put(copy)

                matched = True

        if not matched: raise Fault(Code.INTERNAL, reason="broker.unroutable", errors={ "topic": [message.topic] })

        self._published += 1

    @override
    async def pull ( self, queue: str, limit: int, wait: float ) -> list[Message]:

        found = self._queues.get(queue)

        if found is None: raise Fault(Code.INTERNAL, reason="broker.queue", errors={ "queue": [queue] })

        taken: list[Message] = []
        deadline = asyncio.get_running_loop().time() + wait

        while len(taken) < limit:

            remaining = deadline - asyncio.get_running_loop().time()

            try: message = await self._take_(found, remaining, bool(taken))
            except (asyncio.QueueEmpty, TimeoutError): break

            self._inflight[queue, message.id] = message

            taken.append(message)

        return taken

    @override
    async def ack ( self, *messages: Message ) -> None:

        for message in messages: self._inflight.pop((message.queue, message.id), None)

    @override
    async def nack ( self, message: Message, requeue: bool = True ) -> None:

        self._inflight.pop((message.queue, message.id), None)

        if requeue and message.queue in self._queues:

            again = Message(
                message.id, message.topic, message.payload, message.headers, message.attempts + 1, None, message.queue,
            )

            await self._queues[message.queue].put(again)

    @override
    async def purge ( self, queue: str ) -> int:

        found = self._queues.get(queue)

        if found is None: return 0

        count = found.qsize()

        while not found.empty(): found.get_nowait()

        return count

    @override
    async def delete ( self, queue: str ) -> None:

        self._queues.pop(queue, None)
        self._topics.pop(queue, None)

    @override
    async def depth ( self, queue: str ) -> int:

        found = self._queues.get(queue)

        return found.qsize() if found else 0

    def inflight ( self ) -> int:

        return len(self._inflight)

    async def _take_ ( self, found: asyncio.Queue[Message], remaining: float, eager: bool ) -> Message:

        if eager or remaining <= 0: return found.get_nowait()

        return await asyncio.wait_for(found.get(), remaining)
