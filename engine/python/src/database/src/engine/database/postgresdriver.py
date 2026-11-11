from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from typing import Any, ClassVar, cast, override

from engine.error import Code, Fault
from engine.parse import parse
from engine.json import json
from engine.log import log
from .arch import (
    CANCELLED, Connection, DENIED, HANDLES, Isolation, Live, LOOPBACK, Mode, MODES, NOT_NULL, POSTGRES_CHECK,
    POSTGRES_COLUMNS, POSTGRES_FAILURES, POSTGRES_FOREIGN, POSTGRES_INDEXES, POSTGRES_LOCKED, POSTGRES_RECYCLE,
    POSTGRES_SERIAL, POSTGRES_UNIQUE, STALE,
)
from .dialect import Dialect
from .driver import Driver
from .lane import Lane
from .listener import Listener
from .postgres import POSTGRES
from .vector import Vector
import asyncio, asyncpg, ssl

class PostgresDriver(Driver):

    name         = "postgres"
    dialect      : ClassVar[Dialect] = POSTGRES
    capabilities = POSTGRES.capabilities
    failures     : tuple[type[BaseException], ...] = POSTGRES_FAILURES

    def __init__ (
        self, url: str, min_size: int = 1, max_size: int = 8, application: str = "engine",
        search_path: str | None = None, statement_timeout: float = 30.0, ssl: Mode | None = None,
    ) -> None:

        self._url         = url
        self._min         = min_size
        self._max         = max_size
        self._application = application
        self._path        = search_path
        self._timeout     = statement_timeout
        self._ssl         = self.mode(url, ssl)
        self._lane: Lane | None = None
        self._handles: dict[int, dict[str, Any]] = {}

    @staticmethod
    def mode ( url: str, wanted: str | None ) -> Mode:

        if wanted:

            if wanted not in MODES: raise Fault(Code.INTERNAL, reason="database.ssl", errors={ "ssl": [wanted[:32]] })

            return cast("Mode", wanted)

        try: host = parse.url(url, schemes=("postgres", "postgresql")).host
        except Fault: host = ""

        return "disable" if not host or host in LOOPBACK else "verify-full"

    @override
    async def connect ( self ) -> None:

        if self._lane is not None: return

        settings = { "application_name": self._application, "statement_timeout": str(int(self._timeout * 1000)) }

        if self._path: settings["search_path"] = self._path

        async def opener () -> Connection:

            connection = await asyncpg.connect(
                self._url, timeout=self._timeout, command_timeout=self._timeout, server_settings=settings,
                ssl=self._ssl,
            )

            try: await self._init_(connection)
            except BaseException:

                connection.terminate()

                raise

            return connection

        async def closer ( connection: Any ) -> None:

            self._handles.pop(id(connection), None)

            await connection.close(timeout=5)

        lane = Lane(opener, closer, self._min, self._max, POSTGRES_RECYCLE)

        await lane.open()

        self._lane = lane

    @override
    async def close ( self ) -> None:

        lane, self._lane = self._lane, None

        self._handles = {}

        if lane is None: return

        try: await lane.close()
        except (*POSTGRES_FAILURES, ssl.SSLError) as error: log.warning("database.close", kind=type(error).__name__)

    @override
    async def ping ( self, wait: float = 2.0 ) -> bool:

        if self._lane is None: return False

        try:

            async with asyncio.timeout(wait):

                connection = await self._lane.acquire(wait)

                try: return bool(await connection.fetchval("SELECT 1") == 1)
                finally: await self._lane.release(connection)

        except (*POSTGRES_FAILURES, Fault): return False

    @override
    async def acquire ( self, wait: float = 5.0 ) -> Connection:

        return cast("Connection", await self._lane_().acquire(wait))

    @override
    async def release ( self, connection: Any ) -> None:

        await self._lane_().release(connection)

    @override
    def take ( self ) -> Any:

        return self._lane.take() if self._lane is not None else None

    @override
    def give ( self, connection: Any ) -> bool:

        return self._lane is not None and self._lane.give(connection)

    @override
    async def execute ( self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None ) -> int:

        held   = self._handles.get(id(connection))
        handle = held.get(sql) if held is not None else None

        if handle is None and params: handle = await self._handle_(connection, sql)
        if handle is None: status = await connection.execute(sql, *params, timeout=timeout)
        else:

            try:

                await handle.fetch(*params, timeout=timeout)

                status = handle.get_statusmsg()

            except STALE:

                self._forget_(connection, sql)

                status = await connection.execute(sql, *params, timeout=timeout)

        tail = status.rsplit(" ", 1)[-1]

        return int(tail) if tail.isdigit() else 0

    @override
    async def fetch (
        self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None,
    ) -> list[Mapping[str, Any]]:

        held   = self._handles.get(id(connection))
        handle = held.get(sql) if held is not None else None

        if handle is None: handle = await self._handle_(connection, sql)
        if handle is None: rows = await connection.fetch(sql, *params, timeout=timeout)
        else:

            try: rows = await handle.fetch(*params, timeout=timeout)
            except STALE:

                self._forget_(connection, sql)

                rows = await connection.fetch(sql, *params, timeout=timeout)

        return [dict(row.items()) for row in rows]

    @override
    async def many (
        self, connection: Any, sql: str, rows: Sequence[Sequence[Any]], timeout: float | None = None,
    ) -> int:

        await connection.executemany(sql, rows, timeout=timeout)

        return len(rows)

    @override
    @asynccontextmanager
    async def transaction (
        self, connection: Any, isolation: Isolation = "read_committed", readonly: bool = False, depth: int = 0,
    ) -> AsyncIterator[None]:

        async with connection.transaction(isolation=isolation, readonly=readonly): yield

    @override
    def bind ( self, value: Any ) -> Any:

        return value.literal() if isinstance(value, Vector) else value

    @override
    def binds ( self, params: Sequence[Any] ) -> list[Any]:

        return [value.literal() if isinstance(value, Vector) else value for value in params]

    @override
    def translate ( self, error: BaseException ) -> Fault:

        return PostgresDriver.fault(error)

    @override
    async def columns ( self, connection: Any ) -> Live:

        found: Live = {}

        for row in await connection.fetch(POSTGRES_COLUMNS):

            declared = str(row["udt_name"] if row["data_type"] == "USER-DEFINED" else row["data_type"])
            kind     = POSTGRES.reverse.get(declared, declared)

            found.setdefault(str(row["table_name"]), {})[str(row["column_name"])] = {
                "kind": kind, "nullable": row["is_nullable"] == "YES", "default": row["column_default"],
            }

        return found

    @override
    async def indexes ( self, connection: Any ) -> dict[str, set[str]]:

        found: dict[str, set[str]] = {}

        for row in await connection.fetch(POSTGRES_INDEXES):

            found.setdefault(str(row["tablename"]), set()).add(str(row["indexname"]))

        return found

    @override
    async def copy ( self, connection: Any, table: str, columns: Sequence[str], rows: Sequence[Sequence[Any]] ) -> int:

        await connection.copy_records_to_table(table, records=rows, columns=list(columns))

        return len(rows)

    @override
    async def scope ( self, connection: Any, settings: Mapping[str, str] ) -> None:

        for name, value in settings.items():

            await connection.execute("SELECT set_config($1, $2, true)", f"app.{name}", value)

    @override
    async def listen ( self, channel: str, handler: Callable[[str], Any] ) -> Listener:

        lane       = self._lane_()
        connection = await lane.acquire(self._timeout)

        async def relay ( _: Any, __: Any, ___: Any, payload: object ) -> None:

            result = handler(str(payload))

            if asyncio.iscoroutine(result): await result

        try: await connection.add_listener(channel, relay)
        except BaseException:

            await lane.release(connection)

            raise

        return Listener(lane, connection, channel, relay)

    @override
    async def notify ( self, connection: Any, channel: str, payload: Mapping[str, Any] ) -> None:

        await connection.execute("SELECT pg_notify($1, $2)", channel, json.dumps(payload))

    @override
    async def advisory ( self, connection: Any, key: int, wait: bool = False ) -> bool:

        if wait:

            await connection.execute("SELECT pg_advisory_xact_lock($1)", key)

            return True

        return bool(await connection.fetchval("SELECT pg_try_advisory_xact_lock($1)", key))

    @override
    def describe ( self ) -> dict[str, object]:

        lane = self._lane
        size = { "size": lane.size(), "idle": lane.idle() } if lane is not None else {}
        kept = sum(len(held) for held in self._handles.values())

        return {
            **super().describe(), "application": self._application, "max": self._max, "ssl": self._ssl, **size,
            "handles": kept,
        }

    async def _handle_ ( self, connection: Any, sql: str ) -> Any:

        key  = id(connection)
        held = self._handles.get(key)

        if held is None: held = self._handles[key] = {}

        found = held.get(sql)

        if found is None and len(held) < HANDLES: found = held[sql] = await connection.prepare(sql)

        return found

    def _forget_ ( self, connection: Any, sql: str ) -> None:

        held = self._handles.get(id(connection))

        if held is not None: held.pop(sql, None)

    def _lane_ ( self ) -> Lane:

        if self._lane is None: raise Fault(Code.UNAVAILABLE, "The database is not connected", "database.setup")

        return self._lane

    async def _init_ ( self, connection: Connection ) -> None:

        await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await connection.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

    @staticmethod
    def fault ( error: BaseException ) -> Fault:

        code   = getattr(error, "sqlstate", None)
        detail = PostgresDriver._detail_(error)

        if code == POSTGRES_UNIQUE: return Fault(Code.CONFLICT, "Already exists", "database.unique", detail)
        if code == POSTGRES_FOREIGN:

            return Fault(Code.CONFLICT, "Referenced record is missing", "database.reference", detail)

        if code == POSTGRES_CHECK:

            return Fault(Code.VALIDATION, "A constraint refused the data", "database.check", detail)

        if code == NOT_NULL: return Fault(Code.VALIDATION, "A required column is empty", "database.required", detail)
        if code in POSTGRES_SERIAL:

            return Fault(Code.CONFLICT, "Retry the transaction", "database.serialization", retry_after=0.05)

        if code in POSTGRES_LOCKED:

            return Fault(Code.LOCKED, "A lock could not be taken", "database.lock", retry_after=0.1)

        if code in DENIED: return Fault(Code.FORBIDDEN, "A row policy refused it", "database.policy", detail)
        if code in CANCELLED or isinstance(error, TimeoutError):

            return Fault(Code.TIMEOUT, reason="database.timeout", unknown=True)

        if isinstance(error, asyncpg.PostgresSyntaxError | asyncpg.UndefinedTableError | asyncpg.UndefinedColumnError):

            return Fault(Code.INTERNAL, str(error).split("\n")[0], "database.sql")

        if isinstance(error, asyncpg.DataError | asyncpg.exceptions.InvalidTextRepresentationError):

            query = str(getattr(error, "query", "") or "")[:300]

            first = str(error).split("\n")[0][:200]

            log.debug("database.refused", kind=type(error).__name__, detail=first, query=query)

            return Fault(Code.VALIDATION, "A value does not fit its column", "database.value", detail)

        log.warning("database.failed", kind=type(error).__name__, code=code)

        return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

    @staticmethod
    def _detail_ ( error: BaseException ) -> dict[str, list[str]] | None:

        constraint = getattr(error, "constraint_name", None)
        column     = getattr(error, "column_name", None)

        if column: return { str(column): ["is invalid"] }
        if constraint: return { "constraint": [str(constraint)] }

        return None
