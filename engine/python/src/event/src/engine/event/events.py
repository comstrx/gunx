from collections.abc import Mapping
from typing import Any

from engine.broker import Broker, Message, broker as shared
from engine.context import context
from engine.database import Column, Database, Outbox, Sql, Table
from engine.date import date
from engine.error import Code, Fault
from engine.string import string
from engine.log import log
from engine.queue import Queue
from .arch import KIND, Listener, LONGEST, MOST, named, TASK
from .event import Event
from .subscriber import Subscriber
import asyncio

class Events:

    def __init__ ( self ) -> None:

        self._broker: Broker = shared
        self._listeners: list[tuple[str, Listener]] = []
        self._outbox: Outbox | None = None
        self._database: Database | None = None
        self._table: Table | None = None
        self._source   = "engine"
        self._inbox    = "events.engine"
        self._dispatched = 0
        self._handled    = 0
        self._skipped    = 0
        self._started    = False
        self._queue: Queue | None = None
        self._queued: dict[int, Listener] = {}
        self._waiters: list[tuple[str, asyncio.Future[Event]]] = []

    def setup ( self, source: str, broker: Broker | None = None, inbox: str | None = None ) -> None:

        held: object = broker

        if not named(source) or (inbox is not None and not named(inbox)): raise self._unset_("source")
        if held is not None and not isinstance(held, Broker): raise self._unset_("broker")

        self._source   = source
        self._broker   = broker or shared
        self._inbox    = inbox or f"events.{source}"
        self._outbox   = None
        self._database = None
        self._table    = None
        self._started  = False

    @staticmethod
    def blueprint ( name: str ) -> Table:

        return Table.define(
            name, Column("id", "text", primary=True), Column.timestamp("handled_at", now=True), timestamps=False,
        )

    def durable ( self, outbox: Outbox, database: Database | None = None, inbox: Table | None = None ) -> None:

        async def deliver ( payload: Mapping[str, Any] ) -> None: await self._publish_(Event.load(payload))

        outbox.kind(KIND, deliver)

        self._outbox   = outbox
        self._database = database
        self._table    = inbox

    def listen ( self, pattern: str, listener: Listener, once: bool = False, queued: bool = False ) -> int:

        if not named(pattern) or not callable(listener): raise self._unset_("listener")
        if len(self._listeners) >= MOST: raise self._unset_("listeners")

        if queued: listener = self._deferred_(listener)
        if once: listener = self._single_(listener)

        self._listeners.append((pattern, listener))

        return len(self._listeners)

    def subscribe ( self, subscriber: Subscriber ) -> int:

        for pattern, handler in subscriber.handlers(): self.listen(pattern, handler)

        return len(self._listeners)

    def forget ( self, pattern: str ) -> int:

        before = len(self._listeners)

        self._listeners = [(kept, listener) for kept, listener in self._listeners if kept != pattern]

        return before - len(self._listeners)

    def queue ( self, queue: Queue ) -> None:

        self._queue = queue

        async def deliver ( index: int, event: Mapping[str, Any] ) -> None:

            listener = self._queued.get(index)

            if listener is None: raise Fault(Code.INTERNAL, reason="event.queued", errors={ "listener": [str(index)] })

            await listener(Event.load(event))

        queue.task(TASK)(deliver)

    async def wait ( self, pattern: str, timeout: float = 5.0 ) -> Event:

        pace: object = timeout

        if not named(pattern): raise self._unset_("pattern")
        if not isinstance(pace, int | float) or type(pace) is bool or not 0 < pace <= LONGEST:

            raise self._unset_("timeout")
        if len(self._waiters) >= MOST: raise self._unset_("waiters")

        future: asyncio.Future[Event] = asyncio.get_running_loop().create_future()

        self._waiters.append((pattern, future))

        try:

            async with asyncio.timeout(timeout): return await future

        except TimeoutError as error:

            self._waiters = [(kept, held) for kept, held in self._waiters if held is not future]

            raise Fault(Code.TIMEOUT, reason="event.wait", errors={ "pattern": [pattern] }) from error

    def listeners ( self, name: str ) -> list[Listener]:

        return [listener for pattern, listener in self._listeners if string.glob(name, pattern)]

    def patterns ( self ) -> tuple[str, ...]:

        return tuple(sorted({ pattern for pattern, _ in self._listeners }))

    def make ( self, name: str, **data: Any ) -> Event:

        actor  = context.actor()
        tenant = context.get("tenant")
        who    = str(actor["id"]) if isinstance(actor, Mapping) and "id" in actor else (str(actor) if actor else None)

        return Event(name=name, data=data, actor=who, tenant=str(tenant) if tenant else None, source=self._source)

    async def dispatch ( self, event: Event | str, **data: Any ) -> Event:

        given: object = event

        if not isinstance(given, Event) and not named(given): raise self._unnamed_(str(given))

        made = event if isinstance(event, Event) else self.make(event, **data)

        if "." not in made.name or not named(made.name): raise self._unnamed_(made.name)

        await self._local_(made)

        if self._outbox is not None and self._database is not None and self._database.current() is not None:

            await self._outbox.put(KIND, made.dump())

        elif self._broker.queues() or self._started: await self._publish_(made)

        self._dispatched += 1

        return made

    async def declare ( self, *patterns: str ) -> None:

        await self._broker.declare(self._inbox, *(patterns or self.patterns() or ("#",)))

    async def handle ( self, message: Message ) -> None:

        event = Event.load(message.payload)

        if event.source == self._source and not message.headers.get("replay"): return

        if self._database is None or self._table is None or not self._database.ready():

            await self._local_(event, remote=True)

            return

        async with self._database.transaction():

            if await self.once(event.id): await self._local_(event, remote=True)
            else: self._skipped += 1

    async def once ( self, id_: str ) -> bool:

        if self._database is None or self._table is None or not self._database.ready(): return True

        sql = Sql.insert(self._table.name).values(id=id_, handled_at=date.now()).conflict("id")

        return await self._database.execute(sql) == 1

    def start ( self ) -> None:

        self._started = True

        self._broker.subscribe(self._inbox, self.handle)

    async def stop ( self ) -> None:

        self._started = False

        self._broker.unsubscribe(self._inbox)

        await self._broker.drain()

    async def consume ( self, limit: int = 16, wait: float = 1.0 ) -> int:

        return await self._broker.consume(self._inbox, self.handle, limit, wait)

    def stats ( self ) -> dict[str, int]:

        return {
            "dispatched" : self._dispatched,
            "handled"    : self._handled,
            "skipped"    : self._skipped,
            "listeners"  : len(self._listeners),
        }

    def describe ( self ) -> dict[str, Any]:

        table = self._table.name if self._table is not None else None

        facts = { "source": self._source, "inbox": self._inbox, "table": table, "patterns": list(self.patterns()) }

        return { **facts, **self.stats() }

    def clear ( self ) -> None:

        self._listeners = []
        self._queued    = {}
        self._waiters   = []

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="event.settings", errors={ "setting": [what] })

    @staticmethod
    def _unnamed_ ( name: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="event.name", errors={ "name": [name[:64]] })

    def _deferred_ ( self, listener: Listener ) -> Listener:

        index = len(self._queued) + 1

        self._queued[index] = listener

        async def push ( event: Event ) -> None:

            if self._queue is None: raise Fault(Code.INTERNAL, reason="event.queue")

            await self._queue.push(TASK, { "index": index, "event": event.dump() })

        return push

    def _single_ ( self, listener: Listener ) -> Listener:

        async def once ( event: Event ) -> None:

            self._listeners = [(kept, held) for kept, held in self._listeners if held is not once]

            await listener(event)

        return once

    def _wake_ ( self, event: Event ) -> None:

        kept: list[tuple[str, asyncio.Future[Event]]] = []

        for pattern, future in self._waiters:

            if string.glob(event.name, pattern) and not future.done(): future.set_result(event)
            elif not future.done(): kept.append((pattern, future))

        self._waiters = kept

    async def _local_ ( self, event: Event, remote: bool = False ) -> None:

        self._wake_(event)

        for listener in self.listeners(event.name):

            try: await listener(event)
            except Exception as error:

                log.error("event.listener", name=event.name, reason=Fault.wrap(error).reason, remote=remote)

                if remote: raise

                continue

            self._handled += 1

    async def _publish_ ( self, event: Event ) -> None:

        await self._broker.publish(event.name, event.dump(), { "source": event.source })

events = Events()
