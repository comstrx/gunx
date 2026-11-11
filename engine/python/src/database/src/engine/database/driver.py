from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from typing import Any, ClassVar, override

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import Isolation, Live, Record
from .dialect import Dialect

class Driver(Adapter):

    family       : ClassVar[str] = "database"
    dialect      : ClassVar[Dialect]
    failures     : tuple[type[BaseException], ...] = (OSError, TimeoutError)

    async def connect ( self ) -> None:

        raise Fault(Code.INTERNAL, reason="database.abstract")

    async def ping ( self, wait: float = 2.0 ) -> bool:

        return False

    async def acquire ( self, wait: float = 5.0 ) -> Any:

        raise Fault(Code.INTERNAL, reason="database.abstract")

    async def release ( self, connection: Any ) -> None:

        return None

    def take ( self ) -> Any:

        return None

    def give ( self, connection: Any ) -> bool:

        return False

    async def execute ( self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None ) -> int:

        raise Fault(Code.INTERNAL, reason="database.abstract")

    async def fetch (
        self, connection: Any, sql: str, params: Sequence[Any], timeout: float | None = None,
    ) -> list[Record]:

        raise Fault(Code.INTERNAL, reason="database.abstract")

    async def many (
        self, connection: Any, sql: str, rows: Sequence[Sequence[Any]], timeout: float | None = None,
    ) -> int:

        for row in rows: await self.execute(connection, sql, row, timeout)

        return len(rows)

    @asynccontextmanager
    async def transaction (
        self, connection: Any, isolation: Isolation = "read_committed", readonly: bool = False, depth: int = 0,
    ) -> AsyncIterator[None]:

        if not self.dialect.can("transaction"):

            yield

            return

        if depth:

            self.dialect.ensure("savepoint")

            name = f"sp{depth}"

            await self.execute(connection, f"SAVEPOINT {name}", ())

            try: yield
            except BaseException:

                await self.execute(connection, f"ROLLBACK TO SAVEPOINT {name}", ())

                raise

            await self.execute(connection, f"RELEASE SAVEPOINT {name}", ())

            return

        await self.execute(connection, self.begin(isolation, readonly), ())

        try: yield
        except BaseException:

            await self.execute(connection, "ROLLBACK", ())

            raise

        await self.execute(connection, "COMMIT", ())

    def begin ( self, isolation: Isolation, readonly: bool ) -> str:

        return "BEGIN"

    def bind ( self, value: Any ) -> Any:

        return value

    def binds ( self, params: Sequence[Any] ) -> list[Any]:

        return [self.bind(value) for value in params]

    def translate ( self, error: BaseException ) -> Fault:

        return Fault(Code.UNAVAILABLE, "The database is unavailable", "database.connection", unknown=True)

    async def columns ( self, connection: Any ) -> Live:

        raise Fault(Code.INTERNAL, reason="database.abstract")

    async def indexes ( self, connection: Any ) -> dict[str, set[str]]:

        return {}

    async def copy ( self, connection: Any, table: str, columns: Sequence[str], rows: Sequence[Sequence[Any]] ) -> int:

        self.dialect.ensure("copy")

        return 0

    async def scope ( self, connection: Any, settings: Mapping[str, str] ) -> None:

        self.dialect.ensure("scope")

    async def listen ( self, channel: str, handler: Callable[[str], Any] ) -> Any:

        self.dialect.ensure("listen")

    async def notify ( self, connection: Any, channel: str, payload: Mapping[str, Any] ) -> None:

        self.dialect.ensure("listen")

    async def advisory ( self, connection: Any, key: int, wait: bool = False ) -> bool:

        self.dialect.ensure("advisory")

        return False

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), "dialect": self.dialect.name }
