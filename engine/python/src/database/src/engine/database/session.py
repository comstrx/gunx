from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from typing import Any

from engine.error import Code, Fault
from .arch import Isolation, Record
from .driver import Driver
import asyncio

class Session:

    __slots__ = ("_closed", "_connection", "_depth", "_driver", "_owner", "_scoped")

    def __init__ ( self, driver: Driver, connection: Any ) -> None:

        self._closed     = False
        self._owner      = asyncio.current_task()
        self._driver     = driver
        self._connection = connection
        self._depth      = 0
        self._scoped: dict[str, str] = {}

    async def execute ( self, sql: str, *args: Any, timeout: float | None = None ) -> int:

        self._ensure_()

        try: return await self._driver.execute(self._connection, sql, self._driver.binds(args), timeout)
        except self._driver.failures as error: raise self._driver.translate(error) from error

    async def fetch ( self, sql: str, *args: Any, timeout: float | None = None ) -> list[Record]:

        self._ensure_()

        try: return await self._driver.fetch(self._connection, sql, self._driver.binds(args), timeout)
        except self._driver.failures as error: raise self._driver.translate(error) from error

    async def one ( self, sql: str, *args: Any, timeout: float | None = None ) -> Record | None:

        rows = await self.fetch(sql, *args, timeout=timeout)

        return rows[0] if rows else None

    async def value ( self, sql: str, *args: Any, timeout: float | None = None ) -> Any:

        row = await self.one(sql, *args, timeout=timeout)

        return next(iter(row.values())) if row else None

    async def many ( self, sql: str, rows: Sequence[Sequence[Any]], timeout: float | None = None ) -> int:

        self._ensure_()

        if not rows: return 0

        bound = [self._driver.binds(row) for row in rows]

        try: return await self._driver.many(self._connection, sql, bound, timeout)
        except self._driver.failures as error: raise self._driver.translate(error) from error

    async def copy ( self, table: str, columns: Sequence[str], rows: Sequence[Sequence[Any]] ) -> int:

        self._ensure_()

        if not rows: return 0

        try: return await self._driver.copy(self._connection, table, columns, rows)
        except self._driver.failures as error: raise self._driver.translate(error) from error

    async def scope ( self, **settings: str ) -> None:

        self._ensure_()

        if not self.inside(): raise Fault(Code.CONFLICT, reason="database.scope.transaction")

        try: await self._driver.scope(self._connection, settings)
        except self._driver.failures as error: raise self._driver.translate(error) from error

        self._scoped.update(settings)

    def scoped ( self ) -> Mapping[str, str]:

        return dict(self._scoped)

    @asynccontextmanager
    async def transaction (
        self, isolation: Isolation = "read_committed", readonly: bool = False,
    ) -> AsyncIterator[Session]:

        self._ensure_()

        depth     = self._depth
        scoped    = dict(self._scoped)
        committed = False

        self._depth += 1

        try:

            async with self._driver.transaction(self._connection, isolation, readonly, depth): yield self

            committed = True

        except self._driver.failures as error: raise self._driver.translate(error) from error
        finally:

            self._depth -= 1

            if not committed or not depth: self._scoped = scoped

    def inside ( self ) -> bool:

        return self._depth > 0

    def raw ( self ) -> Any:

        self._ensure_()

        return self._connection

    def driver ( self ) -> Driver:

        return self._driver

    def _end_ ( self ) -> None:

        self._closed = True

    def _ensure_ ( self ) -> None:

        if self._closed: raise Fault(Code.CONFLICT, reason="database.session.closed")
        if asyncio.current_task() is not self._owner: raise Fault(Code.CONFLICT, reason="database.session.task")
