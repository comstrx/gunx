from collections.abc import Mapping
from typing import Any

from engine.date import date
from engine.error import Code, Fault
from engine.log import log
from engine.rand import rand
from engine.thread import thread
from .arch import BACKOFF, Handler, LEASE, Record, TRIES
from .column import Column
from .database import Database
from .index import Index
from .sql import Sql
from .table import Table
import asyncio

class Outbox:

    def __init__ (
        self, database: Database, interval: float = 0.5, batch: int = 50, table: Table | None = None,
    ) -> None:

        self._database  = database
        self._handlers: dict[str, Handler] = {}
        self._interval  = interval
        self._batch     = batch
        self._table     = table
        self._running   = False
        self._delivered = 0
        self._failed    = 0
        self._task: Any = None

    @staticmethod
    def blueprint ( name: str ) -> Table:

        return Table.define(
            name,
            Column.id(),
            Column.text("kind"),
            Column.jsonb("payload"),
            Column.timestamp("available_at", now=True),
            Column.integer("attempts", default="0"),
            Column.timestamp("locked_until", nullable=True),
            Column.timestamp("done_at", nullable=True),
            Column.text("failure", nullable=True),
            indexes=[Index(("available_at",), where="done_at IS NULL")],
        )

    def setup ( self, table: Table, interval: float | None = None, batch: int | None = None ) -> Table:

        self._table = table

        if interval is not None: self._interval = interval
        if batch is not None: self._batch = batch

        return table

    def table ( self ) -> Table:

        if self._table is None: raise Fault(Code.INTERNAL, "The outbox has no table", "outbox.setup")

        return self._table

    def kind ( self, name: str, handler: Handler ) -> None:

        self._handlers[name] = handler

    def kinds ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._handlers))

    async def put ( self, kind: str, payload: Mapping[str, Any], delay: float = 0.0 ) -> str:

        if kind not in self._handlers: raise Fault(Code.INTERNAL, reason="outbox.kind", errors={ "kind": [kind] })

        id_ = str(rand.uuid7())
        sql = Sql.insert(self.table().name).values(
            id=id_, kind=kind, payload=dict(payload), available_at=date.after(delay), attempts=0,
        )

        await self._database.execute(sql)

        return id_

    async def claim ( self, limit: int | None = None ) -> list[Record]:

        name = self.table().name

        async with self._database.transaction() as session:

            now  = date.now()
            pick = Sql.select(name, "id", "kind", "payload", "attempts").where("done_at", "IS", None)

            pick.where("available_at", "<=", now).raw_where("locked_until IS NULL OR locked_until < ?", now)
            pick.order("available_at").limit(limit or self._batch).lock()

            rows = await session.fetch(*self._pair_(pick))

            if not rows: return []

            lease = Sql.update(name).set(locked_until=date.after(LEASE)).raw_set("attempts", "attempts + 1")

            lease.where("id", "IN", [row["id"] for row in rows])

            await session.execute(*self._pair_(lease))

        return [{ **row, "attempts": int(row["attempts"]) + 1 } for row in rows]

    async def deliver ( self, row: Record ) -> bool:

        handler = self._handlers.get(str(row["kind"]))

        try: await self._handle_(handler, row["payload"])
        except Exception as error:

            self._failed += 1

            await self._retry_(row, error)

            return False

        done = Sql.update(self.table().name).set(done_at=date.now(), locked_until=None, failure=None)

        await self._database.execute(done.equals(id=row["id"]))

        self._delivered += 1

        return True

    async def relay ( self, limit: int | None = None ) -> int:

        rows = await self.claim(limit)
        done = 0

        for row in rows: done += 1 if await self.deliver(row) else 0

        return done

    async def pending ( self ) -> int:

        return int(await self._database.value(Sql.select(self.table().name).where("done_at", "IS", None).count()) or 0)

    async def dead ( self ) -> list[Record]:

        sql = Sql.select(self.table().name, "id", "kind", "attempts", "failure").where("done_at", "IS", None)

        return await self._database.fetch(sql.where("attempts", ">=", TRIES))

    async def purge ( self, older_than: float = 7 * 86400 ) -> int:

        sql = Sql.delete(self.table().name).where("done_at", "IS NOT", None)

        return await self._database.execute(sql.where("done_at", "<", date.before(older_than)))

    def start ( self ) -> None:

        if self._running: return

        self.table()

        self._running = True
        self._task    = thread.spawn(self._loop_(), "outbox")

    async def stop ( self ) -> None:

        self._running = False

        if self._task is not None:

            await asyncio.wait([self._task], timeout=5)

            self._task = None

    def running ( self ) -> bool:

        return self._running

    def stats ( self ) -> dict[str, int]:

        return { "delivered": self._delivered, "failed": self._failed, "kinds": len(self._handlers) }

    def describe ( self ) -> dict[str, Any]:

        table = self._table.name if self._table is not None else None

        facts = { "table": table, "interval": self._interval, "batch": self._batch, "running": self._running }

        return { **facts, **self.stats() }

    async def _handle_ ( self, handler: Handler | None, payload: Mapping[str, Any] ) -> None:

        if handler is None: raise Fault(Code.INTERNAL, reason="outbox.handler")

        await handler(payload)

    async def _loop_ ( self ) -> None:

        while self._running:

            try: count = await self.relay()
            except Fault as fault:

                log.warning("outbox.relay", reason=fault.reason)

                count = 0

            await thread.sleep(0.01 if count else self._interval)

    async def _retry_ ( self, row: Record, error: BaseException ) -> None:

        attempts = int(row["attempts"])
        wait     = min(3600.0, BACKOFF ** attempts)
        text     = type(error).__name__ if not isinstance(error, Fault) else f"{error.code.value}:{error.reason}"

        log.warning("outbox.failed", kind=row["kind"], attempts=attempts, wait=wait, error=text)

        sql = Sql.update(self.table().name).set(locked_until=None, available_at=date.after(wait), failure=text[:200])

        await self._database.execute(sql.equals(id=row["id"]))

    def _pair_ ( self, sql: Sql ) -> tuple[Any, ...]:

        text, params = self._database.pair(sql)

        return (text, *params)
