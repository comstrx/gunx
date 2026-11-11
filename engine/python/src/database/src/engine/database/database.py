from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any

from engine.error import Code, Fault
from engine.log import log
from .arch import Isolation, Record, SCHEMES, Statement
from .dialect import Dialect
from .driver import Driver
from .session import Session
from .sql import Sql

class Database:

    def __init__ ( self ) -> None:

        self._driver: Driver | None = None
        self._current: ContextVar[Session | None] = ContextVar("engine.database", default=None)
        self._statements: dict[str, str] = {}
        self._wait = 5.0

    def use ( self, driver: Driver ) -> Driver:

        self._driver = driver

        return driver

    def ready ( self ) -> bool:

        return self._driver is not None

    def driver ( self ) -> Driver:

        if self._driver is None: raise Fault(Code.UNAVAILABLE, "The database is not connected", "database.setup")

        return self._driver

    def dialect ( self ) -> Dialect:

        return self.driver().dialect

    async def connect ( self, url: str | None = None, wait: float = 5.0, **options: Any ) -> Driver:

        if self._driver is None:

            if url is None: raise Fault(Code.INTERNAL, reason="database.url")

            self._driver = self._pick_(url, **options)

        self._wait = wait

        try: await self._driver.connect()
        except self._driver.failures as error: raise self._driver.translate(error) from error

        log.info("database.connected", driver=self._driver.name)

        return self._driver

    async def close ( self ) -> None:

        driver, self._driver = self._driver, None

        if driver is None: return

        try: await driver.close()
        except driver.failures as error: log.warning("database.close", kind=type(error).__name__)

        log.info("database.closed", driver=driver.name)

    async def ping ( self, wait: float = 2.0 ) -> bool:

        return await self._driver.ping(wait) if self._driver is not None else False

    def current ( self ) -> Session | None:

        return self._current.get()

    @asynccontextmanager
    async def session ( self ) -> AsyncIterator[Session]:

        found = self._current.get()

        if found is not None:

            yield found

            return

        driver     = self.driver()
        connection = driver.take()

        if connection is None: connection = await self._lease_(driver)

        session = Session(driver, connection)
        token   = self._current.set(session)

        try: yield session
        finally:

            self._current.reset(token)

            if not driver.give(connection): await driver.release(connection)

    @asynccontextmanager
    async def transaction (
        self, isolation: Isolation = "read_committed", readonly: bool = False, **scope: str,
    ) -> AsyncIterator[Session]:

        async with self.session() as session, session.transaction(isolation, readonly):

            if scope: await session.scope(**scope)

            yield session

    def pair ( self, statement: Statement, args: Sequence[Any] = () ) -> tuple[str, Sequence[Any]]:

        if isinstance(statement, Sql): return statement.pair(self.dialect())

        return statement, args

    async def execute ( self, statement: Statement, *args: Any ) -> int:

        text, params = self.pair(statement, args)
        held = self._current.get()

        if held is not None: return await held.execute(text, *params)

        driver     = self.driver()
        connection = driver.take()

        if connection is None: connection = await self._lease_(driver)

        try: return await driver.execute(connection, text, driver.binds(params), None)
        except driver.failures as error: raise driver.translate(error) from error
        finally:

            if not driver.give(connection): await driver.release(connection)

    async def fetch ( self, statement: Statement, *args: Any ) -> list[Record]:

        text, params = self.pair(statement, args)
        held = self._current.get()

        if held is not None: return await held.fetch(text, *params)

        driver     = self.driver()
        connection = driver.take()

        if connection is None: connection = await self._lease_(driver)

        try: return await driver.fetch(connection, text, driver.binds(params), None)
        except driver.failures as error: raise driver.translate(error) from error
        finally:

            if not driver.give(connection): await driver.release(connection)

    async def one ( self, statement: Statement, *args: Any ) -> Record | None:

        rows = await self.fetch(statement, *args)

        return rows[0] if rows else None

    async def value ( self, statement: Statement, *args: Any ) -> Any:

        row = await self.one(statement, *args)

        return next(iter(row.values())) if row else None

    async def _lease_ ( self, driver: Driver ) -> Any:

        try: return await driver.acquire(self._wait)
        except driver.failures as error: raise driver.translate(error) from error

    async def many ( self, sql: str, rows: Sequence[Sequence[Any]] ) -> int:

        async with self.session() as session: return await session.many(sql, rows)

    def register ( self, name: str, sql: str ) -> None:

        self._statements[name] = sql

    def statement ( self, name: str ) -> str:

        found = self._statements.get(name)

        if found is None: raise Fault(Code.INTERNAL, reason="database.statement", errors={ "name": [name] })

        return found

    async def run ( self, name: str, *args: Any ) -> list[Record]:

        return await self.fetch(self.statement(name), *args)

    async def listen ( self, channel: str, handler: Callable[[str], Any] ) -> Any:

        driver = self.driver()

        try: return await driver.listen(channel, handler)
        except driver.failures as error: raise driver.translate(error) from error

    async def notify ( self, channel: str, payload: Mapping[str, Any] ) -> None:

        async with self.session() as session:

            try: await session.driver().notify(session.raw(), channel, payload)
            except session.driver().failures as error: raise session.driver().translate(error) from error

    async def advisory ( self, key: int, wait: bool = False ) -> bool:

        async with self.session() as session:

            try: return await session.driver().advisory(session.raw(), key, wait)
            except session.driver().failures as error: raise session.driver().translate(error) from error

    def describe ( self ) -> dict[str, Any]:

        if self._driver is None: return { "ready": False }

        return { "ready": True, "statements": len(self._statements), **self._driver.describe() }

    def _pick_ ( self, url: str, **options: Any ) -> Driver:

        scheme = url.partition("://")[0].lower() if "://" in url else "sqlite"
        family = SCHEMES.get(scheme.split("+", 1)[0])

        if family is None: raise Fault(Code.INTERNAL, reason="database.scheme", errors={ "scheme": [scheme[:32]] })

        if family == "postgres":

            from .postgresdriver import PostgresDriver

            return PostgresDriver(url, **options)

        if family == "sqlite":

            from .sqlitedriver import SqliteDriver

            return SqliteDriver(url.split("://", 1)[1] if "://" in url else url, **options)

        if family == "mysql":

            from .mysqldriver import MysqlDriver

            return MysqlDriver(url, **options)

        from .clickhousedriver import ClickhouseDriver

        return ClickhouseDriver(url, **options)
