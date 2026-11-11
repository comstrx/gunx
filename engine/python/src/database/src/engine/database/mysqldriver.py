from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from typing import Any, ClassVar, TYPE_CHECKING, override
from uuid import UUID

from engine.date import DateTime, date
from engine.error import Code, Fault
from engine.parse import parse
from engine.json import json
from .arch import (
    Isolation, JSON, LEVELS, Live, MODE, MYSQL_CHECK, MYSQL_COLUMNS, MYSQL_FOREIGN, MYSQL_INDEXES, MYSQL_LOCKED,
    MYSQL_SERIAL, MYSQL_SQL, MYSQL_UNIQUE, REQUIRED,
)
from .dialect import Dialect
from .driver import Driver
from .mysql import MYSQL
from .vector import Vector
import inspect

if TYPE_CHECKING:

    import asyncmy

class MysqlDriver(Driver):

    name         = "mysql"
    dialect      : ClassVar[Dialect] = MYSQL
    capabilities = MYSQL.capabilities

    def __init__ (
        self, url: str, min_size: int = 1, max_size: int = 8, wait: float = 5.0, charset: str = "utf8mb4",
        ssl: Any = None, application: str = "engine",
    ) -> None:

        self._url         = url
        self._min         = min_size
        self._max         = max_size
        self._wait        = wait
        self._charset     = charset
        self._ssl         = ssl
        self._application = application
        self._pool: asyncmy.Pool | None = None

    @override
    async def connect ( self ) -> None:

        if self._pool is not None: return

        import asyncmy
        from asyncmy.cursors import DictCursor

        self.failures = (asyncmy.errors.MySQLError, OSError, TimeoutError)

        address = parse.url(self._url, schemes=("mysql",))

        self._pool = await asyncmy.create_pool(
            host=address.host, port=address.port or 3306, user=address.user or "",
            password=address.password or "", db=address.path.strip("/") or None, minsize=self._min,
            maxsize=self._max, autocommit=True, charset=self._charset, connect_timeout=self._wait,
            cursor_cls=DictCursor, ssl=self._ssl, program_name=self._application,
            init_command=f"SET SESSION sql_mode = '{MODE}', time_zone = '+00:00'",
        )

    @override
    async def close ( self ) -> None:

        pool, self._pool = self._pool, None

        if pool is None: return

        pool.close()

        await pool.wait_closed()

    @override
    async def ping ( self, wait: float = 2.0 ) -> bool:

        if self._pool is None: return False

        try:

            connection = await self.acquire(wait)

            try: return await self.fetch(connection, "SELECT 1 AS one", ()) == [{ "one": 1 }]
            finally: await self.release(connection)

        except self.failures: return False

    @override
    async def acquire ( self, wait: float = 5.0 ) -> Any:

        if self._pool is None: raise Fault(Code.UNAVAILABLE, "The database is not connected", "database.setup")

        return await self._pool.acquire()

    @override
    async def release ( self, connection: Any ) -> None:

        if self._pool is None: return

        result = self._pool.release(connection)

        if inspect.isawaitable(result): await result

    @override
    async def execute ( self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None ) -> int:

        async with connection.cursor() as cursor: return int(await cursor.execute(sql, tuple(params)) or 0)

    @override
    async def fetch (
        self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None,
    ) -> list[Mapping[str, Any]]:

        async with connection.cursor() as cursor:

            await cursor.execute(sql, tuple(params))

            rows  = await cursor.fetchall()
            jsons = { column[0] for column in (cursor.description or ()) if column[1] == JSON }

        return [{ key: self._decode_(key in jsons, value) for key, value in row.items() } for row in rows]

    @override
    async def many (
        self, connection: Any, sql: str, rows: Sequence[Sequence[Any]], timeout: float | None = None,
    ) -> int:

        async with connection.cursor() as cursor: await cursor.executemany(sql, [tuple(row) for row in rows])

        return len(rows)

    @override
    @asynccontextmanager
    async def transaction (
        self, connection: Any, isolation: Isolation = "read_committed", readonly: bool = False, depth: int = 0,
    ) -> AsyncIterator[None]:

        if depth:

            async with super().transaction(connection, isolation, readonly, depth): yield

            return

        await self.execute(connection, f"SET TRANSACTION ISOLATION LEVEL {LEVELS[isolation]}", ())
        await self.execute(connection, "START TRANSACTION READ ONLY" if readonly else "START TRANSACTION", ())

        try: yield
        except BaseException:

            await connection.rollback()

            raise

        await connection.commit()

    @override
    def bind ( self, value: Any ) -> Any:

        if isinstance(value, bool): return int(value)
        if isinstance(value, DateTime): return date.utc(value).replace(tzinfo=None)
        if isinstance(value, dict | list | tuple): return json.dumps(value)
        if isinstance(value, UUID): return str(value)
        if isinstance(value, Vector): MYSQL.ensure("vector")

        return value

    @override
    def translate ( self, error: BaseException ) -> Fault:

        args: tuple[Any, ...] = getattr(error, "args", ())
        number = args[0] if args and isinstance(args[0], int) else 0
        text   = str(args[1] if len(args) > 1 else error).split("\n")[0]
        detail = { "constraint": [text[:120]] }

        if number in MYSQL_UNIQUE: return Fault(Code.CONFLICT, "Already exists", "database.unique", detail)
        if number in MYSQL_FOREIGN:

            return Fault(Code.CONFLICT, "Referenced record is missing", "database.reference", detail)

        if number in MYSQL_CHECK:

            return Fault(Code.VALIDATION, "A constraint refused the data", "database.check", detail)

        if number in REQUIRED: return Fault(Code.VALIDATION, "A required column is empty", "database.required", detail)
        if number in MYSQL_SERIAL:

            return Fault(Code.CONFLICT, "Retry the transaction", "database.serialization", retry_after=0.05)
        if number in MYSQL_LOCKED:

            return Fault(Code.LOCKED, "A lock could not be taken", "database.lock", retry_after=0.1)
        if number in MYSQL_SQL: return Fault(Code.INTERNAL, text, "database.sql")
        if isinstance(error, TimeoutError): return Fault(Code.TIMEOUT, reason="database.timeout", unknown=True)

        return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

    @override
    async def columns ( self, connection: Any ) -> Live:

        found: Live = {}

        for row in await self.fetch(connection, MYSQL_COLUMNS, ()):

            declared = str(row["DATA_TYPE"]).lower()

            found.setdefault(str(row["TABLE_NAME"]), {})[str(row["COLUMN_NAME"])] = {
                "kind"    : MYSQL.reverse.get(declared, declared),
                "nullable": row["IS_NULLABLE"] == "YES",
                "default" : row["COLUMN_DEFAULT"],
            }

        return found

    @override
    async def indexes ( self, connection: Any ) -> dict[str, set[str]]:

        found: dict[str, set[str]] = {}

        for row in await self.fetch(connection, MYSQL_INDEXES, ()):

            found.setdefault(str(row["TABLE_NAME"]), set()).add(str(row["INDEX_NAME"]))

        return found

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), "application": self._application, "max": self._max }

    def _decode_ ( self, is_json: bool, value: Any ) -> Any:

        if is_json and isinstance(value, str | bytes): return json.loads(value)

        return value
