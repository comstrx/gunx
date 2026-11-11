from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any, override

from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from .arch import Message, STALE, TOPIC
from .driver import Driver
from .link import Link
import aiormq, asyncio, contextlib, pamqp.commands

class Rabbit(Driver):

    name = "rabbitmq"

    def __init__ ( self, url: str, exchange: str = "engine", prefetch: int = 16, wait: float = 5.0 ) -> None:

        self._exchange = exchange
        self._prefetch = prefetch
        self._wait     = wait
        self._outlet   = Link(url, wait, self._route_, confirms=True)
        self._inlet    = Link(url, wait, self._feed_)
        self._consumers: dict[str, tuple[int, str, asyncio.Queue[Message]]] = {}
        self._open: dict[int, str] = {}
        self._mutex    = asyncio.Lock()
        self._order    = asyncio.Lock()

    async def outlet ( self ) -> aiormq.abc.AbstractChannel:

        return await self._outlet.channel()

    async def inlet ( self ) -> aiormq.abc.AbstractChannel:

        return await self._inlet.channel()

    @override
    async def ready ( self ) -> bool:

        try: await self._outlet.channel()
        except Fault: return False

        return True

    @override
    async def declare ( self, queue: str, topics: Sequence[str] ) -> None:

        async def bind ( side: aiormq.abc.AbstractChannel ) -> None:

            await side.queue_declare(queue, durable=True, arguments={ "x-queue-type": "quorum" }, timeout=self._wait)

            for topic in topics: await side.queue_bind(queue, self._exchange, topic, timeout=self._wait)

        await self._ask_("broker.declare", bind)

    @override
    async def publish ( self, message: Message ) -> None:

        if len(message.topic.encode()) > TOPIC:

            raise Fault(Code.INTERNAL, reason="broker.topic", errors={ "topic": [message.topic[:TOPIC]] })

        channel    = await self._outlet.channel()
        properties = aiormq.spec.Basic.Properties(
            message_id=message.id, delivery_mode=2, content_type="application/json", headers=dict(message.headers),
        )

        try:

            confirmation = await channel.basic_publish(  # type: ignore[call-arg]
                json.encode(message.payload), exchange=self._exchange, routing_key=message.topic, mandatory=True,
                properties=properties, timeout=self._wait, wait=False,
            )

        except aiormq.exceptions.DeliveryError as error:

            raise Fault(Code.INTERNAL, reason="broker.unroutable", errors={ "topic": [message.topic] }) from error

        except Link.failures as error: raise self._down_("broker.publish") from error

        if not isinstance(confirmation, pamqp.commands.Basic.Ack): raise self._down_("broker.confirm")

    @override
    async def pull ( self, queue: str, limit: int, wait: float ) -> list[Message]:

        epoch, inbox = await self._consumer_(queue)
        taken: list[Message] = []
        deadline     = asyncio.get_running_loop().time() + wait

        while len(taken) < limit:

            remaining = deadline - asyncio.get_running_loop().time()

            try: taken.append(await self._take_(inbox, remaining, bool(taken)))
            except (asyncio.QueueEmpty, TimeoutError): break

        return taken if self._inlet.live(epoch) is not None else []

    @override
    async def ack ( self, *messages: Message ) -> None:

        async with self._order:

            held = [found for found in map(self._held_, messages) if found is not None]

            if held: await self._settle_(held[0][0], { tag for _, tag in held }, "broker.ack")

        if len(held) < len(messages): raise Fault(Code.CONFLICT, reason=STALE)

    @override
    async def nack ( self, message: Message, requeue: bool = True ) -> None:

        async with self._order:

            held = self._held_(message)

            if held is None and requeue: return
            if held is None: raise Fault(Code.CONFLICT, reason=STALE)

            del self._open[held[1]]

            try: await held[0].basic_nack(held[1], requeue=requeue)
            except Link.failures as error:

                if not requeue: raise self._down_("broker.nack") from error

    @override
    async def purge ( self, queue: str ) -> int:

        async def clear ( side: aiormq.abc.AbstractChannel ) -> int:

            try: found = await side.queue_purge(queue, timeout=self._wait)
            except aiormq.exceptions.ChannelNotFoundEntity: return 0

            return int(getattr(found, "message_count", 0) or 0)

        return await self._ask_("broker.purge", clear) + await self._shed_(queue)

    @override
    async def delete ( self, queue: str ) -> None:

        held    = self._consumers.pop(queue, None)
        channel = None if held is None else self._inlet.live(held[0])

        if held is not None and channel is not None:

            with contextlib.suppress(*Link.failures): await channel.basic_cancel(held[1], timeout=self._wait)

        await self._ask_("broker.delete", lambda side: side.queue_delete(queue, timeout=self._wait))

        self._open = { tag: owner for tag, owner in self._open.items() if owner != queue }

    @override
    async def depth ( self, queue: str ) -> int:

        async def count ( side: aiormq.abc.AbstractChannel ) -> int:

            try: found = await side.queue_declare(queue, passive=True, timeout=self._wait)
            except aiormq.exceptions.ChannelNotFoundEntity: return 0

            return int(getattr(found, "message_count", 0) or 0)

        held = self._consumers.get(queue)
        kept = held[2].qsize() if held is not None and self._inlet.live(held[0]) is not None else 0

        return await self._ask_("broker.depth", count) + kept

    @override
    async def close ( self ) -> None:

        self._consumers = {}
        self._open      = {}

        await self._inlet.close()
        await self._outlet.close()

    def message ( self, delivered: Any, queue: str, epoch: int = 0 ) -> Message | None:

        header = delivered.header.properties
        raw: Mapping[str, Any] = header.headers or {}

        try: payload = json.decode(delivered.body) if delivered.body else {}
        except Fault: return None

        if not isinstance(payload, dict): return None

        seen     = max(self._count_(raw, "x-delivery-count"), self._count_(raw, "x-acquired-count"))
        attempts = max(seen + 1, 2 if delivered.redelivered else 1)
        headers  = { str(key): str(value) for key, value in raw.items() if not str(key).startswith("x-") }
        topic    = str(delivered.delivery.routing_key)
        tag      = (epoch, int(delivered.delivery.delivery_tag))

        return Message(str(header.message_id or ""), topic, payload, headers, attempts, tag, queue)

    async def _route_ ( self, channel: aiormq.abc.AbstractChannel ) -> None:

        await channel.exchange_declare(self._exchange, exchange_type="topic", durable=True, timeout=self._wait)

    async def _feed_ ( self, channel: aiormq.abc.AbstractChannel ) -> None:

        self._open = {}

        await channel.basic_qos(prefetch_count=self._prefetch, timeout=self._wait)

        channel.on_consumer_cancel_callbacks.add(self._cancelled_)

    async def _ask_ [T] ( self, reason: str, call: Callable[[aiormq.abc.AbstractChannel], Awaitable[T]] ) -> T:

        side = await self._outlet.side()

        try: return await call(side)
        except Link.failures as error: raise self._down_(reason) from error
        finally:

            if not side.is_closed:

                with contextlib.suppress(*Link.failures): await side.close()

    async def _consumer_ ( self, queue: str ) -> tuple[int, asyncio.Queue[Message]]:

        kept = self._consumers.get(queue)

        if kept is not None and self._inlet.live(kept[0]) is not None: return kept[0], kept[2]

        async with self._mutex:

            channel = await self._inlet.channel()
            epoch   = self._inlet.epoch()
            held    = self._consumers.get(queue)

            if held is not None and held[0] == epoch: return epoch, held[2]

            inbox: asyncio.Queue[Message] = asyncio.Queue()

            async def receive ( delivered: Any ) -> None:

                message = self.message(delivered, queue, epoch)

                if self._inlet.live(epoch) is None: return

                self._open[int(delivered.delivery.delivery_tag)] = queue

                if message is None: await self._refuse_(channel, delivered, queue)
                else: inbox.put_nowait(message)

            try: consumed = await channel.basic_consume(queue, receive, no_ack=False, timeout=self._wait)
            except aiormq.exceptions.ChannelNotFoundEntity as error:

                raise Fault(Code.INTERNAL, reason="broker.queue", errors={ "queue": [queue] }) from error

            except Link.failures as error: raise self._down_("broker.consume") from error

            if self._inlet.live(epoch) is None: raise self._down_("broker.consume")

            self._consumers[queue] = (epoch, str(consumed.consumer_tag), inbox)

            log.debug("broker.consuming", queue=queue)

            return epoch, inbox

    async def _cancelled_ ( self, frame: Any ) -> None:

        for queue, held in list(self._consumers.items()):

            if held[1] != frame.consumer_tag: continue

            del self._consumers[queue]

            log.warning("broker.cancelled", queue=queue)

            while not held[2].empty(): await self.nack(held[2].get_nowait(), requeue=True)

    async def _refuse_ ( self, channel: aiormq.abc.AbstractChannel, delivered: Any, queue: str ) -> None:

        tag = int(delivered.delivery.delivery_tag)

        log.warning("broker.malformed", queue=queue, id=str(delivered.header.properties.message_id or ""))

        async with self._order:

            self._open.pop(tag, None)

            with contextlib.suppress(*Link.failures): await channel.basic_nack(tag, requeue=False)

    async def _shed_ ( self, queue: str ) -> int:

        held = self._consumers.get(queue)
        kept = [] if held is None else [held[2].get_nowait() for _ in range(held[2].qsize())]

        async with self._order:

            live = [found for found in map(self._held_, kept) if found is not None]

            if live: await self._settle_(live[0][0], { tag for _, tag in live }, "broker.purge")

        return len(live)

    async def _settle_ ( self, channel: aiormq.abc.AbstractChannel, tags: set[int], reason: str ) -> None:

        top  = self._lead_(tags)
        rest = sorted(tag for tag in tags if tag > top)

        for tag in tags: del self._open[tag]

        try:

            if top: await channel.basic_ack(top, multiple=True, wait=not rest)

            for tag in rest: await channel.basic_ack(tag, wait=tag == rest[-1])

        except Link.failures as error: raise self._down_(reason) from error

    async def _take_ ( self, inbox: asyncio.Queue[Message], remaining: float, eager: bool ) -> Message:

        if eager or remaining <= 0 or not inbox.empty(): return inbox.get_nowait()

        return await asyncio.wait_for(inbox.get(), remaining)

    def _held_ ( self, message: Message ) -> tuple[aiormq.abc.AbstractChannel, int] | None:

        match message.tag:

            case (int(epoch), int(tag)): channel = self._inlet.live(epoch)
            case _: return None

        return None if channel is None or tag not in self._open else (channel, tag)

    def _lead_ ( self, tags: set[int] ) -> int:

        top, run = 0, 0

        for tag in self._open:

            if tag not in tags: break

            top, run = tag, run + 1

        return top if run > 1 else 0

    def _down_ ( self, reason: str ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason=reason, unknown=True)

    @staticmethod
    def _count_ ( headers: Mapping[str, Any], name: str ) -> int:

        found = headers.get(name)

        return found if isinstance(found, int) and found > 0 else 0
