from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from typing import Any

from engine.error import Code, Fault
from engine.log import log
from engine.thread import thread
from .arch import Handler, Message
from .driver import Driver
from .memory import Memory
import asyncio

class Broker:

    def __init__ ( self ) -> None:

        self._driver: Driver = Memory()
        self._queues: dict[str, tuple[str, ...]] = {}
        self._loops: dict[str, object] = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._published = 0
        self._handled   = 0

    def setup ( self, driver: Driver ) -> None:

        self._driver = driver

    def driver ( self ) -> Driver:

        return self._driver

    def ready ( self ) -> bool:

        return self._driver is not None

    async def declare ( self, queue: str, *topics: str ) -> None:

        await self._driver.declare(queue, topics)

        self._queues[queue] = topics

    def queues ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._queues))

    async def publish (
        self, topic: str, payload: Mapping[str, Any], headers: Mapping[str, str] | None = None,
    ) -> Message:

        message = Message.make(topic, payload, headers)

        await self._driver.publish(message)

        self._published += 1

        return message

    async def pull ( self, queue: str, limit: int = 1, wait: float = 1.0 ) -> list[Message]:

        return await self._driver.pull(queue, limit, wait)

    async def ack ( self, *messages: Message ) -> None:

        await self._driver.ack(*messages)

    async def nack ( self, message: Message, requeue: bool = True ) -> None:

        await self._driver.nack(message, requeue)

    async def handle ( self, message: Message, handler: Handler, tries: int = 5 ) -> bool:

        try: await handler(message)
        except Exception as error:

            fault = Fault.wrap(error)
            retry = (fault.retryable() or fault is not error) and message.attempts < tries

            log.warning("broker.failed", topic=message.topic, attempt=message.attempts, reason=fault.reason, redo=retry)

            await self._driver.nack(message, requeue=retry)

            return False

        await self._driver.ack(message)

        self._handled += 1

        return True

    async def consume (
        self, queue: str, handler: Handler, limit: int = 16, wait: float = 1.0, tries: int = 5,
    ) -> int:

        done = 0

        for message in await self.pull(queue, limit, wait):

            done += 1 if await self.handle(message, handler, tries) else 0

        return done

    def subscribe ( self, queue: str, handler: Handler, limit: int = 16, tries: int = 5 ) -> None:

        if self._loops.get(queue): return

        token = object()

        self._loops[queue] = token

        async def run () -> None:

            while self._loops.get(queue) is token:

                try: await self.consume(queue, handler, limit, 1.0, tries)
                except Exception as error:

                    log.warning("broker.loop", queue=queue, reason=Fault.wrap(error).reason)

                    await thread.sleep(1.0)

        task = thread.spawn(run(), f"broker:{queue}")

        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def on ( self, queue: str, limit: int = 16, tries: int = 5 ) -> Callable[[Handler], Handler]:

        def register ( handler: Handler ) -> Handler:

            self.subscribe(queue, handler, limit, tries)

            return handler

        return register

    async def stream ( self, queue: str, limit: int = 16, wait: float = 1.0 ) -> AsyncIterator[Message]:

        while self._loops.get(queue, True):

            for message in await self.pull(queue, limit, wait): yield message

    def unsubscribe ( self, queue: str ) -> None:

        self._loops[queue] = False

    async def drain ( self, grace: float = 5.0 ) -> int:

        tasks = [task for task in self._tasks if not task.done()]

        if tasks: await asyncio.wait(tasks, timeout=grace)

        return len(tasks)

    async def purge ( self, queue: str ) -> int:

        return await self._driver.purge(queue)

    async def delete ( self, queue: str ) -> None:

        await self._driver.delete(queue)

        self._queues.pop(queue, None)
        self._loops.pop(queue, None)

    async def depth ( self, queue: str ) -> int:

        return await self._driver.depth(queue)

    async def close ( self ) -> None:

        for queue in list(self._loops): self._loops[queue] = False

        await self.drain()
        await self._driver.close()

    def stats ( self ) -> dict[str, int]:

        return { "published": self._published, "handled": self._handled, "queues": len(self._queues) }

    def describe ( self ) -> dict[str, Any]:

        queues = { name: list(topics) for name, topics in sorted(self._queues.items()) }

        return { "driver": self._driver.name, "queues": queues, **self.stats() }

    def topics ( self, queue: str ) -> Sequence[str]:

        if queue not in self._queues: raise Fault(Code.INTERNAL, reason="broker.queue", errors={ "queue": [queue] })

        return self._queues[queue]
