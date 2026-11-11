from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any, ClassVar, override
from uuid import UUID

from engine.date import DateTime, Day, date
from engine.error import Code, Fault
from engine.json import json
from .arch import Isolation, Live, MEMORY, SQLITE_FAILURES, SQLITE_INDEXES, SQLITE_UNIQUE, TABLES, WRITES
from .dialect import Dialect
from .driver import Driver
from .sqlite import SQLITE
from .vector import Vector
import apsw, asyncio

class SqliteDriver(Driver):

    name         = "sqlite"
    dialect      : ClassVar[Dialect] = SQLITE
    capabilities = SQLITE.capabilities
    failures     : tuple[type[BaseException], ...] = SQLITE_FAILURES

    def __init__ ( self, path: str, size: int = 4, wait: float = 5.0, synchronous: str = "FULL" ) -> None:

        self._path        = path or MEMORY
        self._size        = 1 if self._path == MEMORY else max(1, size)
        self._wait        = wait
        self._synchronous = synchronous
        self._pool: asyncio.Queue[apsw.AsyncConnection] | None = None
        self._all: list[apsw.AsyncConnection] = []

    @override
    async def connect ( self ) -> None:

        if self._pool is not None: return

        pool: asyncio.Queue[apsw.AsyncConnection] = asyncio.Queue(self._size)

        for _ in range(self._size):

            connection = await apsw.Connection.as_async(self._path)

            await connection.set_busy_timeout(int(self._wait * 1000))

            if self._path != MEMORY: await connection.pragma("journal_mode", "wal")

            await connection.pragma("synchronous", self._synchronous)
            await connection.pragma("foreign_keys", 1)

            self._all.append(connection)
            pool.put_nowait(connection)

        self._pool = pool

    @override
    async def close ( self ) -> None:

        pool, self._pool = self._pool, None

        if pool is None: return

        for connection in self._all: await connection.aclose()

        self._all = []

    @override
    async def ping ( self, wait: float = 2.0 ) -> bool:

        if self._pool is None: return False

        try:

            connection = await self.acquire(wait)

            try: return await self.fetch(connection, "SELECT 1 AS one", ()) == [{ "one": 1 }]
            finally: await self.release(connection)

        except SQLITE_FAILURES: return False

    @override
    async def acquire ( self, wait: float = 5.0 ) -> apsw.AsyncConnection:

        if self._pool is None: raise Fault(Code.UNAVAILABLE, "The database is not connected", "database.setup")

        try: return await asyncio.wait_for(self._pool.get(), wait)
        except TimeoutError as error:

            raise Fault(Code.UNAVAILABLE, "Every connection is busy", "database.pool", retry_after=0.1) from error

    @override
    async def release ( self, connection: Any ) -> None:

        if self._pool is not None: self._pool.put_nowait(connection)

    @override
    async def execute ( self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None ) -> int:

        cursor = await self._run_(connection, sql, tuple(params), timeout)

        await cursor.fetchall()

        return await connection.changes() if sql.lstrip()[:7].upper().startswith(WRITES) else 0

    @override
    async def fetch (
        self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None,
    ) -> list[Mapping[str, Any]]:

        cursor = await self._run_(connection, sql, tuple(params), timeout)

        try: meta = cursor.description_full
        except apsw.ExecutionCompleteError: return []

        names = [column[0] for column in meta]
        kinds = [column[1] for column in meta]

        return [
            { name: self._decode_(kind, value) for name, kind, value in zip(names, kinds, row, strict=True) }
            for row in await cursor.fetchall()
        ]

    @override
    async def many (
        self, connection: Any, sql: str, rows: Sequence[Sequence[Any]], timeout: float | None = None,
    ) -> int:

        cursor = await connection.executemany(sql, [tuple(row) for row in rows])

        await cursor.fetchall()

        return len(rows)

    @override
    def begin ( self, isolation: Isolation, readonly: bool ) -> str:

        return "BEGIN" if readonly else "BEGIN IMMEDIATE"

    @override
    def bind ( self, value: Any ) -> Any:

        if isinstance(value, bool): return int(value)
        if isinstance(value, DateTime): return date.utc(value).strftime("%Y-%m-%d %H:%M:%S.%f")
        if isinstance(value, Day): return value.isoformat()
        if isinstance(value, dict | list | tuple): return json.dumps(value)
        if isinstance(value, Decimal | UUID): return str(value)
        if isinstance(value, Vector): SQLITE.ensure("vector")

        return value

    @override
    def translate ( self, error: BaseException ) -> Fault:

        if isinstance(error, apsw.ConstraintError):

            name   = str(apsw.mapping_extended_result_codes.get(int(getattr(error, "extendedresult", 0)), ""))
            detail = { "constraint": [str(error).split(": ", 1)[-1][:120]] }

            if name in SQLITE_UNIQUE: return Fault(Code.CONFLICT, "Already exists", "database.unique", detail)
            if name == "SQLITE_CONSTRAINT_FOREIGNKEY":

                return Fault(Code.CONFLICT, "Referenced record is missing", "database.reference", detail)

            if name == "SQLITE_CONSTRAINT_NOTNULL":

                return Fault(Code.VALIDATION, "A required column is empty", "database.required", detail)

            return Fault(Code.VALIDATION, "A constraint refused the data", "database.check", detail)

        if isinstance(error, apsw.BusyError | apsw.LockedError):

            return Fault(Code.LOCKED, "A lock could not be taken", "database.lock", retry_after=0.1)

        if isinstance(error, apsw.SQLError): return Fault(Code.INTERNAL, str(error).split("\n")[0], "database.sql")
        if isinstance(error, TimeoutError): return Fault(Code.TIMEOUT, reason="database.timeout", unknown=True)
        if isinstance(error, apsw.InterruptError): return Fault(Code.TIMEOUT, reason="database.timeout", unknown=True)

        return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

    @override
    async def columns ( self, connection: Any ) -> Live:

        found: Live = {}

        for table in await self.fetch(connection, TABLES, ()):

            name = str(table["name"])

            for row in await self.fetch(connection, f"PRAGMA table_info({SQLITE.ident(name)})", ()):

                declared = str(row["type"] or "").split("(", 1)[0].lower()

                found.setdefault(name, {})[str(row["name"])] = {
                    "kind"    : SQLITE.reverse.get(declared, declared),
                    "nullable": not row["notnull"] and not row["pk"],
                    "default" : row["dflt_value"],
                }

        return found

    @override
    async def indexes ( self, connection: Any ) -> dict[str, set[str]]:

        found: dict[str, set[str]] = {}

        for row in await self.fetch(connection, SQLITE_INDEXES, ()):

            found.setdefault(str(row["tbl_name"]), set()).add(str(row["name"]))

        return found

    @override
    def describe ( self ) -> dict[str, object]:

        idle = self._pool.qsize() if self._pool is not None else 0

        return { **super().describe(), "path": self._path, "size": self._size, "idle": idle }

    async def _run_ (
        self, connection: apsw.AsyncConnection, sql: str, params: tuple[Any, ...], timeout: float | None,
    ) -> apsw.AsyncCursor:

        if timeout is None: return await connection.execute(sql, params)

        try:

            async with asyncio.timeout(timeout): return await connection.execute(sql, params)

        except TimeoutError:

            connection.interrupt()

            raise

    def _decode_ ( self, kind: str | None, value: Any ) -> Any:

        if value is None or kind is None: return value

        base = kind.split("(", 1)[0].lower()

        if base == "boolean": return bool(value)
        if base == "jsonb" and isinstance(value, str): return json.loads(value)
        if base == "timestamp" and isinstance(value, str): return date.parse(value)
        if base == "date" and isinstance(value, str): return date.day(value)
        if base == "numeric" and isinstance(value, int | float): return Decimal(str(value))

        return value
