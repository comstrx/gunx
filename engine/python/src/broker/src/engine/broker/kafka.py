from collections.abc import Sequence
from typing import Any, TYPE_CHECKING, override

from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from .arch import Message, RESERVED, WILD
from .driver import Driver
import asyncio, re

if TYPE_CHECKING:

    from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
    from aiokafka.admin import AIOKafkaAdminClient

class Kafka(Driver):

    name         = "kafka"
    capabilities = frozenset({ "publish", "consume", "confirm", "replay" })

    def __init__ (
        self, servers: str | Sequence[str], group: str = "engine", client: str = "engine", partitions: int = 3,
        replication: int = 1, wait: float = 5.0, compression: str | None = None, **security: Any,
    ) -> None:

        listed = servers.split(",") if isinstance(servers, str) else list(servers)

        self._servers     = [server.split("://", 1)[-1].strip() for server in listed if server.strip()]
        self._group       = group
        self._client      = client
        self._partitions  = partitions
        self._replication = replication
        self._wait        = wait
        self._compression = compression
        self._security    = dict(security)
        self._producer: AIOKafkaProducer | None = None
        self._admin: AIOKafkaAdminClient | None = None
        self._consumers: dict[str, AIOKafkaConsumer] = {}
        self._topics: dict[str, list[str]] = {}
        self._failures: tuple[type[BaseException], ...] = (OSError, TimeoutError)
        self._lock = asyncio.Lock()

    async def producer ( self ) -> AIOKafkaProducer:

        async with self._lock:

            if self._producer is not None: return self._producer

            from aiokafka import AIOKafkaProducer
            from aiokafka.errors import KafkaError

            self._failures = (KafkaError, OSError, TimeoutError)

            made = AIOKafkaProducer(
                bootstrap_servers=self._servers, client_id=self._client, acks="all", enable_idempotence=True,
                compression_type=self._compression, request_timeout_ms=int(self._wait * 1000), **self._security,
            )

            try: await asyncio.wait_for(made.start(), self._wait)
            except self._failures as error:

                await made.stop()

                raise Fault(Code.UNAVAILABLE, reason="broker.connect", unknown=True) from error

            self._producer = made

            return made

    @override
    async def ready ( self ) -> bool:

        try: await self.producer()
        except Fault: return False

        return True

    @override
    async def declare ( self, queue: str, topics: Sequence[str] ) -> None:

        literal = [topic for topic in topics if not WILD & set(topic)]

        self._topics[queue] = list(topics)

        if not literal: return

        from aiokafka.admin import NewTopic
        from aiokafka.errors import TopicAlreadyExistsError

        admin = await self._admin_()
        fresh = [NewTopic(topic, self._partitions, self._replication) for topic in literal]

        try: await admin.create_topics(fresh, validate_only=False)
        except TopicAlreadyExistsError: pass
        except self._failures as error: raise self._down_("broker.declare") from error

    @override
    async def publish ( self, message: Message ) -> None:

        producer = await self.producer()
        headers  = [(key, str(value).encode()) for key, value in message.headers.items() if key not in RESERVED]

        headers += [("id", message.id.encode()), ("attempts", str(message.attempts).encode())]

        try: await producer.send_and_wait(message.topic, value=json.encode(message.payload), headers=headers)
        except self._failures as error: raise self._down_("broker.publish") from error

    @override
    async def pull ( self, queue: str, limit: int, wait: float ) -> list[Message]:

        consumer = await self._consumer_(queue)

        try: batches = await consumer.getmany(timeout_ms=int(wait * 1000), max_records=limit)
        except self._failures as error: raise self._down_("broker.consume") from error

        taken: list[Message] = []

        for records in batches.values():

            for record in records:

                try: taken.append(self.message(record, queue))
                except Fault: log.warning("broker.malformed", queue=queue, topic=record.topic, offset=record.offset)

        return taken

    @override
    async def ack ( self, *messages: Message ) -> None:

        try:

            for queue, offsets in self.marks(messages).items():

                if queue in self._consumers: await self._consumers[queue].commit(offsets)

        except self._failures as error: raise self._down_("broker.ack") from error

    @override
    async def nack ( self, message: Message, requeue: bool = True ) -> None:

        if requeue:

            again = Message(
                message.id, message.topic, message.payload, message.headers, message.attempts + 1, None, message.queue,
            )

            await self.publish(again)

        else: log.warning("broker.dropped", topic=message.topic, id=message.id, attempts=message.attempts)

        await self.ack(message)

    @override
    async def purge ( self, queue: str ) -> int:

        self.ensure("purge")

        return 0

    @override
    async def delete ( self, queue: str ) -> None:

        consumer = self._consumers.pop(queue, None)

        self._topics.pop(queue, None)

        if consumer is not None: await consumer.stop()

    @override
    async def depth ( self, queue: str ) -> int:

        consumer = await self._consumer_(queue)
        parts    = list(consumer.assignment())

        if not parts: return 0

        try:

            ends = await consumer.end_offsets(parts)
            lag  = 0

            for part in parts:

                done = await consumer.committed(part)
                lag += max(0, int(ends.get(part, 0)) - int(done or 0))

        except self._failures as error: raise self._down_("broker.depth") from error

        return lag

    @override
    async def close ( self ) -> None:

        consumers, self._consumers = list(self._consumers.values()), {}

        for consumer in consumers: await consumer.stop()

        producer, self._producer = self._producer, None
        admin, self._admin       = self._admin, None

        if producer is not None: await producer.stop()
        if admin is not None: await admin.close()

    def message ( self, record: Any, queue: str ) -> Message:

        pairs = record.headers or ()
        raw: dict[str, str] = { str(key): bytes(value).decode("utf-8", "replace") for key, value in pairs }
        headers  = { key: value for key, value in raw.items() if key not in RESERVED }
        counted  = raw.get("attempts", "")
        attempts = int(counted) if counted.isdecimal() else 1
        id_      = raw.get("id") or f"{record.topic}:{record.partition}:{record.offset}"
        payload  = json.decode(record.value) if record.value else {}

        if not isinstance(payload, dict): raise Fault(Code.VALIDATION, reason="broker.malformed")

        from aiokafka import TopicPartition

        tag = (TopicPartition(record.topic, record.partition), int(record.offset))

        return Message(id_, str(record.topic), payload, headers, attempts, tag, queue)

    @staticmethod
    def pattern ( topics: Sequence[str] ) -> str:

        parts = []

        for topic in topics:

            escaped = re.escape(topic).replace(r"\*", "[^.]+").replace(r"\#", ".*")

            parts.append(f"(?:{escaped})")

        return "^(?:" + "|".join(parts) + ")$"

    @staticmethod
    def marks ( messages: Sequence[Message] ) -> dict[str, dict[Any, int]]:

        found: dict[str, dict[Any, int]] = {}

        for message in messages:

            if message.tag is None: continue

            partition, offset = message.tag
            held              = found.setdefault(message.queue, {})
            held[partition]   = max(held.get(partition, 0), offset + 1)

        return found

    async def _consumer_ ( self, queue: str ) -> AIOKafkaConsumer:

        found = self._consumers.get(queue)

        if found is not None: return found

        topics = self._topics.get(queue)

        if topics is None: raise Fault(Code.INTERNAL, reason="broker.queue", errors={ "queue": [queue] })

        from aiokafka import AIOKafkaConsumer
        from aiokafka.errors import KafkaError

        self._failures = (KafkaError, OSError, TimeoutError)

        made = AIOKafkaConsumer(
            bootstrap_servers=self._servers, group_id=f"{self._group}.{queue}", client_id=self._client,
            enable_auto_commit=False, auto_offset_reset="earliest", isolation_level="read_committed",
            request_timeout_ms=int(self._wait * 1000), **self._security,
        )

        if any(WILD & set(topic) for topic in topics): made.subscribe(pattern=self.pattern(topics))
        else: made.subscribe(topics=list(topics))

        try: await asyncio.wait_for(made.start(), self._wait)
        except self._failures as error:

            await made.stop()

            raise Fault(Code.UNAVAILABLE, reason="broker.connect", unknown=True) from error

        self._consumers[queue] = made

        log.debug("broker.consuming", queue=queue, driver=self.name)

        return made

    async def _admin_ ( self ) -> AIOKafkaAdminClient:

        if self._admin is not None: return self._admin

        from aiokafka.admin import AIOKafkaAdminClient
        from aiokafka.errors import KafkaError

        self._failures = (KafkaError, OSError, TimeoutError)

        made = AIOKafkaAdminClient(
            bootstrap_servers=self._servers, client_id=self._client, request_timeout_ms=int(self._wait * 1000),
            **self._security,
        )

        try: await asyncio.wait_for(made.start(), self._wait)
        except self._failures as error:

            await made.close()

            raise Fault(Code.UNAVAILABLE, reason="broker.connect", unknown=True) from error

        self._admin = made

        return made

    def _down_ ( self, reason: str ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason=reason, unknown=True)

    @override
    def describe ( self ) -> dict[str, object]:

        facts = { "servers": len(self._servers), "group": self._group, "queues": sorted(self._topics) }

        return { **super().describe(), **facts }
