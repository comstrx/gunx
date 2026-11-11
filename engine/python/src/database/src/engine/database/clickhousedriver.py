from collections.abc import Mapping, Sequence
from typing import Any, ClassVar, TYPE_CHECKING, override

from engine.error import Code, Fault
from engine.json import json
from .arch import BUSY, CLICKHOUSE_COLUMNS, CLICKHOUSE_SQL, CODE, Live, TIMEOUT
from .clickhouse import CLICKHOUSE
from .dialect import Dialect
from .driver import Driver
from .vector import Vector

if TYPE_CHECKING:

    from clickhouse_connect.driver.asyncclient import AsyncClient

class ClickhouseDriver(Driver):

    name         = "clickhouse"
    dialect      : ClassVar[Dialect] = CLICKHOUSE
    capabilities = CLICKHOUSE.capabilities

    def __init__ (
        self, url: str, wait: float = 5.0, settings: Mapping[str, Any] | None = None, application: str = "engine",
    ) -> None:

        self._url         = url
        self._wait        = wait
        self._settings    = dict(settings or {})
        self._application = application
        self._client: AsyncClient | None = None

    @override
    async def connect ( self ) -> None:

        if self._client is not None: return

        import clickhouse_connect
        from clickhouse_connect.driver import exceptions

        self.failures = (exceptions.ClickHouseError, OSError, TimeoutError)

        self._client = await clickhouse_connect.get_async_client(
            dsn=self._url, connect_timeout=int(self._wait), send_receive_timeout=int(self._wait * 6),
            client_name=self._application, settings=self._settings,
        )

    @override
    async def close ( self ) -> None:

        client, self._client = self._client, None

        if client is not None: await client.close()

    @override
    async def ping ( self, wait: float = 2.0 ) -> bool:

        if self._client is None: return False

        try: return bool(await self._client.ping(timeout=wait))
        except self.failures: return False

    @override
    async def acquire ( self, wait: float = 5.0 ) -> Any:

        if self._client is None: raise Fault(Code.UNAVAILABLE, "The database is not connected", "database.setup")

        return self._client

    @override
    async def execute ( self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None ) -> int:

        result = await connection.command(self._text_(sql, params), parameters=list(params) or None)

        return int(getattr(result, "written_rows", 0) or 0)

    @override
    async def fetch (
        self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None,
    ) -> list[Mapping[str, Any]]:

        result = await connection.query(self._text_(sql, params), parameters=list(params) or None)
        names  = list(result.column_names)

        return [dict(zip(names, row, strict=True)) for row in result.result_rows]

    @override
    def bind ( self, value: Any ) -> Any:

        if isinstance(value, Vector): return list(value.values)
        if isinstance(value, dict | list | tuple): return json.dumps(value)

        return value

    @override
    def translate ( self, error: BaseException ) -> Fault:

        text  = str(error).split("\n")[0]
        found = CODE.search(text)
        code  = int(found.group(1)) if found else 0

        if code in CLICKHOUSE_SQL: return Fault(Code.INTERNAL, text[:200], "database.sql")
        if code in TIMEOUT or isinstance(error, TimeoutError):

            return Fault(Code.TIMEOUT, reason="database.timeout", unknown=True)

        if code in BUSY: return Fault(Code.UNAVAILABLE, "The database is busy", "database.busy", retry_after=0.5)

        return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

    @override
    async def columns ( self, connection: Any ) -> Live:

        found: Live = {}

        for row in await self.fetch(connection, CLICKHOUSE_COLUMNS, ()):

            declared = str(row["type"])
            nullable = declared.startswith("Nullable(")
            inner    = declared[9:-1] if nullable else declared
            base     = inner if inner.startswith("Array(") else inner.split("(", 1)[0]

            found.setdefault(str(row["table"]), {})[str(row["name"])] = {
                "kind"    : CLICKHOUSE.reverse.get(base, base),
                "nullable": nullable,
                "default" : row["default_expression"] or None,
            }

        return found

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), "application": self._application }

    def _text_ ( self, sql: str, params: Sequence[Any] ) -> str:

        return sql if params else sql.replace("%%", "%")
